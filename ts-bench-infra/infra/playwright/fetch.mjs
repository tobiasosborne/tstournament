#!/usr/bin/env node
// Headed-Chromium PDF fetcher for ts-bench-infra.
//
// Strategy: each paper is identified by its DOI. The fetcher navigates the
// browser to https://doi.org/<DOI>, waits for the publisher landing page to
// settle, then extracts the actual PDF URL from the page itself — primarily
// from the standard `<meta name="citation_pdf_url">` tag (which Google
// Scholar relies on; ~most publishers populate it), with per-publisher
// fallbacks for the rest. We never hardcode publisher PDF URL patterns.
//
// Setup (Playwright is reused from a sibling project — no install needed):
//
//   node infra/playwright/fetch.mjs              # all papers
//   node infra/playwright/fetch.mjs --problem 01-fft
//   node infra/playwright/fetch.mjs --dry-run
//
// Run with the TIB VPN active. The user clicks Cloudflare / SSO challenges
// in the visible browser; the script polls the landing page until the
// citation_pdf_url meta tag (or fallback) appears.

import { chromium } from 'playwright';
import {
  writeFileSync, existsSync, mkdirSync, readFileSync, statSync,
  openSync, readSync, closeSync,
} from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '..', '..');
const CONFIG     = JSON.parse(readFileSync(resolve(__dirname, 'sources.config.json'), 'utf8'));
const PROFILE    = resolve(__dirname, '.browser-profile');

// Per-paper landing-page poll budget.
const POLL_INTERVAL_MS  = 5_000;
const POLL_MAX_ATTEMPTS = 60;     // 5 min budget per paper

function parseArgs(argv) {
  const args = { problem: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--problem')        args.problem = argv[++i];
    else if (a === '--dry-run')   args.dryRun  = true;
    else if (a === '--help' || a === '-h') {
      console.log('usage: node fetch.mjs [--problem NN-name] [--dry-run]');
      process.exit(0);
    } else { console.error(`unknown arg: ${a}`); process.exit(2); }
  }
  return args;
}

function targetPath(paper) {
  return resolve(REPO_ROOT, 'problems', paper.problem, 'sources', paper.file);
}

function alreadyValid(path) {
  if (!existsSync(path)) return false;
  if (statSync(path).size < 10_000) return false;
  const fd = openSync(path, 'r'); const buf = Buffer.alloc(5);
  readSync(fd, buf, 0, 5, 0); closeSync(fd);
  return buf.toString() === '%PDF-';
}

// ── Find PDF URL on the current page ───────────────────────────────────────

