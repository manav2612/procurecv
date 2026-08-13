from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import SessionStatus


class SegmentBase(BaseModel):
    text: str
    start_ts: float
    end_ts: float
    confidence: float | None = None


class SegmentCreate(SegmentBase):
    pass


class SegmentUpdate(BaseModel):
    text: str | None = None
    start_ts: float | None = None
    end_ts: float | None = None
    confidence: float | None = None


class Segment(SegmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    created_at: datetime


class SessionBase(BaseModel):
    language_hint: str | None = None


class SessionCreate(SessionBase):
    pass


class SessionUpdate(BaseModel):
    status: SessionStatus | None = None
    language_hint: str | None = None


class Session(SessionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    status: SessionStatus


class SessionWithSegments(Session):
    segments: list[Segment] = []
