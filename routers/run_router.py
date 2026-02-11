import json
from datetime import datetime
import io
import random
import base64
import matplotlib
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Literal, Optional
from db.database import get_db
from models.test import Run, TestCombination, Test, Rectangle
from schemas.test import RunCreate, RunResponse, RunSummary, ORIENTATIONS
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
    selection_probability,
)
from crud.algorithm_state import sync_algorithm_state, build_algorithm_rectangles
from algorithm_to_find_combinations.ground_truth import compute_probability
from algorithm_to_find_combinations.plotting import create_single_smooth_plot
from algorithm_to_find_combinations.axis_methods import (
    AxisBounds,
    build_axis_analysis,
    choose_next_trial,
)
from routers.settings_router import _resolve_model

matplotlib.use("Agg")
import matplotlib.pyplot as plt

router = APIRouter(prefix="/runs", tags=["runs"])

ADAPTIVE_METHOD = "adaptive_rectangles"
AXIS_METHODS = {"axis_logistic", "axis_isotonic"}


def _run_method(run: Run) -> str:
    return run.method or ADAPTIVE_METHOD


def _is_axis_method(run: Run) -> bool:
    return _run_method(run) in AXIS_METHODS


def _axis_bounds(db: Session) -> AxisBounds:
    settings = get_pretest_settings(db)
    limits = settings.global_limits
    return AxisBounds(
        size_min=limits.min_triangle_size,
        size_max=limits.max_triangle_size,
        saturation_min=limits.min_saturation,
        saturation_max=limits.max_saturation,
    )


def _axis_trials_for_run(db: Session, run_id: int) -> List[TestCombination]:
    return (
        db.query(TestCombination)
        .filter(TestCombination.run_id == run_id, TestCombination.phase == "axis")
        .order_by(TestCombination.created_at.asc())
        .all()
    )


def _run_response_payload(run: Run) -> dict:
    return {
        "id": run.id,
        "test_id": run.test_id,
        "name": run.name,
        "method": _run_method(run),
        "axis_switch_policy": run.axis_switch_policy,
        "pretest_mode": run.pretest_mode,
        "status": run.status,
        "pretest_size_min": run.pretest_size_min,
        "pretest_size_max": run.pretest_size_max,
        "pretest_saturation_min": run.pretest_saturation_min,
        "pretest_saturation_max": run.pretest_saturation_max,
        "pretest_warnings": run.pretest_warnings,
        "created_at": run.created_at,
    }


def _test_bounds_complete(test: Test) -> bool:
    return all(
        v is not None
        for v in [
            test.min_triangle_size,
            test.max_triangle_size,
            test.min_saturation,
            test.max_saturation,
        ]
    )


def _resolve_run_bounds(run: Run, test: Test, db: Session):
    settings = get_pretest_settings(db)

    size_min = (
        run.pretest_size_min
        if run.pretest_size_min is not None
        else (
            test.min_triangle_size
            if test.min_triangle_size is not None
            else settings.global_limits.min_triangle_size
        )
    )
    size_max = (
        run.pretest_size_max
        if run.pretest_size_max is not None
        else (
            test.max_triangle_size
            if test.max_triangle_size is not None
            else settings.global_limits.max_triangle_size
        )
    )
    sat_min = (
        run.pretest_saturation_min
        if run.pretest_saturation_min is not None
        else (
            test.min_saturation
            if test.min_saturation is not None
            else settings.global_limits.min_saturation
        )
    )
    sat_max = (
        run.pretest_saturation_max
        if run.pretest_saturation_max is not None
        else (
            test.max_saturation
            if test.max_saturation is not None
            else settings.global_limits.max_saturation
        )
    )

    return (size_min, size_max), (sat_min, sat_max)


def _persist_test_bounds(
    test: Test,
    size_min: float,
    size_max: float,
    sat_min: float,
    sat_max: float,
):
    test.min_triangle_size = size_min
    test.max_triangle_size = size_max
    test.min_saturation = sat_min
    test.max_saturation = sat_max


def _save_pretest_state(run: Run, state, db: Session):
    run.pretest_state_json = json.dumps(serialize_pretest_state(state))
    run.pretest_warnings = json.dumps(state.warnings)
    db.commit()


def _load_pretest_state(run: Run):
    if not run.pretest_state_json:
        return None
    data = json.loads(run.pretest_state_json)
    return deserialize_pretest_state(data)


