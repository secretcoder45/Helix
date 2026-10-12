"""
Operator commands. Accounts have no email, so a forgotten password can only
be reset here, by whoever runs the server.

    python admin.py users
    python admin.py reset-password <username>
    python admin.py orphans
    python admin.py assign-orphans <username>

Run with the same DATABASE_URL as the app (on Render: the service's Shell
tab). reset-password prompts for the new password rather than taking it as
an argument, so it never lands in shell history, and signs the user out
everywhere.
"""

import getpass
import sys

from dotenv import load_dotenv

load_dotenv()

import auth  # noqa: E402
import db as db_module  # noqa: E402
import models  # noqa: E402


def _user(session, username):
    user = session.query(models.User).filter(models.User.username == auth.normalise_username(username)).first()
    if not user:
        sys.exit(f"No user named {username!r}.")
    return user


def users(session):
    for u in session.query(models.User).order_by(models.User.created_at).all():
        print(f"{u.username:32} {len(u.projects):3} projects   created {u.created_at:%Y-%m-%d}")


def reset_password(session, username):
    user = _user(session, username)
    password = getpass.getpass(f"New password for {user.username}: ")
    if password != getpass.getpass("Again: "):
        sys.exit("Passwords don't match.")
    problem = auth.validate_password(password, user.username)
    if problem:
        sys.exit(problem)
    user.password_hash = auth.hash_password(password)
    session.query(models.AuthSession).filter(models.AuthSession.user_id == user.id).delete()
    session.commit()
    print(f"Password reset for {user.username}; all their sessions were signed out.")


def orphans(session):
    rows = session.query(models.Project).filter(models.Project.owner_id.is_(None)).all()
    for p in rows:
        print(f"{p.id}  {p.name}  ({len(p.items)} records, {len(p.alignments)} alignments)")
    print(f"{len(rows)} project(s) without an owner.")


def assign_orphans(session, username):
    user = _user(session, username)
    rows = session.query(models.Project).filter(models.Project.owner_id.is_(None)).all()
    for p in rows:
        p.owner_id = user.id
    session.commit()
    print(f"Assigned {len(rows)} project(s) to {user.username}.")


COMMANDS = {
    "users": (users, 0),
    "reset-password": (reset_password, 1),
    "orphans": (orphans, 0),
    "assign-orphans": (assign_orphans, 1),
}


def main(argv):
    if not argv or argv[0] not in COMMANDS or len(argv) - 1 != COMMANDS[argv[0]][1]:
        sys.exit(__doc__)
    db_module.init_db()
    fn, _ = COMMANDS[argv[0]]
    with db_module.SessionLocal() as session:
        fn(session, *argv[1:])


if __name__ == "__main__":
    main(sys.argv[1:])
