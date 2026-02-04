from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from models.session import (
    ContrastResult,
    ContrastResultCreate,
    ContrastResultResponse,
    RUN_STATUS_ACTIVE,
    RUN_STATUS_CANCELLED,
    RUN_STATUS_COMPLETED,
    RUN_STATUS_CREATED,
    SessionProfile,
    SessionProfileCreate,
    SessionProfileResponse,
    SessionRun,
    SessionRunCreate,
    SessionRunResponse,
    SessionTrial,
    SessionTrialCreate,
    SessionTrialResponse,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _get_run(run_id: int, db: Session) -> SessionRun:
    run = db.query(SessionRun).filter(SessionRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Session run not found")
    return run


def _get_trial(trial_id: int, db: Session) -> SessionTrial:
    trial = db.query(SessionTrial).filter(SessionTrial.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail="Session trial not found")
    return trial


@router.post("/profiles", response_model=SessionProfileResponse)
def create_session_profile(
    profile: SessionProfileCreate, db: Session = Depends(get_db)
):
    db_profile = SessionProfile(**profile.model_dump())
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return db_profile


@router.post("/runs", response_model=SessionRunResponse)
def create_session_run(run: SessionRunCreate, db: Session = Depends(get_db)):
    db_run = SessionRun(**run.model_dump(), status=RUN_STATUS_CREATED)
    db.add(db_run)
    db.commit()
    db.refresh(db_run)
    return db_run


@router.get("/runs/{run_id}", response_model=SessionRunResponse)
def read_session_run(run_id: int, db: Session = Depends(get_db)):
    return _get_run(run_id, db)


@router.post("/runs/{run_id}/start", response_model=SessionRunResponse)
def start_session_run(run_id: int, db: Session = Depends(get_db)):
    db_run = _get_run(run_id, db)
    if db_run.status != RUN_STATUS_CREATED:
        raise HTTPException(
            status_code=409, detail="Session run cannot be started"
        )
    db_run.status = RUN_STATUS_ACTIVE
    db_run.started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_run)
    return db_run


@router.post("/runs/{run_id}/complete", response_model=SessionRunResponse)
def complete_session_run(run_id: int, db: Session = Depends(get_db)):
    db_run = _get_run(run_id, db)
    if db_run.status != RUN_STATUS_ACTIVE:
        raise HTTPException(
            status_code=409, detail="Session run cannot be completed"
        )
    db_run.status = RUN_STATUS_COMPLETED
    db_run.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_run)
    return db_run


@router.post("/runs/{run_id}/cancel", response_model=SessionRunResponse)
def cancel_session_run(run_id: int, db: Session = Depends(get_db)):
    db_run = _get_run(run_id, db)
    if db_run.status in {RUN_STATUS_COMPLETED, RUN_STATUS_CANCELLED}:
        raise HTTPException(
            status_code=409, detail="Session run cannot be cancelled"
        )
    db_run.status = RUN_STATUS_CANCELLED
    db_run.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_run)
    return db_run


@router.post("/runs/{run_id}/trials", response_model=SessionTrialResponse)
def create_session_trial(
    run_id: int, trial: SessionTrialCreate, db: Session = Depends(get_db)
):
    _get_run(run_id, db)
    db_trial = SessionTrial(run_id=run_id, **trial.model_dump())
    db.add(db_trial)
    db.commit()
    db.refresh(db_trial)
    return db_trial


@router.post(
    "/trials/{trial_id}/contrast-results", response_model=ContrastResultResponse
)
def create_contrast_result(
    trial_id: int, result: ContrastResultCreate, db: Session = Depends(get_db)
):
    _get_trial(trial_id, db)
    db_result = ContrastResult(trial_id=trial_id, **result.model_dump())
    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    return db_result
