"""
Projects (saved workspaces), their items and alignments, and share links.

Every owner route goes through owned_project, so ownership is checked in
exactly one place. Another user's project is a 404, not a 403: a 403 would
confirm that the id exists.
"""

import json
import secrets
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import auth
import db as db_module
import methods_service
import models
import provenance as prov

router = APIRouter(tags=["Projects"])


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class SavedItemCreate(BaseModel):
    external_id: str
    name: str
    database: str
    description: str = ""
    link: str = ""
    retrieved_at: Optional[str] = None
    notes: str = ""
    # Captured when the record was retrieved (see provenance.py) and passed
    # back on save, so it describes the retrieval rather than the save.
    provenance: Optional[Dict] = None


class BulkSavedItemsCreate(BaseModel):
    items: List[SavedItemCreate]


class SavedAlignmentCreate(BaseModel):
    algorithm: str
    label1: str = "Sequence 1"
    label2: str = "Sequence 2"
    seq1: str
    seq2: str
    aligned_seq1: str
    aligned_seq2: str
    score: float
    identity_pct: float = 0.0
    similarity_pct: float = 0.0
    gaps: int = 0
    length: int = 0
    params: Dict = {}
    notes: str = ""
    provenance: Optional[Dict] = None


# ---- Serialisation (shared with the account export) ----


def serialize_alignment(a: models.SavedAlignment) -> dict:
    try:
        params = json.loads(a.params or "{}")
    except ValueError:
        params = {}
    return {
        "id": a.id,
        "algorithm": a.algorithm,
        "label1": a.label1,
        "label2": a.label2,
        "seq1": a.seq1,
        "seq2": a.seq2,
        "aligned_seq1": a.aligned_seq1,
        "aligned_seq2": a.aligned_seq2,
        "score": a.score,
        "identity_pct": a.identity_pct,
        "similarity_pct": a.similarity_pct,
        "gaps": a.gaps,
        "length": a.length,
        "params": params,
        "notes": a.notes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "provenance": prov.loads(a.provenance),
        # Derived, not stored: always consistent with the sequences above,
        # and comparable against UniProt's own CRC64 for the same entry.
        "checksums": {
            "seq1": prov.sequence_checksum(a.seq1),
            "seq2": prov.sequence_checksum(a.seq2),
        },
    }


def serialize_item(item: models.SavedItem) -> dict:
    return {
        "id": item.id,
        "external_id": item.external_id,
        "name": item.name,
        "database": item.database,
        "description": item.description,
        "link": item.link,
        "notes": item.notes,
        "retrieved_at": item.retrieved_at.isoformat() if item.retrieved_at else None,
        "saved_at": item.saved_at.isoformat() if item.saved_at else None,
        "provenance": prov.loads(item.provenance),
    }


def serialize_project(
    project: models.Project, include_items: bool = False, for_owner: bool = True
) -> dict:
    data = {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "item_count": len(project.items),
        "alignment_count": len(project.alignments),
    }
    if for_owner:
        # The share link is the owner's to see; it is the read-only credential.
        data["share_token"] = project.share_token
    if include_items:
        data["items"] = [serialize_item(i) for i in project.items]
        data["alignments"] = [serialize_alignment(a) for a in project.alignments]
    return data


# ---- Projects ----


