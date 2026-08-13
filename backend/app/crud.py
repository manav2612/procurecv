from sqlalchemy.orm import Session as DBSession

from app import models, schemas


def create_session(db: DBSession, session_in: schemas.SessionCreate) -> models.TranscriptionSession:
    db_session = models.TranscriptionSession(language_hint=session_in.language_hint)
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


def get_session(db: DBSession, session_id: int) -> models.TranscriptionSession | None:
    return db.get(models.TranscriptionSession, session_id)


def list_sessions(db: DBSession, skip: int = 0, limit: int = 100) -> list[models.TranscriptionSession]:
    return (
        db.query(models.TranscriptionSession)
        .order_by(models.TranscriptionSession.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def update_session(
    db: DBSession, session_id: int, session_in: schemas.SessionUpdate
) -> models.TranscriptionSession | None:
    db_session = get_session(db, session_id)
    if db_session is None:
        return None
    for field, value in session_in.model_dump(exclude_unset=True).items():
        setattr(db_session, field, value)
    db.commit()
    db.refresh(db_session)
    return db_session


def delete_session(db: DBSession, session_id: int) -> bool:
    db_session = get_session(db, session_id)
    if db_session is None:
        return False
    db.delete(db_session)
    db.commit()
    return True


def create_segment(
    db: DBSession, session_id: int, segment_in: schemas.SegmentCreate
) -> models.TranscriptSegment:
    db_segment = models.TranscriptSegment(session_id=session_id, **segment_in.model_dump())
    db.add(db_segment)
    db.commit()
    db.refresh(db_segment)
    return db_segment


def get_segment(db: DBSession, segment_id: int) -> models.TranscriptSegment | None:
    return db.get(models.TranscriptSegment, segment_id)


def update_segment(
    db: DBSession, segment_id: int, segment_in: schemas.SegmentUpdate
) -> models.TranscriptSegment | None:
    db_segment = get_segment(db, segment_id)
    if db_segment is None:
        return None
    for field, value in segment_in.model_dump(exclude_unset=True).items():
        setattr(db_segment, field, value)
    db.commit()
    db.refresh(db_segment)
    return db_segment


def delete_segment(db: DBSession, segment_id: int) -> bool:
    db_segment = get_segment(db, segment_id)
    if db_segment is None:
        return False
    db.delete(db_segment)
    db.commit()
    return True
