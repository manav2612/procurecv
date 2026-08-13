import enum
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SessionStatus(str, enum.Enum):
    active = "active"
    completed = "completed"


class TranscriptionSession(Base):
    """A single recording session. Named to avoid clashing with sqlalchemy.orm.Session."""

    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    status = Column(Enum(SessionStatus), default=SessionStatus.active, nullable=False)
    language_hint = Column(String, nullable=True)

    segments = relationship(
        "TranscriptSegment",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="TranscriptSegment.start_ts",
    )


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    text = Column(Text, nullable=False)
    start_ts = Column(Float, nullable=False)
    end_ts = Column(Float, nullable=False)
    confidence = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    session = relationship("TranscriptionSession", back_populates="segments")
