# Helix — frontend

React 19 + Vite workspace and landing page for [Helix](../README.md).

```bash
npm install
echo "VITE_API_URL=http://localhost:8000" > .env   # the backend; see ../biodb-backend
npm run dev                                        # http://localhost:5173
npm run build                                      # production build into dist/
npm run lint                                       # oxlint
npm run test:e2e                                   # browser tests (below)
```

The API client talks to `${VITE_API_URL}/v1` (`src/lib/config.js`).

## Browser tests

`npm run test:e2e` builds the frontend into `dist-e2e/`, starts it and the
real backend, and drives them in Chromium — desktop, plus the tests tagged
`@phone` at phone width. The backend is real (accounts, projects, the
methods export, alignment), but the source databases are replaced by
recordings of their real answers for insulin
(`e2e/backend/sources.json`), and the page is cut off from every other site,
so the tests don't depend on UniProt or NCBI being up. Any uncaught error in
the page fails the test it happens in.

Needs the backend's virtualenv at `../biodb-backend/venv` (or set
`E2E_PYTHON`) and, once, `npx playwright install chromium`. When a source
changes its format, re-record with `python e2e/backend/capture.py`.
`npm run test:e2e -- --ui` shows the tests running.

Where things are:

| | |
|---|---|
| `src/pages/LandingPage.jsx` | The landing page — in the main bundle, no backend dependency |
| `src/app/Workspace.jsx` | Everything behind it, loaded as a separate chunk; each tool page is its own chunk |
| `src/lib/nav.js` | The workspace navigation, read by the sidebar, phone menu and command palette |
| `src/lib/api.js` | Backend calls (React Query hooks) |
| `e2e/` | Browser tests, and the recorded-sources backend they run against |
| `src/components/ui.jsx` | Shared UI primitives |
| `src/index.css` | Design tokens (light and dark) |
| `vercel.json` | SPA rewrite, security headers including the Content-Security-Policy |

Pushes to `main` deploy to [get-helix.vercel.app](https://get-helix.vercel.app)
automatically (see `../DEPLOY.md`). If you load a new external resource — a
script, font, image host or API — add its origin to the CSP in `vercel.json`,
or the browser will block it in production only.
