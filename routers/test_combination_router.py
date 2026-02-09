import csv
import random
from io import StringIO
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Literal
from pydantic import BaseModel
from db.database import get_db
from models.test import TestCombination, Test, Rectangle
from schemas.test import TestCombinationResponse, ORIENTATIONS
from algorithm_to_find_combinations.algorithm import get_next_combination, update_state
from crud.algorithm_state import load_algorithm_state, sync_algorithm_state

router = APIRouter(prefix="/test-combinations", tags=["test-combinations"])


def _validate_orientation(orientation: str) -> str:
    """Validate and normalize orientation value"""
    valid_orientations = {"N", "E", "S", "W"}
    normalized = orientation.upper() if orientation else "N"
    return normalized if normalized in valid_orientations else "N"


@router.get("/", response_model=List[TestCombinationResponse])
def read_test_combinations(
    skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
):
    combinations = db.query(TestCombination).offset(skip).limit(limit).all()
    return [
        TestCombinationResponse(
            id=c.id,
            test_id=c.test_id,
            rectangle_id=c.rectangle_id,
            triangle_size=c.triangle_size,
            saturation=c.saturation,
            orientation=_validate_orientation(c.orientation),
            success=c.success,
            created_at=c.created_at,
        )
        for c in combinations
    ]


@router.get("/{combination_id}", response_model=TestCombinationResponse)
def read_test_combination(combination_id: int, db: Session = Depends(get_db)):
    db_combination = (
        db.query(TestCombination).filter(TestCombination.id == combination_id).first()
    )
    if db_combination is None:
        raise HTTPException(status_code=404, detail="Test combination not found")
    return TestCombinationResponse(
        id=db_combination.id,
        test_id=db_combination.test_id,
        rectangle_id=db_combination.rectangle_id,
        triangle_size=db_combination.triangle_size,
        saturation=db_combination.saturation,
        orientation=_validate_orientation(db_combination.orientation),
        success=db_combination.success,
        created_at=db_combination.created_at,
    )


@router.get("/test/{test_id}", response_model=List[TestCombinationResponse])
def read_test_combinations_by_test(test_id: int, db: Session = Depends(get_db)):
    combinations = (
        db.query(TestCombination).filter(TestCombination.test_id == test_id).all()
    )
    return [
        TestCombinationResponse(
            id=c.id,
            test_id=c.test_id,
            rectangle_id=c.rectangle_id,
            triangle_size=c.triangle_size,
            saturation=c.saturation,
            orientation=_validate_orientation(c.orientation),
            success=c.success,
            created_at=c.created_at,
        )
        for c in combinations
    ]


class TestCombinationResult(BaseModel):
    test_id: int
    rectangle_id: int
    triangle_size: float
    saturation: float
    orientation: Literal["N", "E", "S", "W"]
    success: int


@router.get("/next/{test_id}")
def get_next_test_combination(test_id: int, db: Session = Depends(get_db)):
    """Get next combination to test for a given test ID"""
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    # Get total samples count and add 1 to include the combination we're about to test
    total_samples = (
        db.query(TestCombination).filter(TestCombination.test_id == test_id).count()
    )

    state = load_algorithm_state(db, test_id)
    combination, selected_rect = get_next_combination(state)
    if not combination:
        raise HTTPException(status_code=404, detail="No more combinations to test")

    # Sync any state changes with database
    sync_algorithm_state(state, test_id, db)

    # Find the corresponding rectangle in database
    db_rectangle = (
        db.query(Rectangle)
        .filter(
            Rectangle.test_id == test_id,
            Rectangle.min_triangle_size == selected_rect["bounds"]["triangle_size"][0],
            Rectangle.max_triangle_size == selected_rect["bounds"]["triangle_size"][1],
            Rectangle.min_saturation == selected_rect["bounds"]["saturation"][0],
            Rectangle.max_saturation == selected_rect["bounds"]["saturation"][1],
        )
        .first()
    )

    # Return combination with total_samples included
    return {
        "test_id": test_id,
        "rectangle_id": db_rectangle.id,
        "triangle_size": combination["triangle_size"],
        "saturation": combination["saturation"],
        "orientation": random.choice(ORIENTATIONS),
        "success": 0,  # Initial success value
        "total_samples": total_samples,  # This now includes the current combination
    }


@router.post("/result")
def submit_test_result(result: TestCombinationResult, db: Session = Depends(get_db)):
    """Submit the result of a test combination and update rectangle cache"""
    if result.orientation not in ORIENTATIONS:
        raise HTTPException(status_code=422, detail="Invalid orientation")

    # Verify rectangle exists
    rectangle = db.query(Rectangle).filter(Rectangle.id == result.rectangle_id).first()
    if not rectangle:
        raise HTTPException(status_code=404, detail="Rectangle not found")

    # Update rectangle cache
    if result.success:
        rectangle.true_samples += 1
    else:
        rectangle.false_samples += 1

    # Create test combination record
    db_combination = TestCombination(**result.model_dump())
    db.add(db_combination)
    db.commit()
    db.refresh(rectangle)

    # Load state and update algorithm
    state = load_algorithm_state(db, result.test_id)
    selected_rect = next(
        (
            r
            for r in state.rectangles
            if (
                r["bounds"]["triangle_size"][0] == rectangle.min_triangle_size
                and r["bounds"]["triangle_size"][1] == rectangle.max_triangle_size
                and r["bounds"]["saturation"][0] == rectangle.min_saturation
                and r["bounds"]["saturation"][1] == rectangle.max_saturation
            )
        ),
        None,
    )

    if selected_rect:
        state = update_state(
            state,
            selected_rect,
            result.model_dump(),
            bool(result.success),
            record_sample=False,
        )
        sync_algorithm_state(state, result.test_id, db)

    return {"message": "Test result recorded successfully"}


@router.get("/{test_id}/export-csv")
def export_test_combinations_csv(test_id: int, db: Session = Depends(get_db)):
    """Export test combinations for a test as CSV"""
    combinations = (
        db.query(TestCombination)
        .filter(TestCombination.test_id == test_id)
        .order_by(TestCombination.created_at)
        .all()
    )

    output = StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow(
        ["ID", "Triangle Size", "Saturation", "Orientation", "Success", "Phase", "Created At"]
    )

    # Write data
    for combo in combinations:
        writer.writerow(
            [
                combo.id,
                combo.triangle_size,
                combo.saturation,
                combo.orientation,
                "Yes" if combo.success else "No",
                getattr(combo, "phase", "main") or "main",
                combo.created_at,
            ]
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="test-{test_id}-results.csv"'
        },
    )