def _combination_counts(db: Session, *, test_id: int = None, run_id: int = None):
    query = db.query(TestCombination)
    if test_id is not None:
        query = query.filter(TestCombination.test_id == test_id)
    if run_id is not None:
        query = query.filter(TestCombination.run_id == run_id)

    total = query.count()
    pretest = query.filter(TestCombination.phase == "pretest").count()
    main = query.filter(TestCombination.phase == "main").count()
    axis = query.filter(TestCombination.phase == "axis").count()
    correct = query.filter(TestCombination.success == 1).count()
    incorrect = query.filter(TestCombination.success == 0).count()
    success_rate = (correct / total) if total else None
    return {
        "total": total,
        "pretest": pretest,
        "main": main,
        "axis": axis,
        "correct": correct,
        "incorrect": incorrect,
        "success_rate": success_rate,
    }


def _rectangle_debug(db: Session, test_id: int):
    rect_query = db.query(Rectangle).filter(Rectangle.test_id == test_id)
    rect_count = rect_query.count()

    stats = (
        rect_query.with_entities(
            func.sum(Rectangle.true_samples),
            func.sum(Rectangle.false_samples),
            func.min(Rectangle.area),
            func.max(Rectangle.area),
            func.min(Rectangle.min_triangle_size),
            func.max(Rectangle.max_triangle_size),
            func.min(Rectangle.min_saturation),
            func.max(Rectangle.max_saturation),
        )
        .first()
    )

    if stats:
        (
            sum_true,
            sum_false,
            min_area,
            max_area,
            min_ts,
            max_ts,
            min_sat,
            max_sat,
        ) = stats
    else:
        sum_true = sum_false = min_area = max_area = None
        min_ts = max_ts = min_sat = max_sat = None

    rectangles = rect_query.order_by(Rectangle.area.desc()).all()
    items = []
    for rect in rectangles:
        weight = selection_probability(
            {
                "area": rect.area,
                "true_samples": rect.true_samples,
                "false_samples": rect.false_samples,
            }
        )
        items.append(
            {
                "id": rect.id,
                "bounds": {
                    "triangle_size": (rect.min_triangle_size, rect.max_triangle_size),
                    "saturation": (rect.min_saturation, rect.max_saturation),
                },
                "area": rect.area,
                "true_samples": rect.true_samples,
                "false_samples": rect.false_samples,
                "selection_weight": weight,
            }
        )

    return {
        "count": rect_count,
        "total_true": sum_true or 0,
        "total_false": sum_false or 0,
        "min_area": min_area,
        "max_area": max_area,
        "bounds": {
            "triangle_size": (min_ts, max_ts) if min_ts is not None else None,
            "saturation": (min_sat, max_sat) if min_sat is not None else None,
        },
        "items": items,
    }


