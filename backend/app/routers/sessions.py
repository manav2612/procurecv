from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from app import crud, schemas
from app.database import get_db

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=schemas.Session, status_code=201)
def create_session(session_in: schemas.SessionCreate, db: DBSession = Depends(get_db)):
    return crud.create_session(db, session_in)


@router.get("", response_model=list[schemas.Session])
def list_sessions(skip: int = 0, limit: int = 100, db: DBSession = Depends(get_db)):
    return crud.list_sessions(db, skip, limit)


@router.get("/{session_id}", response_model=schemas.SessionWithSegments)
def get_session(session_id: int, db: DBSession = Depends(get_db)):
    session = crud.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.put("/{session_id}", response_model=schemas.Session)
def update_session(session_id: int, session_in: schemas.SessionUpdate, db: DBSession = Depends(get_db)):
    session = crud.update_session(db, session_id, session_in)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: int, db: DBSession = Depends(get_db)):
    if not crud.delete_session(db, session_id):
        raise HTTPException(status_code=404, detail="Session not found")
