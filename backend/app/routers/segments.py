from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from app import crud, schemas
from app.database import get_db

router = APIRouter(prefix="/api", tags=["segments"])


@router.post("/sessions/{session_id}/segments", response_model=schemas.Segment, status_code=201)
def create_segment(session_id: int, segment_in: schemas.SegmentCreate, db: DBSession = Depends(get_db)):
    if crud.get_session(db, session_id) is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return crud.create_segment(db, session_id, segment_in)


@router.put("/segments/{segment_id}", response_model=schemas.Segment)
def update_segment(segment_id: int, segment_in: schemas.SegmentUpdate, db: DBSession = Depends(get_db)):
    segment = crud.update_segment(db, segment_id, segment_in)
    if segment is None:
        raise HTTPException(status_code=404, detail="Segment not found")
    return segment


@router.delete("/segments/{segment_id}", status_code=204)
def delete_segment(segment_id: int, db: DBSession = Depends(get_db)):
    if not crud.delete_segment(db, segment_id):
        raise HTTPException(status_code=404, detail="Segment not found")