@router.post("/", response_model=RunResponse)
def create_run(run_data: RunCreate, db: Session = Depends(get_db)):
    """Create a new run for a test."""
    test = db.query(Test).filter(Test.id == run_data.test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    name = (run_data.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Run name is required")

    duplicate = (
        db.query(Run)
        .filter(Run.test_id == run_data.test_id, Run.name == name)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=422, detail="Run name must be unique for this test")

    method = run_data.method
    run = Run(
        test_id=run_data.test_id,
        name=name,
        method=method,
        axis_switch_policy=run_data.axis_switch_policy if method in AXIS_METHODS else None,
        pretest_mode=run_data.pretest_mode,
    )

    if method in AXIS_METHODS:
        has_adaptive_fields = any(
            value is not None
            for value in [
                run_data.pretest_mode,
                run_data.pretest_size_min,
                run_data.pretest_size_max,
                run_data.pretest_saturation_min,
                run_data.pretest_saturation_max,
                run_data.reuse_test_id,
            ]
        )
        if has_adaptive_fields:
            raise HTTPException(
                status_code=422,
                detail="Axis methods do not accept pretest/manual/reuse fields",
            )
        run.axis_switch_policy = run.axis_switch_policy or "uncertainty"
        run.status = "axis"
        run.pretest_mode = None
        run.pretest_state_json = None
        run.pretest_warnings = json.dumps([])
    elif method == ADAPTIVE_METHOD:
        if run_data.pretest_mode not in ("run", "manual", "reuse_last"):
            raise HTTPException(
                status_code=422,
                detail="adaptive_rectangles requires pretest_mode (run, manual, or reuse_last)",
            )
        run.pretest_mode = run_data.pretest_mode
        run.axis_switch_policy = None
    else:
        raise HTTPException(status_code=422, detail=f"Unknown run method: {method}")

    if method == ADAPTIVE_METHOD and run_data.pretest_mode == "run":
        settings = get_pretest_settings(db)
        # If test bounds exist, use them; otherwise use configured global limits.
        if _test_bounds_complete(test):
            settings.global_limits.min_triangle_size = test.min_triangle_size
            settings.global_limits.max_triangle_size = test.max_triangle_size
            settings.global_limits.min_saturation = test.min_saturation
            settings.global_limits.max_saturation = test.max_saturation
        pretest_state = create_pretest_state(settings)
        run.status = "pretest"
        run.pretest_state_json = json.dumps(serialize_pretest_state(pretest_state))
        run.pretest_warnings = json.dumps([])

    elif method == ADAPTIVE_METHOD and run_data.pretest_mode == "manual":
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
        if run.pretest_size_min > run.pretest_size_max:
            raise HTTPException(
                status_code=422,
                detail="pretest_size_min must be <= pretest_size_max",
            )
        if run.pretest_saturation_min > run.pretest_saturation_max:
            raise HTTPException(
                status_code=422,
                detail="pretest_saturation_min must be <= pretest_saturation_max",
            )
        _persist_test_bounds(
            test,
            run.pretest_size_min,
            run.pretest_size_max,
            run.pretest_saturation_min,
            run.pretest_saturation_max,
        )
        run.status = "main"

    elif method == ADAPTIVE_METHOD and run_data.pretest_mode == "reuse_last":
        reuse_test_id: int = run_data.reuse_test_id or run_data.test_id
        reuse_test: Optional[Test] = (
            db.query(Test).filter(Test.id == reuse_test_id).first()
        )
        if not reuse_test:
            raise HTTPException(
                status_code=404,
                detail=f"Source test {reuse_test_id} not found",
            )

        last_run = (
            db.query(Run)
            .filter(
                Run.test_id == reuse_test_id,
                Run.status.in_(["main", "completed"]),
                Run.pretest_size_min.isnot(None),
                Run.pretest_size_max.isnot(None),
                Run.pretest_saturation_min.isnot(None),
                Run.pretest_saturation_max.isnot(None),
            )
            .order_by(Run.created_at.desc())
            .first()
        )

        if last_run:
            run.pretest_size_min = last_run.pretest_size_min
            run.pretest_size_max = last_run.pretest_size_max
            run.pretest_saturation_min = last_run.pretest_saturation_min
            run.pretest_saturation_max = last_run.pretest_saturation_max
        elif _test_bounds_complete(reuse_test):
            # Fallback: reuse the source test's persisted pretest bounds.
            run.pretest_size_min = reuse_test.min_triangle_size
            run.pretest_size_max = reuse_test.max_triangle_size
            run.pretest_saturation_min = reuse_test.min_saturation
            run.pretest_saturation_max = reuse_test.max_saturation
        else:
            raise HTTPException(
                status_code=404,
                detail="No reusable pretest bounds found for selected source test",
            )
        _persist_test_bounds(
            test,
            run.pretest_size_min,
            run.pretest_size_max,
            run.pretest_saturation_min,
            run.pretest_saturation_max,
        )
        run.status = "main"

    db.add(run)
    db.commit()
    db.refresh(run)
    return _run_response_payload(run)


@router.get("/{run_id}", response_model=RunResponse)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_response_payload(run)


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

    if _is_axis_method(run):
        if run.status == "completed":
            raise HTTPException(status_code=400, detail="Run is already completed")
        bounds = _axis_bounds(db)
        axis_trials = _axis_trials_for_run(db, run_id)
        next_trial = choose_next_trial(
            _run_method(run),
            run.axis_switch_policy or "uncertainty",
            [
                {
                    "triangle_size": c.triangle_size,
                    "saturation": c.saturation,
                    "success": c.success,
                }
                for c in axis_trials
            ],
            bounds,
        )
        return {
            "test_id": run.test_id,
            "run_id": run.id,
            "rectangle_id": None,
            "triangle_size": next_trial["triangle_size"],
            "saturation": next_trial["saturation"],
            "orientation": random.choice(ORIENTATIONS),
            "success": 0,
            "phase": "axis",
            "total_samples": total_samples,
        }

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
        if not test:
            raise HTTPException(status_code=404, detail="Test not found")
        size_bounds, sat_bounds = _resolve_run_bounds(run, test, db)

        rectangles = build_algorithm_rectangles(db, run.test_id)
        state = AlgorithmState(size_bounds, sat_bounds, rectangles if rectangles else None)
        combination, selected_rect = get_next_combination(state)
        if not combination:
            raise HTTPException(status_code=404, detail="No more combinations to test")

        sync_algorithm_state(state, run.test_id, db)

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
            "orientation": random.choice(ORIENTATIONS),
            "success": 0,
            "phase": "main",
            "total_samples": total_samples,
        }

    else:
        raise HTTPException(status_code=400, detail="Run is already completed")


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

    if _is_axis_method(run):
        db_combination = TestCombination(
            test_id=run.test_id,
            run_id=run.id,
            triangle_size=result.triangle_size,
            saturation=result.saturation,
            orientation=result.orientation,
            success=result.success,
            phase="axis",
            rectangle_id=None,
        )
        db.add(db_combination)
        db.commit()
        return {"message": "Axis result recorded", "phase": "axis"}

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
            # Persist latest pretest result on the test so future runs can reuse it.
            test = db.query(Test).filter(Test.id == run.test_id).first()
            if test:
                _persist_test_bounds(
                    test,
                    run.pretest_size_min,
                    run.pretest_size_max,
                    run.pretest_saturation_min,
                    run.pretest_saturation_max,
                )

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
        if not test:
            raise HTTPException(status_code=404, detail="Test not found")
        size_bounds, sat_bounds = _resolve_run_bounds(run, test, db)

        # Load algorithm state with sample history for split redistribution.
        rectangles = build_algorithm_rectangles(db, run.test_id)
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
            sync_algorithm_state(state, run.test_id, db)

        return {"message": "Main result recorded", "phase": "main"}

    else:
        raise HTTPException(status_code=400, detail="Run is already completed")


@router.get("/{run_id}/summary", response_model=RunSummary)
def get_run_summary(run_id: int, db: Session = Depends(get_db)):
    """Get a summary of a run including trial counts and pretest bounds."""
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    counts = _combination_counts(db, run_id=run_id)

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
        name=run.name,
        method=_run_method(run),
        axis_switch_policy=run.axis_switch_policy,
        status=run.status,
        pretest_mode=run.pretest_mode,
        pretest_bounds=pretest_bounds,
        pretest_warnings=warnings,
        pretest_trial_count=counts["pretest"],
        main_trials_count=counts["main"],
        axis_trials_count=counts["axis"],
        total_trials_count=counts["total"],
    )


