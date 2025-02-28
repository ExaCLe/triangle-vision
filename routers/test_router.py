import matplotlib

matplotlib.use("Agg")  # Set the backend to non-interactive Agg
import matplotlib.pyplot as plt
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from db.database import get_db
from models.test import TestCreate, TestUpdate, TestResponse, Test, Rectangle
import crud.test as crud
import io
from algorithm_to_find_combinations.plotting import (
    create_single_smooth_plot,
    compute_soft_brush_smooth,
)
from fastapi.responses import StreamingResponse
from algorithm_to_find_combinations.algorithm import AlgorithmState, update_state
import base64

router = APIRouter(prefix="/tests", tags=["tests"])


@router.post("/", response_model=TestResponse)
def create_test(test: TestCreate, db: Session = Depends(get_db)):
    return crud.create_test(db=db, test=test)


@router.get("/", response_model=List[TestResponse])
def read_tests(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_tests(db=db, skip=skip, limit=limit)


@router.get("/{test_id}", response_model=TestResponse)
def read_test(test_id: int, db: Session = Depends(get_db)):
    db_test = crud.get_test(db=db, test_id=test_id)
    if db_test is None:
        raise HTTPException(status_code=404, detail="Test not found")
    return db_test


def recalculate_rectangles(db: Session, test: Test):
    """Recalculate rectangles based on test combinations"""
    # Delete existing rectangles
    db.query(Rectangle).filter(Rectangle.test_id == test.id).delete()

    # Initialize new state with base rectangle
    state = AlgorithmState(
        (test.min_triangle_size, test.max_triangle_size),
        (test.min_saturation, test.max_saturation),
    )

    # Get all test combinations for this test
    combinations = test.combinations

    # Sort combinations by creation date to maintain history
    sorted_combinations = sorted(combinations, key=lambda x: x.created_at)

    # Replay all combinations to rebuild rectangles
    for combo in sorted_combinations:
        selected_rect = next(
            (
                r
                for r in state.rectangles
                if r["bounds"]["triangle_size"][0]
                <= combo.triangle_size
                <= r["bounds"]["triangle_size"][1]
                and r["bounds"]["saturation"][0]
                <= combo.saturation
                <= r["bounds"]["saturation"][1]
            ),
            None,
        )

        if selected_rect:
            state = update_state(
                state,
                selected_rect,
                {"triangle_size": combo.triangle_size, "saturation": combo.saturation},
                bool(combo.success),
            )

    # Save new rectangles to database
    for rect in state.rectangles:
        db_rect = Rectangle(
            test_id=test.id,
            min_triangle_size=rect["bounds"]["triangle_size"][0],
            max_triangle_size=rect["bounds"]["triangle_size"][1],
            min_saturation=rect["bounds"]["saturation"][0],
            max_saturation=rect["bounds"]["saturation"][1],
            area=rect["area"],
            true_samples=rect["true_samples"],
            false_samples=rect["false_samples"],
        )
        db.add(db_rect)

    db.commit()


@router.put("/{test_id}", response_model=TestResponse)
def update_test(test_id: int, test_update: TestUpdate, db: Session = Depends(get_db)):
    db_test = db.query(Test).filter(Test.id == test_id).first()
    if db_test is None:
        raise HTTPException(status_code=404, detail="Test not found")

    # Check if bounds have changed
    bounds_changed = (
        db_test.min_triangle_size != test_update.min_triangle_size
        or db_test.max_triangle_size != test_update.max_triangle_size
        or db_test.min_saturation != test_update.min_saturation
        or db_test.max_saturation != test_update.max_saturation
    )

    # Update test attributes
    for var, value in vars(test_update).items():
        setattr(db_test, var, value)

    # If bounds changed, recalculate rectangles
    if bounds_changed:
        recalculate_rectangles(db, db_test)

    db.commit()
    db.refresh(db_test)
    return db_test


@router.delete("/{test_id}", response_model=TestResponse)
def delete_test(test_id: int, db: Session = Depends(get_db)):
    db_test = crud.delete_test(db=db, test_id=test_id)
    if db_test is None:
        raise HTTPException(status_code=404, detail="Test not found")
    return db_test


@router.get("/{test_id}/plot")
def get_test_plot(
    test_id: int,
    show_rectangles: bool = False,
    step: float = None,  # new query parameter for step size
    threshold: float = 0.75,  # new query parameter for threshold line value
    db: Session = Depends(get_db),
):
    db_test = crud.get_test(db=db, test_id=test_id)
    if db_test is None:
        raise HTTPException(status_code=404, detail="Test not found")

    try:
        fig, ax = plt.subplots(figsize=(10, 8))

        combinations = [
            {
                "triangle_size": c.triangle_size,
                "saturation": c.saturation,
                "success": c.success,
            }
            for c in db_test.combinations
        ]
        triangle_size_bounds = (db_test.min_triangle_size, db_test.max_triangle_size)
        saturation_bounds = (db_test.min_saturation, db_test.max_saturation)

        rectangles = None
        if show_rectangles:
            rectangles = [
                {
                    "bounds": {
                        "triangle_size": (r.min_triangle_size, r.max_triangle_size),
                        "saturation": (r.min_saturation, r.max_saturation),
                    }
                }
                for r in db_test.rectangles
            ]

        # Call the plotting function and capture smooth arrays
        X_s, Y_s, Z_s = create_single_smooth_plot(
            combinations,
            triangle_size_bounds,
            saturation_bounds,
            smoothing_method="soft_brush",
            ax=ax,
            rectangles=rectangles,
            threshold=threshold,
        )
        # Save image (without extra contour line overlaid)
        buf = io.BytesIO()
        plt.savefig(buf, format="png", bbox_inches="tight", dpi=300)
        buf.seek(0)
        plt.close(fig)
        img_base64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        plot_data = []
        if step:
            import numpy as np

            # Extract contour segments at exactly 0.75 without drawing them
            CS = ax.contour(X_s, Y_s, Z_s, levels=[threshold], colors="none")
            segments = CS.allsegs[0]  # segments for level 0.75
            tol = step / 2
            for x_val in np.arange(
                triangle_size_bounds[0], triangle_size_bounds[1] + step, step
            ):
                candidate_sats = []
                for seg in segments:
                    # seg is an array of shape (N,2) with col0=X, col1=Y.
                    matching = seg[abs(seg[:, 0] - x_val) <= tol]
                    if matching.size:
                        candidate_sats.extend(matching[:, 1].tolist())
                if candidate_sats:
                    min_sat = float(min(candidate_sats))
                    plot_data.append(
                        {"triangle_size": float(x_val), "saturation": min_sat}
                    )
        return {"image": img_base64, "plot_data": plot_data}
    except Exception as e:
        plt.close("all")
        raise HTTPException(status_code=500, detail=str(e))
