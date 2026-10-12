"""Baseline: the schema as it stood before migrations existed.

Databases created before Alembic was introduced (including production) were
built by Base.metadata.create_all and already have these tables, so each
table is created only if missing. That makes this revision safe to run
against both an empty database and an existing one, with no manual
`alembic stamp` step to remember on deploy.

Columns are spelled out rather than taken from models.py on purpose: a
migration must describe the schema at its point in history, and models.py
moves on.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def _existing_tables():
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade():
    existing = _existing_tables()

    if "projects" not in existing:
        op.create_table(
            "projects",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.Text()),
            sa.Column("created_at", sa.DateTime(timezone=True)),
        )

    if "saved_items" not in existing:
        op.create_table(
            "saved_items",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("external_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("database", sa.String(), nullable=False),
            sa.Column("description", sa.Text()),
            sa.Column("link", sa.String()),
            sa.Column("notes", sa.Text()),
            sa.Column("retrieved_at", sa.DateTime(timezone=True)),
            sa.Column("saved_at", sa.DateTime(timezone=True)),
        )

    if "saved_alignments" not in existing:
        op.create_table(
            "saved_alignments",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("algorithm", sa.String(), nullable=False),
            sa.Column("label1", sa.String()),
            sa.Column("label2", sa.String()),
            sa.Column("seq1", sa.Text(), nullable=False),
            sa.Column("seq2", sa.Text(), nullable=False),
            sa.Column("aligned_seq1", sa.Text(), nullable=False),
            sa.Column("aligned_seq2", sa.Text(), nullable=False),
            sa.Column("score", sa.Float(), nullable=False),
            sa.Column("identity_pct", sa.Float()),
            sa.Column("similarity_pct", sa.Float()),
            sa.Column("gaps", sa.Integer()),
            sa.Column("length", sa.Integer()),
            sa.Column("params", sa.Text()),
            sa.Column("notes", sa.Text()),
            sa.Column("created_at", sa.DateTime(timezone=True)),
        )


def downgrade():
    op.drop_table("saved_alignments")
    op.drop_table("saved_items")
    op.drop_table("projects")
