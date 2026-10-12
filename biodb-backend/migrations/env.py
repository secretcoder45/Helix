"""
Alembic environment.

Two ways in: the app calls migrations programmatically on startup and hands
over its own connection (config.attributes["connection"]); the `alembic` CLI
connects through db.py's engine. Either way the URL comes from db.py, so the
app and its migrations can never disagree about which database they mean.

Logging config from alembic.ini is only applied for the CLI — applying it
inside the running app would replace the app's own logging setup.
"""

from logging.config import fileConfig

from alembic import context

import db as db_module
import models  # noqa: F401 — registers tables on Base.metadata

config = context.config
target_metadata = db_module.Base.metadata


def _configure_and_run(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # SQLite can't ALTER most things in place; batch mode rebuilds the
        # table instead. Postgres doesn't need it.
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline():
    context.configure(
        url=db_module.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connection = config.attributes.get("connection")
    if connection is not None:
        _configure_and_run(connection)
        return

    if config.config_file_name is not None:
        fileConfig(config.config_file_name)
    with db_module.engine.connect() as connection:
        _configure_and_run(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
