import json
import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from db.database import get_db
from models.test import (
    Run,
    RunCreate,
    RunResponse,
    RunSummary,
    TestCombination,
    Test,
    Rectangle,
)
from crud.settings import get_pretest_settings
from algorithm_to_find_combinations.pretest import (
    create_pretest_state,
    get_pretest_trial,
    process_pretest_result,
    serialize_pretest_state,
    deserialize_pretest_state,
)
from algorithm_to_find_combinations.algorithm import (
    AlgorithmState,
    get_next_combination,
    update_state,
)
from routers.test_combination_router import _load_algorithm_state, _sync_algorithm_state

router = APIRouter(prefix="/runs", tags=["runs"])

orientations = ["N", "E", "S", "W"]


def _save_pretest_state(run: Run, state, db: Session):
    run.pretest_state_json = json.dumps(serialize_pretest_state(state))
    run.pretest_warnings = json.dumps(state.warnings)
    db.commit()


def _load_pretest_state(run: Run):
    if not run.pretest_state_json:
        return None
    data = json.loads(run.pretest_state_json)
    return deserialize_pretest_state(data)


@router.post("/", response_model=RunResponse)
def create_run(run_data: RunCreate, db: Session = Depends(get_db)):
    """Create a new run for a test."""
    test = db.query(Test).filter(Test.id == run_data.test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    run = Run(
        test_id=run_data.test_id,
        pretest_mode=run_data.pretest_mode,
    )

    if run_data.pretest_mode == "run":
        settings = get_pretest_settings(db)
        # Override global limits with test bounds
        settings.global_limits.min_triangle_size = test.min_triangle_size
        settings.global_limits.max_triangle_size = test.max_triangle_size
        settings.global_limits.min_saturation = test.min_saturation
        settings.global_limits.max_saturation = test.max_saturation
        pretest_state = create_pretest_state(settings)
        run.status = "pretest"
        run.pretest_state_json = json.dumps(serialize_pretest_state(pretest_state))
        run.pretest_warnings = json.dumps([])

    elif run_data.pretest_mode == "manual":
        if (
            run_data.pretest_size_min is None
            or run_data.pretest_size_max is None
            or run_data.pretest_saturation_min is None
            or run_data.pretest_saturation_max is None
        ):
            raise HTTPException(
                status_code=422,
                detail="Manual mode requires all four bounds (pretest_size_min/max, pretest_saturation_min/max)",
            )
        run.pretest_size_min = run_data.pretest_size_min
        run.pretest_size_max = run_data.pretest_size_max
        run.pretest_saturation_min = run_data.pretest_saturation_min
        run.pretest_saturation_max = run_data.pretest_saturation_max
        run.status = "main"
        # Create initial rectangle for the main phase
        _create_initial_rectangle(db, run_data.test_id, run)

    elif run_data.pretest_mode == "reuse_last":
        last_run = (
            db.query(Run)
            .filter(
                Run.test_id == run_data.test_id,
                Run.status.in_(["main", "completed"]),
                Run.pretest_size_min.isnot(None),
            )
            .order_by(Run.created_at.desc())
            .first()
        )
        if not last_run:
            raise HTTPException(
                status_code=404,
                detail="No previous completed run with pretest bounds found",
            )
        run.pretest_size_min = last_run.pretest_size_min
        run.pretest_size_max = last_run.pretest_size_max
        run.pretest_saturation_min = last_run.pretest_saturation_min
        run.pretest_saturation_max = last_run.pretest_saturation_max
        run.status = "main"
        _create_initial_rectangle(db, run_data.test_id, run)

    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _create_initial_rectangle(db: Session, test_id: int, run: Run):
    """Create a single rectangle covering the pretest-derived bounds."""
    # Delete existing rectangles for this test to start fresh for the run
    # Note: we don't delete old rectangles since other runs may use them
    # Instead, the algorithm will create rectangles as needed
    pass


@router.get("/{run_id}", response_model=RunResponse)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/{run_id}/next")
def get_next_trial(run_id: int, db: Session = Depends(get_db)):
    """Get the next trial for a run."""
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    total_samples = (
        db.query(TestCombination)
        .filter(TestCombination.run_id == run_id)
        .count()
    )

    if run.status == "pretest":
        pretest_state = _load_pretest_state(run)
        if pretest_state is None or pretest_state.is_complete:
            raise HTTPException(status_code=400, detail="Pretest is already complete")
        trial = get_pretest_trial(pretest_state)
        return {
            "test_id": run.test_id,
            "run_id": run.id,
            "rectangle_id": None,
            "triangle_size": trial["triangle_size"],
            "saturation": trial["saturation"],
            "orientation": trial["orientation"],
            "success": 0,
            "phase": "pretest",
            "total_samples": total_samples,
        }

    elif run.status == "main":
        # Use pretest bounds as the search window
        test = db.query(Test).filter(Test.id == run.test_id).first()
        size_bounds = (
            run.pretest_size_min if run.pretest_size_min is not None else test.min_triangle_size,
            run.pretest_size_max if run.pretest_size_max is not None else test.max_triangle_size,
        )
        sat_bounds = (
            run.pretest_saturation_min if run.pretest_saturation_min is not None else test.min_saturation,
            run.pretest_saturation_max if run.pretest_saturation_max is not None else test.max_saturation,
        )

        # Load rectangles for this test
        db_rectangles = db.query(Rectangle).filter(Rectangle.test_id == run.test_id).all()
        rectangles = []
        for rect in db_rectangles:
            rectangles.append({
                "bounds": {
                    "triangle_size": (rect.min_triangle_size, rect.max_triangle_size),
                    "saturation": (rect.min_saturation, rect.max_saturation),
                },
                "area": rect.area,
                "true_samples": rect.true_samples,
                "false_samples": rect.false_samples,
            })

        state = AlgorithmState(size_bounds, sat_bounds, rectangles if rectangles else None)
        combination, selected_rect = get_next_combination(state)
        if not combination:
            raise HTTPException(status_code=404, detail="No more combinations to test")

        _sync_algorithm_state(state, run.test_id, db)

        db_rectangle = (
            db.query(Rectangle)
            .filter(
                Rectangle.test_id == run.test_id,
                Rectangle.min_triangle_size == selected_rect["bounds"]["triangle_size"][0],
                Rectangle.max_triangle_size == selected_rect["bounds"]["triangle_size"][1],
                Rectangle.min_saturation == selected_rect["bounds"]["saturation"][0],
                Rectangle.max_saturation == selected_rect["bounds"]["saturation"][1],
            )
            .first()
        )

        return {
            "test_id": run.test_id,
            "run_id": run.id,
            "rectangle_id": db_rectangle.id if db_rectangle else None,
            "triangle_size": combination["triangle_size"],
            "saturation": combination["saturation"],
            "orientation": random.choice(orientations),
            "success": 0,
            "phase": "main",
            "total_samples": total_samples,
        }

    else:
        raise HTTPException(status_code=400, detail="Run is already completed")


from pydantic import BaseModel
from typing import Literal


class RunTrialResult(BaseModel):
    triangle_size: float
    saturation: float
    orientation: Literal["N", "E", "S", "W"]
    success: int


@router.post("/{run_id}/result")
def submit_run_result(run_id: int, result: RunTrialResult, db: Session = Depends(get_db)):
    """Submit the result of a trial within a run."""
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    success_bool = bool(result.success)

    if run.status == "pretest":
        pretest_state = _load_pretest_state(run)
        if pretest_state is None:
            raise HTTPException(status_code=400, detail="No pretest state found")

        pretest_state = process_pretest_result(pretest_state, success_bool)

        # Save combination record
        db_combination = TestCombination(
            test_id=run.test_id,
            run_id=run.id,
            triangle_size=result.triangle_size,
            saturation=result.saturation,
            orientation=result.orientation,
            success=result.success,
            phase="pretest",
            rectangle_id=None,
        )
        db.add(db_combination)

        if pretest_state.is_complete:
            # Transition to main phase
            run.pretest_size_min = pretest_state.size_lower
            run.pretest_size_max = pretest_state.size_upper
            run.pretest_saturation_min = pretest_state.saturation_lower
            run.pretest_saturation_max = pretest_state.saturation_upper
            run.status = "main"
            run.pretest_warnings = json.dumps(pretest_state.warnings)

        _save_pretest_state(run, pretest_state, db)
        db.commit()

        return {
            "message": "Pretest result recorded",
            "phase": "pretest",
            "is_complete": pretest_state.is_complete,
            "status": run.status,
        }

    elif run.status == "main":
        # Find the rectangle for this combination
        test = db.query(Test).filter(Test.id == run.test_id).first()
        size_bounds = (
            run.pretest_size_min if run.pretest_size_min is not None else test.min_triangle_size,
            run.pretest_size_max if run.pretest_size_max is not None else test.max_triangle_size,
        )
        sat_bounds = (
            run.pretest_saturation_min if run.pretest_saturation_min is not None else test.min_saturation,
            run.pretest_saturation_max if run.pretest_saturation_max is not None else test.max_saturation,
        )

        # Load algorithm state
        db_rectangles = db.query(Rectangle).filter(Rectangle.test_id == run.test_id).all()
        rectangles = []
        for rect in db_rectangles:
            rectangles.append({
                "bounds": {
                    "triangle_size": (rect.min_triangle_size, rect.max_triangle_size),
                    "saturation": (rect.min_saturation, rect.max_saturation),
                },
                "area": rect.area,
                "true_samples": rect.true_samples,
                "false_samples": rect.false_samples,
            })

        state = AlgorithmState(size_bounds, sat_bounds, rectangles if rectangles else None)

        # Find which rectangle contains this point
        selected_rect = None
        for rect in state.rectangles:
            ts_bounds = rect["bounds"]["triangle_size"]
            sat_bounds_r = rect["bounds"]["saturation"]
            if (
                ts_bounds[0] <= result.triangle_size <= ts_bounds[1]
                and sat_bounds_r[0] <= result.saturation <= sat_bounds_r[1]
            ):
                selected_rect = rect
                break

        # Find db rectangle
        db_rect = None
        if selected_rect:
            db_rect = (
                db.query(Rectangle)
                .filter(
                    Rectangle.test_id == run.test_id,
                    Rectangle.min_triangle_size == selected_rect["bounds"]["triangle_size"][0],
                    Rectangle.max_triangle_size == selected_rect["bounds"]["triangle_size"][1],
                    Rectangle.min_saturation == selected_rect["bounds"]["saturation"][0],
                    Rectangle.max_saturation == selected_rect["bounds"]["saturation"][1],
                )
                .first()
            )

        # Update rectangle stats
        if db_rect:
            if result.success:
                db_rect.true_samples += 1
            else:
                db_rect.false_samples += 1

        # Create combination record
        db_combination = TestCombination(
            test_id=run.test_id,
            run_id=run.id,
            rectangle_id=db_rect.id if db_rect else None,
            triangle_size=result.triangle_size,
            saturation=result.saturation,
            orientation=result.orientation,
            success=result.success,
            phase="main",
        )
        db.add(db_combination)
        db.commit()

        # Update algorithm state (split rectangles if needed)
        if selected_rect:
            state = update_state(
                state, selected_rect, result.model_dump(), success_bool
            )
            _sync_algorithm_state(state, run.test_id, db)

        return {"message": "Main result recorded", "phase": "main"}

    else:
        raise HTTPException(status_code=400, detail="Run is already completed")


@router.get("/{run_id}/summary", response_model=RunSummary)
def get_run_summary(run_id: int, db: Session = Depends(get_db)):
    """Get a summary of a run including trial counts and pretest bounds."""
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    pretest_count = (
        db.query(TestCombination)
        .filter(TestCombination.run_id == run_id, TestCombination.phase == "pretest")
        .count()
    )
    main_count = (
        db.query(TestCombination)
        .filter(TestCombination.run_id == run_id, TestCombination.phase == "main")
        .count()
    )

    pretest_bounds = None
    if run.pretest_size_min is not None:
        pretest_bounds = {
            "size_min": run.pretest_size_min,
            "size_max": run.pretest_size_max,
            "saturation_min": run.pretest_saturation_min,
            "saturation_max": run.pretest_saturation_max,
        }

    warnings = []
    if run.pretest_warnings:
        try:
            warnings = json.loads(run.pretest_warnings)
        except (json.JSONDecodeError, TypeError):
            warnings = []

    return RunSummary(
        id=run.id,
        test_id=run.test_id,
        status=run.status,
        pretest_mode=run.pretest_mode,
        pretest_bounds=pretest_bounds,
        pretest_warnings=warnings,
        pretest_trial_count=pretest_count,
        main_trials_count=main_count,
        total_trials_count=pretest_count + main_count,
    )


@router.get("/test/{test_id}", response_model=List[RunResponse])
def get_runs_for_test(test_id: int, db: Session = Depends(get_db)):
    """List all runs for a test."""
    runs = (
        db.query(Run)
        .filter(Run.test_id == test_id)
        .order_by(Run.created_at.desc())
        .all()
    )
    return runs
