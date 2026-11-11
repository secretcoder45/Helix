"""
Accounts: username + password, sessions, and the account's own data.

See auth.py for how passwords and sessions are handled. Password hashing is
deliberately slow CPU work, which is one more reason these routes are plain
`def` and run in the worker thread pool.

A person's data is theirs: they can download all of it (/auth/export) and
delete the account with everything in it (DELETE /auth/account).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import auth
import db as db_module
import models
from routers.projects import serialize_project
from version import helix_build

router = APIRouter(prefix="/auth", tags=["Accounts"])

EXPORT_FORMAT = "helix-account-export"
EXPORT_VERSION = 1


class Credentials(BaseModel):
    username: str
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class PasswordConfirmation(BaseModel):
    password: str


def _user_out(user: models.User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _confirm_password(user: models.User, password: str) -> None:
    """
    Re-check the password before a sensitive change. Counted against the same
    budget as sign-in, so a stolen session token can't be used to guess the
    password through these routes instead.
    """
    wait = auth.LOGIN_FAILURES.blocked(user.username)
    if wait:
        raise auth.too_many(wait)
    if not auth.verify_password(password, user.password_hash):
        auth.LOGIN_FAILURES.hit(user.username)
        raise HTTPException(status_code=400, detail="Password is incorrect.")


@router.post("/register", status_code=201)
def register(payload: Credentials, request: Request, session: Session = Depends(db_module.get_db)):
    address = auth.client_address(request)
    wait = auth.SIGNUPS.blocked(address)
    if wait:
        raise auth.too_many(wait)

    username = auth.normalise_username(payload.username)
    problem = auth.validate_username(username) or auth.validate_password(payload.password, username)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    if session.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(status_code=409, detail="That username is taken.")

    user = models.User(username=username, password_hash=auth.hash_password(payload.password))
    session.add(user)
    try:
        session.commit()
    except IntegrityError:  # registered concurrently between the check and here
        session.rollback()
        raise HTTPException(status_code=409, detail="That username is taken.")

    auth.SIGNUPS.hit(address)
    return {"token": auth.create_session(session, user), "user": _user_out(user)}


@router.post("/login")
def login(payload: Credentials, session: Session = Depends(db_module.get_db)):
    username = auth.normalise_username(payload.username)
    wait = auth.LOGIN_FAILURES.blocked(username)
    if wait:
        raise auth.too_many(wait)

    user = auth.authenticate(session, username, payload.password)
    if not user:
        auth.LOGIN_FAILURES.hit(username)
        # One message for both cases, so it doesn't reveal which accounts exist.
        raise HTTPException(status_code=401, detail="Username or password is incorrect.")

    auth.LOGIN_FAILURES.clear(username)
    return {"token": auth.create_session(session, user), "user": _user_out(user)}


@router.post("/logout")
def logout(request: Request, session: Session = Depends(db_module.get_db)):
    token = auth.bearer_token(request)
    if token:
        auth.revoke_session(session, token)
    return {"signed_out": True}


@router.get("/me")
def me(user: models.User = Depends(auth.current_user)):
    return _user_out(user)


@router.post("/password")
def change_password(
    payload: PasswordChange,
    request: Request,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    wait = auth.LOGIN_FAILURES.blocked(user.username)
    if wait:
        raise auth.too_many(wait)
    if not auth.verify_password(payload.current_password, user.password_hash):
        auth.LOGIN_FAILURES.hit(user.username)
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    problem = auth.validate_password(payload.new_password, user.username)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    user.password_hash = auth.hash_password(payload.new_password)
    session.commit()
    # Anyone holding another session (a shared computer, a stolen token) is
    # signed out; this one stays signed in.
    auth.revoke_other_sessions(session, user, auth.bearer_token(request))
    return {"changed": True}


@router.get("/export")
def export_account(
    response: Response,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    """
    Everything this account holds, as one JSON document: the account itself,
    and every project with its saved records, alignments, notes and
    provenance — the same fields the API returns, so it can be read back by
    a script as easily as by a person.

    Not included: the password hash and session tokens, which are
    credentials rather than data.
    """
    projects = (
        session.query(models.Project)
        .filter(models.Project.owner_id == user.id)
        .order_by(models.Project.created_at)
        .all()
    )
    now = datetime.now(timezone.utc)
    response.headers["Content-Disposition"] = (
        f'attachment; filename="helix-{user.username}-{now:%Y-%m-%d}.json"'
    )
    return {
        "format": EXPORT_FORMAT,
        "format_version": EXPORT_VERSION,
        "exported_at": now.isoformat(),
        "helix": helix_build(),
        "account": _user_out(user),
        "projects": [serialize_project(p, include_items=True) for p in projects],
    }


@router.delete("/account")
def delete_account(
    payload: PasswordConfirmation,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    """
    Delete the account and everything in it: projects, saved records,
    alignments, share links and every session. Immediate and permanent —
    there is no soft-delete to restore from — so it needs the password.
    """
    _confirm_password(user, payload.password)
    username = user.username
    counts = {
        "projects": len(user.projects),
        "items": sum(len(p.items) for p in user.projects),
        "alignments": sum(len(p.alignments) for p in user.projects),
    }
    # The relationships cascade (models.py), so this removes the projects,
    # their items and alignments, and the sessions along with the user.
    session.delete(user)
    session.commit()
    auth.LOGIN_FAILURES.clear(username)
    return {"deleted": True, "removed": counts}
