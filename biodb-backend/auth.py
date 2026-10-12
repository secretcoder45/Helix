"""
Accounts: username + password, opaque session tokens.

Passwords
  Hashed with scrypt from the standard library — no extra dependency — at
  OWASP's recommended N=2^14, r=8, p=5 (16 MiB per hash). The stored string
  carries its own parameters ("scrypt$16384$8$5$salt$hash"), so they can be
  raised later and old hashes still verify. Comparison is constant-time.
  Rules follow NIST SP 800-63B: a minimum length and a short blocklist, no
  composition rules — those push people towards "Password1!" and help no one.

Sessions
  A random 256-bit token, sent as `Authorization: Bearer …`. Only its SHA-256
  is stored, so a leaked database contains no usable sessions. Server-side
  sessions rather than JWTs because signing out has to actually end the
  session, and a JWT stays valid until it expires.

  Bearer tokens rather than cookies because the frontend and API are on
  different sites (Vercel, Render): cross-site cookies need SameSite=None and
  are blocked outright by some browsers. The cost is that the token lives in
  localStorage, which is readable by any script on the page — acceptable
  here because the app renders no user-supplied HTML.

Throttling
  Failed sign-ins are limited per username (stops guessing one account's
  password from many addresses) and sign-ups per client address. In-memory,
  which is right for the single instance this runs on; it moves to the
  shared cache if the backend ever runs more than one.

There is no email, so there is no self-service password reset: see admin.py.
"""

import base64
import hashlib
import hmac
import os
import re
import secrets
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

import db as db_module
import models

# ---- Passwords ----

_SCRYPT = {"n": 2**14, "r": 8, "p": 5}
_SCRYPT_MAXMEM = 64 * 1024 * 1024

MIN_PASSWORD = 8
MAX_PASSWORD = 256  # bounds hashing cost; far beyond any real passphrase

# The most common passwords that satisfy the length rule. Not exhaustive —
# it only has to stop the guesses an attacker tries first.
_COMMON_PASSWORDS = {
    "password", "password1", "password123", "12345678", "123456789", "1234567890",
    "qwertyui", "qwerty123", "iloveyou", "11111111", "00000000", "abc12345",
    "letmein1", "welcome1", "sunshine", "princess", "football", "baseball",
    "trustno1", "superman", "1q2w3e4r", "passw0rd", "changeme", "helixhelix",
}

USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{2,31}$")


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, maxmem=_SCRYPT_MAXMEM, dklen=32, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p),
            maxmem=_SCRYPT_MAXMEM, dklen=len(expected),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# Verified against when the username doesn't exist, so a failed sign-in takes
# the same time either way and response timing doesn't reveal which accounts
# exist.
_DUMMY_HASH = hash_password(secrets.token_hex(16))


def normalise_username(username: str) -> str:
    return (username or "").strip().lower()


def validate_username(username: str) -> Optional[str]:
    if not USERNAME_RE.match(username):
        return (
            "Usernames are 3–32 characters: lowercase letters, digits, and . _ -, "
            "starting with a letter or digit."
        )
    return None


def validate_password(password: str, username: str) -> Optional[str]:
    if len(password) < MIN_PASSWORD:
        return f"Use at least {MIN_PASSWORD} characters."
    if len(password) > MAX_PASSWORD:
        return f"Use at most {MAX_PASSWORD} characters."
    lowered = password.lower()
    if lowered in _COMMON_PASSWORDS:
        return "That password is one of the most commonly used — choose another."
    if lowered == username or username in lowered:
        return "The password can't contain your username."
    return None


def authenticate(session: Session, username: str, password: str) -> Optional[models.User]:
    """The user if the credentials are right, else None — in constant-ish time."""
    user = session.query(models.User).filter(models.User.username == username).first()
    if len(password) > MAX_PASSWORD:
        password = ""  # can't match; still hashed, so timing doesn't differ
    ok = verify_password(password, user.password_hash if user else _DUMMY_HASH)
    return user if (user and ok) else None


# ---- Sessions ----

SESSION_DAYS = 30


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    # SQLite hands back naive datetimes even for timezone=True columns.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def create_session(session: Session, user: models.User) -> str:
    token = secrets.token_urlsafe(32)
    session.add(models.AuthSession(
        id=_token_hash(token),
        user_id=user.id,
        expires_at=_now() + timedelta(days=SESSION_DAYS),
    ))
    session.commit()
    return token


def revoke_session(session: Session, token: str) -> None:
    session.query(models.AuthSession).filter(models.AuthSession.id == _token_hash(token)).delete()
    session.commit()


def revoke_other_sessions(session: Session, user: models.User, keep_token: str) -> None:
    session.query(models.AuthSession).filter(
        models.AuthSession.user_id == user.id,
        models.AuthSession.id != _token_hash(keep_token),
    ).delete()
    session.commit()


def bearer_token(request: Request) -> Optional[str]:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def _user_for_token(session: Session, token: Optional[str]) -> Optional[models.User]:
    if not token:
        return None
    row = session.query(models.AuthSession).filter(models.AuthSession.id == _token_hash(token)).first()
    if not row:
        return None
    if _aware(row.expires_at) <= _now():
        session.delete(row)
        session.commit()
        return None
    return row.user


def optional_user(request: Request, session: Session = Depends(db_module.get_db)) -> Optional[models.User]:
    return _user_for_token(session, bearer_token(request))


def current_user(request: Request, session: Session = Depends(db_module.get_db)) -> models.User:
    user = _user_for_token(session, bearer_token(request))
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# ---- Throttling ----

class _Throttle:
    """At most `limit` events per key in a sliding window of `window` seconds."""

    def __init__(self, limit: int, window: float):
        self.limit, self.window = limit, window
        self._events = {}
        self._lock = threading.Lock()

    def _recent(self, key: str) -> deque:
        q = self._events.setdefault(key, deque())
        cutoff = time.monotonic() - self.window
        while q and q[0] < cutoff:
            q.popleft()
        return q

    def blocked(self, key: str) -> Optional[int]:
        """Seconds until `key` may try again, or None if it may now."""
        with self._lock:
            q = self._recent(key)
            if len(q) < self.limit:
                return None
            return max(1, int(q[0] + self.window - time.monotonic()))

    def hit(self, key: str) -> None:
        with self._lock:
            self._recent(key).append(time.monotonic())

    def clear(self, key: Optional[str] = None) -> None:
        with self._lock:
            if key is None:
                self._events.clear()
            else:
                self._events.pop(key, None)


LOGIN_FAILURES = _Throttle(limit=5, window=15 * 60)
SIGNUPS = _Throttle(limit=10, window=60 * 60)


def client_address(request: Request) -> str:
    # Behind Render's proxy the socket address is the proxy's. The right-most
    # X-Forwarded-For entry is the one the proxy itself appended, so unlike
    # the left-most it can't be chosen by the client.
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def too_many(seconds: int) -> HTTPException:
    minutes = max(1, round(seconds / 60))
    return HTTPException(
        status_code=429,
        detail=f"Too many attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        headers={"Retry-After": str(seconds)},
    )
