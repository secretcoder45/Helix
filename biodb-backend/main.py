"""
The Helix API: app setup, middleware, and the routers that hold the routes.

Routes live in routers/, one module per area. Each is mounted twice:

- under /v1, the documented API. A breaking change later goes in /v2,
  alongside, instead of breaking every script written against this one.
- at the old unversioned paths, for clients written before /v1 existed —
  including the frontend bundle already loaded in someone's browser tab
  when a deploy lands. Those paths are left out of the API docs and answer
  with a Deprecation header pointing at the /v1 equivalent.

/health stays at the root: it is for the hosting platform, not an API.
"""

import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import db as db_module
from database_apis import SourceUnavailable
from routers import accounts, analysis, assistant, blast, lookup, projects, service
from version import HELIX_VERSION

load_dotenv()

# Logs go to stdout, which is what Render's log view shows.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("helix")

# Error tracking, if configured. Sentry's logging integration also picks up
# ERROR-level log records, so a source failing repeatedly shows up there too.
if os.getenv("SENTRY_DSN"):
    import sentry_sdk

    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        release=f"helix@{HELIX_VERSION}",
        environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
        traces_sample_rate=0.0,
        send_default_pii=False,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_module.init_db()
    yield


API_VERSION = "v1"
API_PREFIX = f"/{API_VERSION}"

app = FastAPI(
    title="Helix API",
    version=HELIX_VERSION,
    lifespan=lifespan,
    description=(
        "Cross-referenced lookups across UniProtKB, NCBI Gene, RCSB PDB, KEGG and "
        "AlphaFold DB, and the analysis tools behind https://get-helix.vercel.app. "
        f"Every path is under `{API_PREFIX}`."
    ),
)

# ---- Errors and request logging ----
# Registered before CORS on purpose: middleware added later wraps earlier
# middleware, so CORS ends up outermost and even a 500 from here carries CORS
# headers. Without that, a browser reports a crash as a CORS error.

SLOW_REQUEST_SECONDS = 5.0


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("Unhandled error [%s] %s %s", request_id, request.method, request.url.path)
        response = JSONResponse(
            status_code=500,
            content={
                "detail": f"Something went wrong on our side. If it keeps happening, report reference {request_id}.",
                "request_id": request_id,
            },
        )
    elapsed = time.perf_counter() - started
    if elapsed > SLOW_REQUEST_SECONDS:
        log.warning("Slow request [%s] %s %s took %.1fs", request_id, request.method, request.url.path, elapsed)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(SourceUnavailable)
def source_unavailable(request: Request, exc: SourceUnavailable):
    # 503, naming the source, so the interface can say "UniProt isn't
    # responding" instead of showing an empty result as if nothing matched.
    return JSONResponse(status_code=503, content={"detail": str(exc), "source": exc.source})


# CORS: origins come from the environment so the deployed frontend isn't
# blocked. ALLOWED_ORIGINS is a comma-separated list; the localhost defaults
# keep local development working with no configuration.
_DEFAULT_ORIGINS = "http://localhost:5173,http://localhost:3000"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in (os.getenv("ALLOWED_ORIGINS") or _DEFAULT_ORIGINS).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "Deprecation", "Link", "Content-Disposition"],
)


# ---- Routes ----


@app.get("/health", tags=["Service"])
def health_check():
    return {"status": "ok", "version": HELIX_VERSION, "api": API_VERSION}


ROUTERS = [
    service.router,
    lookup.router,
    blast.router,
    analysis.router,
    projects.router,
    accounts.router,
    assistant.router,
]


def _unversioned(request: Request, response: Response) -> None:
    """Mark a request to an old unversioned path, naming its replacement (RFC 9745 / 8288)."""
    response.headers["Deprecation"] = "true"
    response.headers["Link"] = f'<{API_PREFIX}{request.url.path}>; rel="successor-version"'


for router in ROUTERS:
    app.include_router(router, prefix=API_PREFIX)
for router in ROUTERS:
    app.include_router(router, include_in_schema=False, dependencies=[Depends(_unversioned)])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
