from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Column, DateTime, Enum as SqlEnum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from db.database import Base


class RunStatus(str, Enum):
    CREATED = "created"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


RUN_STATUS_CREATED = RunStatus.CREATED.value
RUN_STATUS_ACTIVE = RunStatus.ACTIVE.value
RUN_STATUS_COMPLETED = RunStatus.COMPLETED.value
RUN_STATUS_CANCELLED = RunStatus.CANCELLED.value


class SessionProfile(Base):
    __tablename__ = "session_profiles"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    runs = relationship("SessionRun", back_populates="profile")


class SessionRun(Base):
    __tablename__ = "session_runs"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=True)
    profile_id = Column(Integer, ForeignKey("session_profiles.id"), nullable=True)
    status = Column(SqlEnum(RunStatus), default=RunStatus.CREATED)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)

    profile = relationship("SessionProfile", back_populates="runs")
    trials = relationship("SessionTrial", back_populates="run")


class SessionTrial(Base):
    __tablename__ = "session_trials"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("session_runs.id"))
    trial_index = Column(Integer, nullable=True)
    triangle_size = Column(Float, nullable=True)
    saturation = Column(Float, nullable=True)
    orientation = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    run = relationship("SessionRun", back_populates="trials")
    contrast_results = relationship("ContrastResult", back_populates="trial")


class ContrastResult(Base):
    __tablename__ = "contrast_results"

    id = Column(Integer, primary_key=True, index=True)
    trial_id = Column(Integer, ForeignKey("session_trials.id"))
    contrast = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    trial = relationship("SessionTrial", back_populates="contrast_results")


class SessionProfileBase(BaseModel):
    label: str | None = None


class SessionProfileCreate(SessionProfileBase):
    pass


class SessionProfileResponse(SessionProfileBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SessionRunBase(BaseModel):
    test_id: int | None = None
    profile_id: int | None = None


class SessionRunCreate(SessionRunBase):
    pass


class SessionRunResponse(SessionRunBase):
    id: int
    status: RunStatus
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SessionTrialCreate(BaseModel):
    trial_index: int | None = None
    triangle_size: float | None = None
    saturation: float | None = None
    orientation: Literal["N", "E", "S", "W"] | None = Field(
        default=None, description="Cardinal orientation (N, E, S, W)."
    )


class SessionTrialResponse(SessionTrialCreate):
    id: int
    run_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ContrastResultCreate(BaseModel):
    contrast: float | None = None


class ContrastResultResponse(ContrastResultCreate):
    id: int
    trial_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
