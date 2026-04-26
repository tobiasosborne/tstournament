# Playwright source fetcher

Headed-Chromium PDF downloader for `problems/*/sources/`. Reuses the FQHE
pattern: persistent profile (Cloudflare cookies survive), one manual click per
publisher, automated fan-out after that.

## Setup (once)

```
cd infra/playwright
npm install
npx playwright install chromium
```

This installs Playwright into `infra/playwright/node_modules/` only — no
global state.

## Run (TIB VPN must be active)

```
# all problems, all publishers
node fetch.mjs

# one problem only
node fetch.mjs --problem 01-fft

# print plan, fetch nothing
node fetch.mjs --dry-run
```

The fetcher iterates publishers in alphabetical order. For each one:

1. Opens the publisher's landing page in a headed Chromium window.
2. Pauses with the prompt **"press Enter when the publisher's page is loaded
   normally"**. Click through whatever Cloudflare / SSO challenge appears.
3. Once you press Enter, fans out and downloads every paper from that
   publisher in `sources.config.json` to
   `../../problems/<NN-name>/sources/<file>`.
4. Validates each file with the `%PDF-` magic-byte check; rejects HTML or
   tiny truncated responses.

Re-running is idempotent: existing valid PDFs are skipped.

## Profile directory

`./.browser-profile/` is the persistent Chromium profile. Cookies, local
storage, and Cloudflare clearance survive across runs, so the manual click
is usually only needed on the first run per publisher.

Delete this directory if cookies go stale.

## Adding sources

Edit `sources.config.json`. The structure is one entry per paper:

```json
{
  "problem": "NN-name",
  "id":      "P01",
  "file":    "Author_Title_Journal_Vol_Year.pdf",
  "url":     "https://...",
  "publisher": "AMS|Springer|Elsevier|IEEE|ACM|Cambridge",
  "notes":   "free-form citation context"
}
```

`publisher` must match a key in `TRIGGER_URLS` inside `fetch.mjs`. Add a new
key + landing URL there if a publisher is missing.

## Books

Books are listed in `sources.config.json` under `"books"` for reference but
**are not downloaded** by the harness. Add them manually to
`problems/<NN-name>/sources/` from your library or institutional access.