async function findPdfUrl(page) {
  // 1. citation_pdf_url meta tag — the "Google Scholar" standard.
  const cit = await page.evaluate(() => {
    const m = document.querySelector('meta[name="citation_pdf_url"]');
    return m ? m.getAttribute('content') : null;
  });
  if (cit) return cit;

  // 2. <link rel="alternate" type="application/pdf"> — used by some.
  const linkTag = await page.evaluate(() => {
    const l = document.querySelector('link[rel="alternate"][type="application/pdf"]');
    return l ? l.getAttribute('href') : null;
  });
  if (linkTag) return new URL(linkTag, document.baseURI).href;

  // 3. Springer's "download PDF" button.
  const springer = await page.evaluate(() => {
    const a = document.querySelector('a[data-track-action="download pdf"]')
           || document.querySelector('a[data-test="pdf-link"]')
           || document.querySelector('a.c-pdf-download__link');
    return a ? a.href : null;
  });
  if (springer) return springer;

  // 4. ScienceDirect / Elsevier "Download PDF" link.
  const elsevier = await page.evaluate(() => {
    const a = document.querySelector('a.PdfEmbed__download')
           || document.querySelector('a[aria-label*="PDF" i]')
           || document.querySelector('a.pdf-download-btn-link');
    return a ? a.href : null;
  });
  if (elsevier) return elsevier;

  // 5. IEEE Xplore: stamp.jsp?tp=&arnumber=... link, or PDF-aria button.
  const ieee = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/stamp/stamp.jsp"]')
           || document.querySelector('a.stats-document-lh-action-downloadPdf')
           || document.querySelector('xpl-document-banner a[href*="stamp"]');
    return a ? a.href : null;
  });
  if (ieee) return ieee;

  // 6. ACM Digital Library: /doi/pdf/... link (often hidden behind a button).
  const acm = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/doi/pdf/"]')
           || document.querySelector('a.btn--icon-with-icon[href*="pdf"]');
    return a ? a.href : null;
  });
  if (acm) return acm;

  // 7. Cambridge Core: /core/services/aop-cambridge-core/content/view/... PDF.
  const cambridge = await page.evaluate(() => {
    const a = document.querySelector('a.export-citation-product-pdf')
           || document.querySelector('a[href*="/services/aop-cambridge-core"][href*=".pdf"]')
           || document.querySelector('a[data-pdf-link]');
    return a ? a.href : null;
  });
  if (cambridge) return cambridge;

  // 8. Generic text-based: any <a> whose visible text starts with "PDF"
  //    (catches "PDF", "View PDF", "Download PDF", "Full text PDF", …).
  const textBased = await page.evaluate(() => {
    const as = Array.from(document.querySelectorAll('a[href]'));
    const hit = as.find(a => {
      const t = (a.textContent || '').trim();
      return /^(view\s+|download\s+|full[-\s]?text\s+|open\s+)?pdf\b/i.test(t)
          && !/javascript:/i.test(a.href);
    });
    return hit ? hit.href : null;
  });
  if (textBased) return textBased;

  // 9. Generic href-based: any <a> whose href ends in .pdf (last resort).
  const generic = await page.evaluate(() => {
    const as = Array.from(document.querySelectorAll('a[href]'));
    const hit = as.find(a => /\.pdf(\?|#|$)/i.test(a.href));
    return hit ? hit.href : null;
  });
  if (generic) return generic;

  return null;
}

// ── Download a PDF from a known URL through the browser context ────────────

function decodeHtmlEntities(url) {
  return url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g,  '<')
    .replace(/&gt;/g,  '>')
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g, "'");
}

async function downloadPdf(page, pdfUrl, paper, outPath) {
  const cleaned = decodeHtmlEntities(pdfUrl);

  // Strategy A — navigate the visible browser to the PDF URL and capture
  // the first response with `Content-Type: application/pdf`. This works for
  // viewer pages that embed the PDF in an iframe (IEEE Xplore) and for
  // direct-PDF endpoints (Springer link, AMS Math. Comp. /pdf/ URLs).
  // Strategy B — if the page triggers a download (Content-Disposition:
  // attachment), save the download.

  let pdfBody = null;
  const onResponse = async (response) => {
    if (pdfBody) return;
    const ct = response.headers()['content-type'] || '';
    if (!/application\/pdf/i.test(ct)) return;
    try {
      const body = await response.body();
      if (body.length >= 5 && body.slice(0, 5).toString() === '%PDF-') {
        pdfBody = body;
      }
    } catch { /* ignore — body may not be available for redirects */ }
  };
  const onDownload = async (download) => {
    if (pdfBody) return;
    try {
      const path = await download.path();
      if (path) {
        const data = readFileSync(path);
        if (data.length >= 5 && data.slice(0, 5).toString() === '%PDF-') {
          pdfBody = data;
        }
      }
    } catch { /* ignore */ }
  };
  page.on('response', onResponse);
  page.on('download', onDownload);

  try {
    await page.goto(cleaned, { waitUntil: 'load', timeout: 60_000 })
      .catch(() => { /* viewer pages may abort the main frame; that's OK */ });
    // Settle: give iframes time to fire their requests.
    for (let i = 0; i < 10; i++) {
      if (pdfBody) break;
      await new Promise((res) => setTimeout(res, 1_000));
    }
  } finally {
    page.off('response', onResponse);
    page.off('download', onDownload);
  }

  if (pdfBody) {
    writeFileSync(outPath, pdfBody);
    return { ok: true, body: pdfBody, pdfUrl: cleaned };
  }

  // Strategy C — fall back to a direct request (works for AMS open Math.
  // Comp. links, Springer /content/pdf/...). Use the previous landing
  // page as Referer.
  try {
    const resp = await page.request.get(cleaned, {
      timeout: 90_000,
      headers: { Referer: page.url() },
    });
    if (resp.status() === 200) {
      const body = await resp.body();
      if (body.length >= 5 && body.slice(0, 5).toString() === '%PDF-') {
        writeFileSync(outPath, body);
        return { ok: true, body, pdfUrl: cleaned };
      }
      return { ok: false, detail: `not PDF (first bytes: "${body.slice(0, 30).toString().replace(/\n/g, ' ')}")` };
    }
    return { ok: false, detail: `HTTP ${resp.status()} for ${cleaned}` };
  } catch (e) {
    return { ok: false, detail: `error: ${e.message}` };
  }
}

