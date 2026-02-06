from fastapi import HTTPException
from sqlalchemy.orm import Session
from models.test import Rectangle
from algorithm_to_find_combinations.algorithm import AlgorithmState
from crud.test import get_test


def load_algorithm_state(db: Session, test_id: int) -> AlgorithmState:
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


def sync_algorithm_state(state: AlgorithmState, test_id: int, db: Session):
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