def _adaptive_run_analysis_payload(run: Run, test: Test, db: Session) -> dict:
    combinations = (
        db.query(TestCombination)
        .filter(TestCombination.run_id == run.id)
        .order_by(TestCombination.created_at.asc())
        .all()
    )
    counts = _combination_counts(db, run_id=run.id)

    if not combinations:
        return {
            "analysis_type": "adaptive_surface",
            "trial_counts": counts,
            "plot": None,
        }

    size_bounds, sat_bounds = _resolve_run_bounds(run, test, db)
    fig, ax = plt.subplots(figsize=(10, 8))
    threshold = 0.75
    step = 10.0

    combo_payload = [
        {
            "triangle_size": c.triangle_size,
            "saturation": c.saturation,
            "success": c.success,
        }
        for c in combinations
    ]

    image = None
    plot_data = []
    try:
        X_s, Y_s, Z_s = create_single_smooth_plot(
            combo_payload,
            size_bounds,
            sat_bounds,
            smoothing_method="soft_brush",
            ax=ax,
            rectangles=None,
            threshold=threshold,
        )

        try:
            CS = ax.contour(X_s, Y_s, Z_s, levels=[threshold], colors="none")
            segments = CS.allsegs[0]
            tol = step / 2.0
            for x_val in np.arange(size_bounds[0], size_bounds[1] + step, step):
                sat_candidates = []
                for seg in segments:
                    matching = seg[abs(seg[:, 0] - x_val) <= tol]
                    if matching.size:
                        sat_candidates.extend(matching[:, 1].tolist())
                if sat_candidates:
                    plot_data.append(
                        {
                            "triangle_size": float(round(x_val, 2)),
                            "saturation": float(min(sat_candidates)),
                        }
                    )
        except Exception:
            plot_data = []

        buf = io.BytesIO()
        plt.savefig(buf, format="png", bbox_inches="tight", dpi=300)
        buf.seek(0)
        image = base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception:
        image = None
        plot_data = []
    finally:
        plt.close(fig)

    return {
        "analysis_type": "adaptive_surface",
        "trial_counts": counts,
        "plot": {
            "threshold": threshold,
            "step": step,
            "image": image,
            "plot_data": plot_data,
        },
    }


