# Deploying Helix

Two services: the FastAPI backend on Railway, the Vite frontend on Vercel.
Both have free tiers sufficient for this.

Everything in the repo is already configured for it — what follows is the
sequence of commands, which need a browser login you have to do yourself.

## 1. Backend → Railway

```bash
cd biodb-backend
npx @railway/cli login          # opens a browser
npx @railway/cli init           # create the project
npx @railway/cli add --database postgres
npx @railway/cli up
```

`add --database postgres` is not optional. Railway's container filesystem is
**ephemeral** — it is wiped on every redeploy and restart — so the default
SQLite file would silently lose every saved project each time you push. The
Postgres addon injects `DATABASE_URL`, which `db.py` already reads and
normalises, so no code changes are needed.

Then set the secrets:

```bash
npx @railway/cli variables --set "ANTHROPIC_API_KEY=sk-ant-..."
npx @railway/cli variables --set "NCBI_API_KEY="            # optional, raises rate limit 3/s -> 10/s
npx @railway/cli domain                                      # get the public URL
```

## 2. Frontend → Vercel

```bash
cd ../biodb-frontend
npx vercel login
npx vercel link
npx vercel env add VITE_API_URL production   # paste the Railway URL from above
npx vercel --prod
```

## 3. Close the CORS loop

The backend rejects browser requests from unknown origins, so it needs to be
told the Vercel URL. Back in `biodb-backend`:

```bash
npx @railway/cli variables --set "ALLOWED_ORIGINS=https://<your-app>.vercel.app"
```

Railway redeploys automatically. Without this the frontend loads but every
request fails CORS.

## 4. Smoke test

Against the live site, not localhost:

- `/` — cross-reference `BRCA1`; expect P38398, 1863 aa, 33 structures
- `/batch` — "Use sample", Resolve; expect 8/8 resolved
- `/chat` — ask anything; a reply means the Anthropic key is set
- `/projects` — create one, save a record into it
- **Redeploy** (`npx @railway/cli up`), then reload `/projects` — the saved
  record must still be there. This is the check that Postgres is actually
  wired up rather than a fresh SQLite file.
- Hard-refresh on `/batch` — must not 404 (handled by the rewrite in
  `vercel.json`)

## Configuration reference

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Railway | auto | Injected by the Postgres addon |
| `ANTHROPIC_API_KEY` | Railway | yes | Assistant; without it `/chat` errors |
| `ALLOWED_ORIGINS` | Railway | yes | Comma-separated; the Vercel URL |
| `NCBI_API_KEY` | Railway | no | Raises NCBI limit from 3/s to 10/s |
| `PORT` | Railway | auto | Injected; the app binds to it |
| `VITE_API_URL` | Vercel | yes | Baked in at build time, so changing it needs a rebuild |

## Known gaps

- **Schema changes.** Tables are created with `create_all()`, which adds new
  tables but never alters existing ones. The first schema change against a
  database with real data in it will need Alembic.
- **Cache is per-process.** The in-memory TTL cache is not shared, so scaling
  past one Railway instance means each replica keeps its own. Swap it for
  Redis at that point — `cache.py`'s decorator is the only call site.
- **No auth.** Anyone with the URL can read and write every project.
