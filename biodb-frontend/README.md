# Helix — frontend

React 19 + Vite workspace and landing page for [Helix](../README.md).

```bash
npm install
echo "VITE_API_URL=http://localhost:8000" > .env   # the backend; see ../biodb-backend
npm run dev                                        # http://localhost:5173
npm run build                                      # production build into dist/
npm run lint                                       # oxlint
```

Where things are:

| | |
|---|---|
| `src/pages/LandingPage.jsx` | The landing page — in the main bundle, no backend dependency |
| `src/app/Workspace.jsx` | Everything behind it, loaded as a separate chunk; each tool page is its own chunk |
| `src/lib/nav.js` | The workspace navigation, read by the sidebar, phone menu and command palette |
| `src/lib/api.js` | Backend calls (React Query hooks) |
| `src/components/ui.jsx` | Shared UI primitives |
| `src/index.css` | Design tokens (light and dark) |
| `vercel.json` | SPA rewrite, security headers including the Content-Security-Policy |

Pushes to `main` deploy to [get-helix.vercel.app](https://get-helix.vercel.app)
automatically (see `../DEPLOY.md`). If you load a new external resource — a
script, font, image host or API — add its origin to the CSP in `vercel.json`,
or the browser will block it in production only.
