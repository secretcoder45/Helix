import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, DateTime, ForeignKey
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