// ── Try to fetch one paper ─────────────────────────────────────────────────

async function fetchOne(page, paper) {
  const out = targetPath(paper);
  mkdirSync(dirname(out), { recursive: true });

  if (alreadyValid(out)) {
    console.log(`  SKIP  ${paper.problem}/${paper.file}`);
    return 'skip';
  }

  const doiUrl = `https://doi.org/${paper.doi}`;
  console.log(`  FETCH ${paper.problem}/${paper.file}`);
  console.log(`        doi: ${paper.doi}`);

  // Navigate the visible browser to the DOI resolver. The user can solve
  // any challenge that appears.
  try {
    await page.goto(doiUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  } catch (e) {
    console.log(`  FAIL  ${paper.problem}/${paper.file} (page.goto failed: ${e.message})`);
    return 'fail';
  }

  // Poll the landing page until we can extract a PDF URL.
  let pdfUrl = null;
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    pdfUrl = await findPdfUrl(page).catch(() => null);
    if (pdfUrl) break;
    if (attempt < POLL_MAX_ATTEMPTS) {
      console.log(
        `    [poll ${attempt}/${POLL_MAX_ATTEMPTS}, ${attempt * POLL_INTERVAL_MS / 1000 | 0}s] no PDF link on page yet — solve any visible challenge`,
      );
      await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
    }
  }

  if (!pdfUrl) {
    console.log(`  FAIL  ${paper.problem}/${paper.file} (no PDF link found on landing page)`);
    return 'fail';
  }

  console.log(`        pdf url: ${pdfUrl}`);
  const r = await downloadPdf(page, pdfUrl, paper, out);
  if (!r.ok) {
    console.log(`  FAIL  ${paper.problem}/${paper.file} (${r.detail})`);
    return 'fail';
  }
  console.log(`  OK    ${paper.problem}/${paper.file} (${(r.body.length / 1024).toFixed(0)} KB)`);
  return 'ok';
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  let papers = CONFIG.papers;
  if (args.problem) papers = papers.filter((p) => p.problem === args.problem);
  if (papers.length === 0) {
    console.error(`no papers match --problem=${args.problem}`);
    process.exit(2);
  }

  if (args.dryRun) {
    console.log(`Dry run. Would fetch ${papers.length} papers via DOI:`);
    for (const p of papers) {
      console.log(`  ${p.problem}/${p.file}  ←  https://doi.org/${p.doi}`);
    }
    return;
  }

  mkdirSync(PROFILE, { recursive: true });
  console.log('Launching headed Chromium with persistent profile...');
  console.log('TIB VPN must be active.\n');

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  const totals = { ok: 0, skip: 0, fail: 0 };

  for (let i = 0; i < papers.length; i++) {
    console.log(`\n[${i + 1}/${papers.length}] ${papers[i].problem}/${papers[i].file}`);
    const r = await fetchOne(page, papers[i]);
    totals[r]++;
    await new Promise((res) => setTimeout(res, 1500));
  }

  console.log(`\nDone: ${totals.ok} downloaded, ${totals.skip} skipped, ${totals.fail} failed`);
  await ctx.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