def owned_project(session: Session, project_id: str, user: models.User) -> models.Project:
    project = (
        session.query(models.Project)
        .filter(models.Project.id == project_id, models.Project.owner_id == user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/projects")
def create_project(
    payload: ProjectCreate,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    project = models.Project(name=payload.name, description=payload.description, owner_id=user.id)
    session.add(project)
    session.commit()
    session.refresh(project)
    return serialize_project(project)


@router.get("/projects")
def list_projects(
    user: models.User = Depends(auth.current_user), session: Session = Depends(db_module.get_db)
):
    projects = (
        session.query(models.Project)
        .filter(models.Project.owner_id == user.id)
        .order_by(models.Project.created_at.desc())
        .all()
    )
    return [serialize_project(p) for p in projects]


@router.get("/projects/{project_id}")
def get_project(
    project_id: str,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    return serialize_project(owned_project(session, project_id, user), include_items=True)


@router.get("/projects/{project_id}/methods")
def project_methods(
    project_id: str,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    """
    A methods section for a project: prose, references, and a records table.

    Built only from what the project's provenance recorded — see
    methods_service.py for the rules it holds to.
    """
    project = owned_project(session, project_id, user)
    return methods_service.build(serialize_project(project, include_items=True))


@router.delete("/projects/{project_id}")
def delete_project(
    project_id: str,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    project = owned_project(session, project_id, user)
    session.delete(project)
    session.commit()
    return {"deleted": project_id}


# ---- Share links ----
# A read-only view of one project for anyone holding the link — a reviewer,
# a collaborator without an account. The token is the only credential, so it
# is long and random, and revoking it is immediate.


@router.post("/projects/{project_id}/share")
def share_project(
    project_id: str,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    project = owned_project(session, project_id, user)
    if not project.share_token:
        project.share_token = secrets.token_urlsafe(18)
        session.commit()
    return {"share_token": project.share_token}


@router.delete("/projects/{project_id}/share")
def unshare_project(
    project_id: str,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    project = owned_project(session, project_id, user)
    project.share_token = None
    session.commit()
    return {"share_token": None}


def _shared_project(session: Session, token: str) -> models.Project:
    project = session.query(models.Project).filter(models.Project.share_token == token).first() if token else None
    if not project:
        raise HTTPException(status_code=404, detail="This link is invalid or has been revoked.")
    return project


@router.get("/shared/{token}")
def get_shared_project(token: str, session: Session = Depends(db_module.get_db)):
    project = _shared_project(session, token)
    data = serialize_project(project, include_items=True, for_owner=False)
    data["owner"] = project.owner.username if project.owner else None
    data["read_only"] = True
    return data


@router.get("/shared/{token}/methods")
def get_shared_methods(token: str, session: Session = Depends(db_module.get_db)):
    project = _shared_project(session, token)
    return methods_service.build(serialize_project(project, include_items=True, for_owner=False))


# ---- Items and alignments ----


def _parse_retrieved_at(value: Optional[str]):
    # retrieved_at must reflect when the data was fetched from the source
    # database, not when the user clicked save — otherwise a result found
    # yesterday and saved today carries a citation date that's simply wrong.
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None  # unparseable: fall back to the column default


def _build_saved_item(project_id: str, payload: SavedItemCreate) -> models.SavedItem:
    retrieved_at = _parse_retrieved_at(payload.retrieved_at)
    # Prefer provenance captured at retrieval. Without it (an older client),
    # record what is known now and say so: captured "save", no release.
    provenance = prov.accept(payload.provenance) or prov.record(
        payload.database,
        record_id=payload.external_id,
        retrieved_at=payload.retrieved_at,
        captured="save",
    )
    return models.SavedItem(
        project_id=project_id,
        external_id=payload.external_id,
        name=payload.name,
        database=payload.database,
        description=payload.description,
        link=payload.link,
        notes=payload.notes,
        provenance=prov.dumps(provenance),
        **({"retrieved_at": retrieved_at} if retrieved_at else {}),
    )


@router.post("/projects/{project_id}/items")
def add_item(
    project_id: str,
    payload: SavedItemCreate,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    owned_project(session, project_id, user)

    item = _build_saved_item(project_id, payload)
    session.add(item)
    session.commit()
    session.refresh(item)
    return serialize_item(item)


@router.post("/projects/{project_id}/items/bulk")
def add_items_bulk(
    project_id: str,
    payload: BulkSavedItemsCreate,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    """
    Save many results into a project in one round trip.

    Exists for batch lookup: saving results one row at a time from a
    100-gene batch would mean 100 sequential requests against a free-tier
    backend that can be cold-starting. One request, one commit.
    """
    owned_project(session, project_id, user)

    if not payload.items:
        raise HTTPException(status_code=400, detail="No items provided")

    items = [_build_saved_item(project_id, item) for item in payload.items]
    session.add_all(items)
    session.commit()
    for item in items:
        session.refresh(item)

    return {"saved": len(items), "items": [serialize_item(i) for i in items]}


@router.delete("/projects/{project_id}/items/{item_id}")
def remove_item(
    project_id: str,
    item_id: str,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    owned_project(session, project_id, user)
    item = (
        session.query(models.SavedItem)
        .filter(models.SavedItem.id == item_id, models.SavedItem.project_id == project_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    session.delete(item)
    session.commit()
    return {"deleted": item_id}


@router.post("/projects/{project_id}/alignments")
def add_alignment(
    project_id: str,
    payload: SavedAlignmentCreate,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    """Save an alignment result into a project."""
    owned_project(session, project_id, user)

    alignment = models.SavedAlignment(
        project_id=project_id,
        algorithm=payload.algorithm,
        label1=payload.label1,
        label2=payload.label2,
        seq1=payload.seq1,
        seq2=payload.seq2,
        aligned_seq1=payload.aligned_seq1,
        aligned_seq2=payload.aligned_seq2,
        score=payload.score,
        identity_pct=payload.identity_pct,
        similarity_pct=payload.similarity_pct,
        gaps=payload.gaps,
        length=payload.length,
        params=json.dumps(payload.params),
        notes=payload.notes,
        provenance=prov.dumps(
            prov.accept(payload.provenance) or {**prov.computation(), "captured": "save"}
        ),
    )
    session.add(alignment)
    session.commit()
    session.refresh(alignment)
    return serialize_alignment(alignment)


@router.delete("/projects/{project_id}/alignments/{alignment_id}")
def remove_alignment(
    project_id: str,
    alignment_id: str,
    user: models.User = Depends(auth.current_user),
    session: Session = Depends(db_module.get_db),
):
    owned_project(session, project_id, user)
    alignment = (
        session.query(models.SavedAlignment)
        .filter(
            models.SavedAlignment.id == alignment_id,
            models.SavedAlignment.project_id == project_id,
        )
        .first()
    )
    if not alignment:
        raise HTTPException(status_code=404, detail="Alignment not found")
    session.delete(alignment)
    session.commit()
    return {"deleted": alignment_id}
