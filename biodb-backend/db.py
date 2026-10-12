"""
Database setup. Defaults to a local SQLite file for solo/dev use; set
DATABASE_URL (e.g. Railway's Postgres addon) in production. SQLAlchemy
abstracts the dialect, so nothing else in the app needs to know which one
is in use.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# `or` rather than a getenv default: an empty DATABASE_URL= line in .env
# returns "" (not None), which would otherwise break create_engine.
DATABASE_URL = os.getenv("DATABASE_URL") or "sqlite:///./biodb.sqlite3"

# Heroku-style providers (Railway included) sometimes hand out postgres:// URLs.
# SQLAlchemy 2.x dropped that alias and errors on it, so normalise to the
# dialect name it expects.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite needs this flag for use with FastAPI's threaded request handling;
# Postgres and other real DBs ignore it.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(bind=None):
    """
    Bring the schema up to date by applying migrations (see migrations/).

    Replaces Base.metadata.create_all, which creates missing tables but never
    alters existing ones — so a new column would appear in fresh databases
    and silently never in production. Runs on every startup; already-applied
    migrations are skipped, so this is cheap when there is nothing to do.
    """
    from alembic import command
    from alembic.config import Config

    import models  # noqa: F401 (ensures models are registered on Base)

    here = os.path.dirname(os.path.abspath(__file__))
    cfg = Config(os.path.join(here, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(here, "migrations"))

    with (bind or engine).begin() as connection:
        cfg.attributes["connection"] = connection
        command.upgrade(cfg, "head")
