from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Literal
from pydantic import BaseModel
from db.database import get_db
import random
from models.test import (
    TestCombination,
    TestCombinationBase,
    TestCombinationCreate,
    TestCombinationResponse,
    Test,
    Rectangle,
)
from algorithm_to_find_combinations.algorithm import (
    AlgorithmState,
    get_next_combination,
    update_state,
)
from crud.test import get_test
from fastapi.responses import StreamingResponse
import csv
from io import StringIO

router = APIRouter(prefix="/test-combinations", tags=["test-combinations"])

orientations = ["N", "E", "S", "W"]


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


def _load_algorithm_state(db: Session, test_id: int) -> AlgorithmState:
    test = get_test(db, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    triangle_size_bounds = (test.min_triangle_size, test.max_triangle_size)
    saturation_bounds = (test.min_saturation, test.max_saturation)

    # Load existing rectangles from database
    db_rectangles = db.query(Rectangle).filter(Rectangle.test_id == test_id).all()

    # Convert database rectangles to algorithm format
    rectangles = []
    for rect in db_rectangles:
        rectangles.append(
            {
                "bounds": {
                    "triangle_size": (rect.min_triangle_size, rect.max_triangle_size),
                    "saturation": (rect.min_saturation, rect.max_saturation),
                },
                "area": rect.area,
                "true_samples": rect.true_samples,
                "false_samples": rect.false_samples,
            }
        )

    return AlgorithmState(triangle_size_bounds, saturation_bounds, rectangles)


def _sync_algorithm_state(state: AlgorithmState, test_id: int, db: Session):
    """Sync algorithm state changes with database"""
    # Remove split rectangles
    for removed_rect in state.removed_rectangles:
        db_rect = (
            db.query(Rectangle)
            .filter(
                Rectangle.test_id == test_id,
                Rectangle.min_triangle_size
                == removed_rect["bounds"]["triangle_size"][0],
                Rectangle.max_triangle_size
                == removed_rect["bounds"]["triangle_size"][1],
                Rectangle.min_saturation == removed_rect["bounds"]["saturation"][0],
                Rectangle.max_saturation == removed_rect["bounds"]["saturation"][1],
            )
            .first()
        )
        if db_rect:
            db.delete(db_rect)

    # Add new rectangles
    for new_rect in state.new_rectangles:
        db_rect = Rectangle(
            test_id=test_id,
            min_triangle_size=new_rect["bounds"]["triangle_size"][0],
            max_triangle_size=new_rect["bounds"]["triangle_size"][1],
            min_saturation=new_rect["bounds"]["saturation"][0],
            max_saturation=new_rect["bounds"]["saturation"][1],
            area=new_rect["area"],
            true_samples=new_rect["true_samples"],
            false_samples=new_rect["false_samples"],
        )
        db.add(db_rect)

    # Clear change tracking
    state.new_rectangles = []
    state.removed_rectangles = []

    db.commit()


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

    # Get total samples count
    total_samples = (
        db.query(TestCombination).filter(TestCombination.test_id == test_id).count()
    )

    state = _load_algorithm_state(db, test_id)
    combination, selected_rect = get_next_combination(state)
    if not combination:
        raise HTTPException(status_code=404, detail="No more combinations to test")

    # Sync any state changes with database
    _sync_algorithm_state(state, test_id, db)

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
        "orientation": random.choice(orientations),
        "success": 0,  # Initial success value
        "total_samples": total_samples,  # Add total samples to response
    }


@router.post("/result")
def submit_test_result(result: TestCombinationResult, db: Session = Depends(get_db)):
    """Submit the result of a test combination and update rectangle cache"""
    if result.orientation not in orientations:
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
    state = _load_algorithm_state(db, result.test_id)
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
            state, selected_rect, result.model_dump(), bool(result.success)
        )
        _sync_algorithm_state(state, result.test_id, db)

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
        ["ID", "Triangle Size", "Saturation", "Orientation", "Success", "Created At"]
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
