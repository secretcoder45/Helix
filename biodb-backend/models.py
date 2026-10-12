import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Float, Integer
from sqlalchemy.orm import relationship

from db import Base


def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class User(Base):
    """An account: a username and a password hash (see auth.py). No email —
    deliberately the smallest identity that lets projects have an owner."""

    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uuid)
    username = Column(String, nullable=False, unique=True)  # stored lowercase
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")
    sessions = relationship("AuthSession", back_populates="user", cascade="all, delete-orphan")


class AuthSession(Base):
    """A signed-in session. The id is the SHA-256 of the bearer token, never
    the token itself, so the table alone can't be used to sign in."""

    __tablename__ = "auth_sessions"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    user = relationship("User", back_populates="sessions")


class Project(Base):
    """A researcher's saved workspace — a named collection of items they've
    pulled from search results, plus free-text notes."""

    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=_now)

    # Nullable only for projects created before accounts existed; those have
    # no owner and are not reachable through the API.
    owner_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    # Capability token for a read-only share link. Stored in the clear because
    # the owner needs to see the link again; revoking it is setting it to NULL.
    share_token = Column(String, nullable=True, unique=True)

    owner = relationship("User", back_populates="projects")

    items = relationship("SavedItem", back_populates="project", cascade="all, delete-orphan")
    alignments = relationship(
        "SavedAlignment", back_populates="project", cascade="all, delete-orphan"
    )


class SavedItem(Base):
    """A single database result (gene, protein, structure, pathway...) saved
    into a project, with the source it came from and when it was retrieved —
    provenance a researcher needs for methods sections and lab notebooks."""

    __tablename__ = "saved_items"

    id = Column(String, primary_key=True, default=_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)

    external_id = Column(String, nullable=False)  # e.g. UniProt accession, PDB id
    name = Column(String, nullable=False)
    database = Column(String, nullable=False)  # e.g. "UniProt", "PDB", "NCBI Gene"
    description = Column(Text, default="")
    link = Column(String, default="")
    notes = Column(Text, default="")

    retrieved_at = Column(DateTime(timezone=True), default=_now)
    saved_at = Column(DateTime(timezone=True), default=_now)

    # JSON: source release, entry/sequence version, checksum and Helix build
    # (see provenance.py). Nullable — rows saved before it existed have none,
    # and are reported as such rather than back-filled with a guess.
    provenance = Column(Text, nullable=True)

    project = relationship("Project", back_populates="items")


class SavedAlignment(Base):
    """
    An alignment saved into a project.

    Projects previously held only external database records; this makes them
    hold analyses too, so a project becomes the full record of a piece of
    work rather than just a bookmark list. Inputs are stored alongside the
    result so an alignment stays reproducible — the parameters that produced
    it are as much part of the finding as the score.
    """

    __tablename__ = "saved_alignments"

    id = Column(String, primary_key=True, default=_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)

    algorithm = Column(String, nullable=False)  # "needleman-wunsch" | "smith-waterman"
    label1 = Column(String, default="Sequence 1")
    label2 = Column(String, default="Sequence 2")

    seq1 = Column(Text, nullable=False)
    seq2 = Column(Text, nullable=False)
    aligned_seq1 = Column(Text, nullable=False)
    aligned_seq2 = Column(Text, nullable=False)

    score = Column(Float, nullable=False)
    identity_pct = Column(Float, default=0.0)
    similarity_pct = Column(Float, default=0.0)
    gaps = Column(Integer, default=0)
    length = Column(Integer, default=0)

    # The scoring parameters, JSON-encoded — without these the score is not
    # reproducible or comparable against another alignment.
    params = Column(Text, default="{}")
    notes = Column(Text, default="")

    # JSON: the Helix build and library versions that computed it.
    provenance = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=_now)

    project = relationship("Project", back_populates="alignments")
