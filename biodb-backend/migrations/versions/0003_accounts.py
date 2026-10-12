"""Accounts: users, sessions, project ownership and share links.

Existing projects get no owner (owner_id NULL). They were created when
anyone with the URL could read and edit everything, so there is no way to
know whose they are — and handing them to whichever account registers first
would give one person everyone's data. They stay in the database, unreachable
through the API, until assigned deliberately (admin.py assign-orphans).

Revision ID: 0003_accounts
Revises: 0002_provenance
Create Date: 2026-10-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_accounts"
down_revision = "0002_provenance"
branch_labels = None
depends_on = None


def _tables():
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table):
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    tables = _tables()

    if "users" not in tables:
        op.create_table(
            "users",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("username", sa.String(), nullable=False),
            sa.Column("password_hash", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.UniqueConstraint("username", name="uq_users_username"),
        )

    if "auth_sessions" not in tables:
        op.create_table(
            "auth_sessions",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", name="fk_auth_sessions_user_id_users"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])

    columns = _columns("projects")
    if "owner_id" not in columns or "share_token" not in columns:
        with op.batch_alter_table("projects") as batch:
            if "owner_id" not in columns:
                batch.add_column(sa.Column("owner_id", sa.String(), nullable=True))
                batch.create_foreign_key("fk_projects_owner_id_users", "users", ["owner_id"], ["id"])
                batch.create_index("ix_projects_owner_id", ["owner_id"])
            if "share_token" not in columns:
                batch.add_column(sa.Column("share_token", sa.String(), nullable=True))
                batch.create_unique_constraint("uq_projects_share_token", ["share_token"])


def downgrade():
    with op.batch_alter_table("projects") as batch:
        batch.drop_constraint("uq_projects_share_token", type_="unique")
        batch.drop_column("share_token")
        batch.drop_index("ix_projects_owner_id")
        batch.drop_constraint("fk_projects_owner_id_users", type_="foreignkey")
        batch.drop_column("owner_id")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.drop_table("users")