@router.get("/{run_id}/analysis")
def get_run_analysis(
    run_id: int,
    percent_step: int = Query(default=5, ge=1, le=50),
    db: Session = Depends(get_db),
):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    test = db.query(Test).filter(Test.id == run.test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    if _is_axis_method(run):
        bounds = _axis_bounds(db)
        axis_trials = _axis_trials_for_run(db, run_id)
        analysis = build_axis_analysis(
            _run_method(run),
            [
                {
                    "triangle_size": c.triangle_size,
                    "saturation": c.saturation,
                    "success": c.success,
                }
                for c in axis_trials
            ],
            bounds,
            percent_step=percent_step,
        )
        return {
            "run": {
                "id": run.id,
                "name": run.name,
                "method": _run_method(run),
                "axis_switch_policy": run.axis_switch_policy,
                "status": run.status,
            },
            "bounds": {
                "size_min": bounds.size_min,
                "size_max": bounds.size_max,
                "saturation_min": bounds.saturation_min,
                "saturation_max": bounds.saturation_max,
            },
            **analysis,
        }

    adaptive_payload = _adaptive_run_analysis_payload(run, test, db)
    size_bounds, sat_bounds = _resolve_run_bounds(run, test, db)
    return {
        "run": {
            "id": run.id,
            "name": run.name,
            "method": _run_method(run),
            "axis_switch_policy": run.axis_switch_policy,
            "status": run.status,
            "pretest_mode": run.pretest_mode,
        },
        "bounds": {
            "size_min": size_bounds[0],
            "size_max": size_bounds[1],
            "saturation_min": sat_bounds[0],
            "saturation_max": sat_bounds[1],
        },
        **adaptive_payload,
    }


@router.get("/{run_id}/debug")
def get_run_debug(run_id: int, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    test = db.query(Test).filter(Test.id == run.test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    settings = get_pretest_settings(db)
    global_limits = settings.global_limits

    run_bounds = None
    if run.pretest_size_min is not None:
        run_bounds = {
            "size_min": run.pretest_size_min,
            "size_max": run.pretest_size_max,
            "saturation_min": run.pretest_saturation_min,
            "saturation_max": run.pretest_saturation_max,
        }

    test_bounds = None
    if _test_bounds_complete(test):
        test_bounds = {
            "size_min": test.min_triangle_size,
            "size_max": test.max_triangle_size,
            "saturation_min": test.min_saturation,
            "saturation_max": test.max_saturation,
        }

    if _is_axis_method(run):
        active_bounds = {
            "size_min": global_limits.min_triangle_size,
            "size_max": global_limits.max_triangle_size,
            "saturation_min": global_limits.min_saturation,
            "saturation_max": global_limits.max_saturation,
        }
        active_source = "global"
    elif run.status == "pretest":
        active_bounds = {
            "size_min": global_limits.min_triangle_size,
            "size_max": global_limits.max_triangle_size,
            "saturation_min": global_limits.min_saturation,
            "saturation_max": global_limits.max_saturation,
        }
        active_source = "global"
    else:
        size_bounds, sat_bounds = _resolve_run_bounds(run, test, db)
        active_bounds = {
            "size_min": size_bounds[0],
            "size_max": size_bounds[1],
            "saturation_min": sat_bounds[0],
            "saturation_max": sat_bounds[1],
        }
        if run_bounds:
            active_source = "run"
        elif test_bounds:
            active_source = "test"
        else:
            active_source = "global"

    pretest_state = None
    if not _is_axis_method(run) and run.pretest_state_json:
        pretest_state_obj = _load_pretest_state(run)
        if pretest_state_obj is not None:
            pretest_state = serialize_pretest_state(pretest_state_obj)

    last_result = (
        db.query(TestCombination)
        .filter(TestCombination.run_id == run_id)
        .order_by(TestCombination.created_at.desc())
        .first()
    )

    warnings = []
    if run.pretest_warnings:
        try:
            warnings = json.loads(run.pretest_warnings)
        except (json.JSONDecodeError, TypeError):
            warnings = []

    return {
        "source": "run",
        "timestamp": datetime.utcnow().isoformat(),
        "phase": run.status,
        "run": {
            "id": run.id,
            "name": run.name,
            "method": _run_method(run),
            "axis_switch_policy": run.axis_switch_policy,
            "status": run.status,
            "pretest_mode": run.pretest_mode,
            "pretest_bounds": run_bounds,
            "pretest_warnings": warnings,
        },
        "test": {
            "id": test.id,
            "title": test.title,
            "description": test.description,
        },
        "counts": {
            "run": _combination_counts(db, run_id=run_id),
            "test": _combination_counts(db, test_id=test.id),
        },
        "bounds": {
            "active": active_bounds,
            "active_source": active_source,
            "run": run_bounds,
            "test": test_bounds,
            "global": {
                "size_min": global_limits.min_triangle_size,
                "size_max": global_limits.max_triangle_size,
                "saturation_min": global_limits.min_saturation,
                "saturation_max": global_limits.max_saturation,
            },
        },
        "settings": {
            "lower_target": settings.lower_target,
            "upper_target": settings.upper_target,
            "probe_rule": settings.probe_rule.model_dump(),
            "search": settings.search.model_dump(),
        },
        "rectangles": _rectangle_debug(db, test.id) if not _is_axis_method(run) else None,
        "pretest_state": pretest_state,
        "last_result": {
            "triangle_size": last_result.triangle_size,
            "saturation": last_result.saturation,
            "orientation": last_result.orientation,
            "success": last_result.success,
            "phase": last_result.phase,
            "created_at": last_result.created_at.isoformat(),
        }
        if last_result
        else None,
    }


@router.get("/test/{test_id}", response_model=List[RunResponse])
def get_runs_for_test(test_id: int, db: Session = Depends(get_db)):
    """List all runs for a test."""
    runs = (
        db.query(Run)
        .filter(Run.test_id == test_id)
        .order_by(Run.created_at.desc())
        .all()
    )
    return [_run_response_payload(run) for run in runs]


class SimulateRequest(BaseModel):
    model_name: str = "default"
    count: int = 1


@router.post("/{run_id}/simulate")
def simulate_trials(run_id: int, req: SimulateRequest, db: Session = Depends(get_db)):
    """Run *count* simulated trials using a ground-truth model.

    Each iteration mirrors the normal next→result flow:
    1. Fetch the next trial (pretest or main).
    2. Sample success/failure from the chosen ground-truth model.
    3. Submit the result exactly as a human press would.

    Returns a list of per-trial summaries so the frontend can replay them.
    """
    if req.count < 1 or req.count > 200:
        raise HTTPException(status_code=422, detail="count must be between 1 and 200")

    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    test = db.query(Test).filter(Test.id == run.test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    results = []
    for _ in range(req.count):
        # Re-load run each iteration so status transitions are visible.
        db.refresh(run)
        if run.status == "completed":
            break

        try:
            next_trial = get_next_trial(run_id, db)
        except HTTPException:
            break

        trial_data = {
            "triangle_size": next_trial["triangle_size"],
            "saturation": next_trial["saturation"],
            "orientation": next_trial["orientation"],
        }
        phase = next_trial.get("phase", run.status)

        # ---- sample ground truth -------------------------------------------
        entry = _resolve_model(req.model_name, db)
        if entry is None:
            raise HTTPException(status_code=422, detail=f"Unknown model: {req.model_name}")
        prob = compute_probability(entry, trial_data["triangle_size"], trial_data["saturation"])
        success = random.random() < prob
        success_int = 1 if success else 0

        # ---- submit result (reuse existing logic) --------------------------
        result_payload = RunTrialResult(
            triangle_size=trial_data["triangle_size"],
            saturation=trial_data["saturation"],
            orientation=trial_data["orientation"],
            success=success_int,
        )
        submit_run_result(run_id, result_payload, db)

        results.append({
            "triangle_size": trial_data["triangle_size"],
            "saturation": trial_data["saturation"],
            "orientation": trial_data["orientation"],
            "success": success_int,
            "probability": round(prob, 4),
            "phase": phase,
        })

    total_samples = (
        db.query(TestCombination)
        .filter(TestCombination.run_id == run_id)
        .count()
    )
    db.refresh(run)

    return {
        "trials": results,
        "total_simulated": len(results),
        "run_status": run.status,
        "total_samples": total_samples,
    }
