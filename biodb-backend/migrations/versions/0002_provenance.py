"""Add provenance to saved items and alignments.

The first change to an existing table — the reason migrations exist here at
all. create_all only ever creates missing tables; it never adds a column to
one that exists, so without this the new column would have appeared in every
fresh test database and silently never in production.

Nullable with no back-fill: rows saved before this have no recorded release,
and inventing one would be worse than admitting it.

Revision ID: 0002_provenance
Revises: 0001_baseline
Create Date: 2026-10-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_provenance"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

TABLES = ("saved_items", "saved_alignments")


def _columns(table):
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    for table in TABLES:
        if "provenance" not in _columns(table):
            with op.batch_alter_table(table) as batch:
                batch.add_column(sa.Column("provenance", sa.Text(), nullable=True))


def downgrade():
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.drop_column("provenance")
