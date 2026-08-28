# Deploying Helix

Backend on **Render** (free web service), database on **Neon** (free
Postgres, no card, no expiring trial), frontend on **Vercel**.

(Railway was the original plan but its free trial expires and then requires
a paid plan — this combo has no trial to run out.)

## 1. Push the repo to GitHub

Render deploys by connecting to a GitHub repo, not a CLI push — this is the
one extra step versus Railway.

1. Create an empty repo at github.com/new (don't initialize it with a README)
2. From the project root:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 2. Database → Neon

1. Sign up free at [neon.tech](https://neon.tech) (no card required)
2. Create a project
3. Copy the connection string it gives you — starts with `postgresql://`
   — you need it in step 3

## 3. Backend → Render

1. Sign up free at [render.com](https://render.com)
2. **New → Blueprint**, connect your GitHub repo. Render reads
   `render.yaml` at the repo root and configures the service automatically
   (Python runtime, build/start commands, health check).
3. It will prompt for the env vars marked `sync: false` in `render.yaml`:
   - `DATABASE_URL` — the Neon connection string from step 2
   - `ANTHROPIC_API_KEY` — your Claude API key
   - `ALLOWED_ORIGINS` — leave blank for now, comes back in step 5
   - `NCBI_API_KEY` — optional, leave blank if you don't have one
4. Deploy. First build takes a few minutes.
5. Copy the public URL Render assigns, e.g.
   `https://helix-backend.onrender.com`

**Free-tier tradeoff worth knowing:** Render's free web service spins down
after 15 minutes of no traffic and takes ~30-50s to wake on the next
request. Fine for personal/research use; annoying for a live demo to
someone else — the first request will look like it's hanging.

## 4. Frontend → Vercel

```bash
cd biodb-frontend
npx vercel login
npx vercel link
npx vercel env add VITE_API_URL production   # paste the Render URL from step 3
npx vercel --prod
```

Copy the URL it prints, e.g. `https://helix.vercel.app`.

## 5. Close the CORS loop

Back in the Render dashboard, edit the `ALLOWED_ORIGINS` env var to your
Vercel URL. Render redeploys automatically on env var changes.

## 6. Smoke test

Against the live site, not localhost — expect the first request to be slow
(cold start) if the backend had been idle:

- `/` — cross-reference `BRCA1`; expect P38398, 1863 aa, 33 structures
- `/batch` — "Use sample", Resolve; expect 8/8 resolved
- `/chat` — ask anything; a reply means the Anthropic key is set
- `/projects` — create one, save a record into it
- Reload `/projects` after a few minutes — the saved record must persist
  (confirms Neon Postgres is actually wired up, not a fresh local file)
- Hard-refresh on `/batch` — must not 404 (handled by the rewrite in
  `vercel.json`)

## Configuration reference

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Render | yes | Neon connection string |
| `ANTHROPIC_API_KEY` | Render | yes | Assistant; without it `/chat` errors |
| `ALLOWED_ORIGINS` | Render | yes | Comma-separated; the Vercel URL |
| `NCBI_API_KEY` | Render | no | Raises NCBI limit from 3/s to 10/s |
| `PORT` | Render | auto | Injected; the app binds to it |
| `VITE_API_URL` | Vercel | yes | Baked in at build time, so changing it needs a rebuild |

## Known gaps

- **Cold starts.** Free Render sleeps after 15 min idle. Upgrading to a paid
  instance ($7/mo) removes this if the app gets real users.
- **Schema changes.** Tables are created with `create_all()`, which adds new
  tables but never alters existing ones. The first schema change against a
  database with real data in it will need Alembic.
- **Cache is per-process.** The in-memory TTL cache is not shared, so scaling
  past one instance means each replica keeps its own. Swap it for Redis at
  that point — `cache.py`'s decorator is the only call site.
- **No auth.** Anyone with the URL can read and write every project.
