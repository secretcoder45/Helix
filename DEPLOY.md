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

The Vercel project (`helix-bio-db`) is connected to the GitHub repo, so
**every push to `main` deploys the frontend** — nothing to run by hand.
Settings that make that work, in the Vercel dashboard:

- **Root Directory:** `biodb-frontend` (the repo root has no frontend; with
  `.` every Git deploy fails)
- **Production Branch:** `main`
- **Domains:** `get-helix.vercel.app` assigned to Production, so each new
  production deploy gets it automatically. `biodb-frontend.vercel.app`
  308-redirects to it (the backend's CORS only allows get-helix).
- **Environment variable:** `VITE_API_URL` = the Render URL, for Production.

Setting it up from scratch: create the project, set the above, then
`npx vercel env add VITE_API_URL production`. A manual deploy is still
possible from `biodb-frontend/` with `npx vercel --prod`, but then the domain
has to be re-pointed with `npx vercel alias set <deployment-url>
get-helix.vercel.app`.

## 5. Close the CORS loop

Back in the Render dashboard, set `ALLOWED_ORIGINS` to
`https://get-helix.vercel.app`. Render redeploys automatically on env var
changes.

## 6. Smoke test

Against the live site, not localhost — expect the first request to be slow
(cold start) if the backend had been idle:

- `/` — the landing page; its status line should reach "Server ready"
- `/lookup?q=BRCA1` — expect P38398, 1863 aa, and a provenance line naming
  the UniProt release
- `/db/all?q=insulin` — four columns (UniProt, PDB, NCBI Gene, KEGG)
- `/batch` — "Use sample", Resolve; expect 8/8 resolved
- `/signin` — create an account; then `/projects` — create one, save a record
- Reload `/projects` after a few minutes — the saved record must persist
  (confirms Neon Postgres is actually wired up, not a fresh local file)
- Hard-refresh on `/batch` — must not 404 (handled by the rewrite in
  `vercel.json`)
- `/validation` — shows the commit the backend is running
- `<backend>/v1/upstream/stats` — retries against each source since the last
  deploy; `{}` on a quiet day. Lots of `gave_up` for one host means that
  source is struggling, not Helix
- Account menu → **Download my data** saves a JSON file; **Delete account…**
  (try it on a throwaway account) signs you out and the login stops working

## Configuration reference

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Render | yes | Neon connection string |
| `ANTHROPIC_API_KEY` | Render | no | Only used by the Assistant, which is off unless `ASSISTANT_ENABLED` is set |
| `ALLOWED_ORIGINS` | Render | yes | Comma-separated; the Vercel URL |
| `NCBI_API_KEY` | Render | no | Raises NCBI limit from 3/s to 10/s |
| `SENTRY_DSN` | Render | no | Error tracking. Backend crashes, source outages and browser crashes (relayed via `/client-errors`) all report there |
| `LOG_LEVEL` | Render | no | Default `INFO`. Logs go to Render's log view |
| `REDIS_URL` | Render | no | Shared cache (e.g. Render Key Value). Unset: in-process cache, right for one instance |
| `ASSISTANT_ENABLED` | Render | no | `true` turns the Assistant (`/chat`) back on. Off by default: it spends the Anthropic key per question |
| `HELIX_DOI` | Render | no | Overrides the Zenodo DOI exports cite (default: Helix's concept DOI, `10.5281/zenodo.24134621`) |
| `PORT` | Render | auto | Injected; the app binds to it |
| `VITE_API_URL` | Vercel | yes | Baked in at build time, so changing it needs a rebuild |

## Accounts

Username + password (no email). Passwords are scrypt hashes; sessions are
random bearer tokens stored only as SHA-256 hashes, revoked on sign-out.
Tools work signed out; projects, the methods export and share links need an
account. Projects created before accounts existed have no owner and are
hidden until assigned.

People can download everything their account holds (`GET /v1/auth/export`,
**Download my data** in the account menu) and delete the account with all
its projects (`DELETE /v1/auth/account`, password required). Deletion is
immediate and permanent: there is no soft-delete, and Neon's point-in-time
restore is the only way back.

Without email there is no self-service reset. Free Render instances have no
shell, so run these from `biodb-backend/` on your own machine, pointed at the
production database with the Neon connection string:

```
export DATABASE_URL='<Neon connection string>'
python admin.py users                     # list accounts
python admin.py reset-password <username> # prompts; signs them out everywhere
python admin.py orphans                   # projects with no owner
python admin.py assign-orphans <username> # give them to an account
```

## Database migrations

The schema is managed by Alembic (`biodb-backend/migrations/`). The app runs
`alembic upgrade head` itself on startup, so a deploy that includes a new
migration applies it with no manual step; already-applied migrations are
skipped. To change the schema: edit `models.py`, then from `biodb-backend/`
run `alembic revision --autogenerate -m "what changed"`, read the generated
file, and commit it. `test_migrations_produce_exactly_the_schema_the_models_describe`
fails if a model change is committed without its migration.

## Known gaps

- **Cold starts.** Free Render sleeps after 15 min idle. Upgrading to a paid
  instance ($7/mo) removes this if the app gets real users.
- **Cache is per-process unless `REDIS_URL` is set.** Fine for one instance;
  set it before running more than one, or each replica fetches everything
  itself.
- **Rate limits are per-process.** Per client address: lookups 120/min,
  computations 60/min, batch 10 per 10 min, BLAST 10/hour (`ratelimit.py`).
  Like sign-in throttling, they move to the shared cache if the backend runs
  as more than one instance.
- **Sign-in throttling is per-process.** It moves to the shared cache if the
  backend ever runs as more than one instance.
- **Unversioned API paths are deprecated.** The frontend uses `/v1`; the old
  paths stay for scripts and browser tabs opened before the switch. Remove
  them once logs show no traffic to them (look for responses without the
  `/v1/` prefix).
- **No password recovery or account deletion yet.** Resets go through
  `admin.py`; there is no email to send a reset link to.
- **The Assistant is switched off.** Hidden in the interface and `/chat`
  returns 404 unless `ASSISTANT_ENABLED=true`. Before re-enabling, it should
  require an account and a per-user daily limit.
