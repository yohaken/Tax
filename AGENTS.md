# AGENTS.md

## Cursor Cloud specific instructions

TaxTag is a **static client-side single-page app** (no backend, no build step). All
runtime libraries (Firebase, `xlsx`, `fuse.js`, `pdfjs`) are loaded from CDNs at
runtime, so there are no local npm dependencies to install and no lockfile.

### Services

| Service | Required | Run command | Notes |
|---|---|---|---|
| Static web (dev) | Yes | `npm start` | Serves `public/` on http://localhost:4173 via `npx serve`. First run downloads `serve` through `npx` (needs network). |
| Firebase Auth + Firestore | External (Google-hosted) | n/a | Not runnable locally; provided by Google project `mypeer-501909`. |

### Lint / test / build

- There is **no lint config, no test suite, and no build step** in this repo. `npm run build`/`npm test` do not exist.
- `package.json` scripts: `npm start` (dev server) and `npm run deploy` (Firebase deploy — do not run from a cloud agent).
- Deploys happen automatically via GitHub Actions (`.github/workflows/deploy-firebase.yml`) on push to `main`; do not deploy manually.

### Non-obvious gotchas

- **The entire UI is gated behind Google login**, and login is restricted to the single
  owner account `yohaken@gmail.com` (enforced in `public/js/firebase.js` and
  `firestore.rules`). Without those credentials you cannot exercise the workspace UI in a
  browser — you will only see the login gate. This is expected, not a bug.
- To validate core logic without logging in, exercise the pure modules directly with Node,
  e.g. import `public/js/parser.js` (`parseCsvText`) and `public/js/storage.js`
  (`applyRules`, `smartSearch`, `summarizeByGroup`) against `public/sample-statement.csv`.
  The CSV path needs no browser globals; only the Excel/PDF/Fuse paths require
  `globalThis.XLSX` / `Fuse` / `pdfjs` which exist only in the browser.
- `public/data/peerland_2024-2025.json` (~900 KB) is the built-in "Peerland" dataset the
  app loads on demand; it too is only reachable after login in the browser.
