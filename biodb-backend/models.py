import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Float, Integer
from sqlalchemy.orm import relationship

from db import Base


def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class Project(Base):
    """A researcher's saved workspace — a named collection of items they've
    pulled from search results, plus free-text notes."""

    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=_now)

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

    created_at = Column(DateTime(timezone=True), default=_now)

    project = relationship("Project", back_populates="alignments")
