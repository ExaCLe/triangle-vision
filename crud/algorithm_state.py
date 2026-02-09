from fastapi import HTTPException
from sqlalchemy.orm import Session
from models.test import Rectangle, TestCombination
from algorithm_to_find_combinations.algorithm import AlgorithmState
from crud.test import get_test
from crud.settings import get_pretest_settings


def _load_samples_by_rectangle(
    db: Session, test_id: int, rectangle_ids: list[int]
) -> dict[int, list[dict]]:
    if not rectangle_ids:
        return {}

    rows = (
        db.query(
            TestCombination.rectangle_id,
            TestCombination.triangle_size,
            TestCombination.saturation,
            TestCombination.success,
        )
        .filter(
            TestCombination.test_id == test_id,
            TestCombination.phase == "main",
            TestCombination.rectangle_id.in_(rectangle_ids),
        )
        .order_by(TestCombination.created_at.asc(), TestCombination.id.asc())
        .all()
    )

    grouped: dict[int, list[dict]] = {}
    for row in rows:
        rid = row.rectangle_id
        if rid is None:
            continue
        grouped.setdefault(rid, []).append(
            {
                "triangle_size": row.triangle_size,
                "saturation": row.saturation,
                "success": bool(row.success),
            }
        )
    return grouped


def build_algorithm_rectangles(db: Session, test_id: int) -> list[dict]:
    """Load current rectangles + their main-phase sample history for a test."""
    db_rectangles = db.query(Rectangle).filter(Rectangle.test_id == test_id).all()
    sample_map = _load_samples_by_rectangle(
        db, test_id, [r.id for r in db_rectangles if r.id is not None]
    )

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
                "samples": sample_map.get(rect.id, []),
            }
        )
    return rectangles


def load_algorithm_state(db: Session, test_id: int) -> AlgorithmState:
    test = get_test(db, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    if all(
        v is not None
        for v in [
            test.min_triangle_size,
            test.max_triangle_size,
            test.min_saturation,
            test.max_saturation,
        ]
    ):
        triangle_size_bounds = (test.min_triangle_size, test.max_triangle_size)
        saturation_bounds = (test.min_saturation, test.max_saturation)
    else:
        settings = get_pretest_settings(db)
        triangle_size_bounds = (
            settings.global_limits.min_triangle_size,
            settings.global_limits.max_triangle_size,
        )
        saturation_bounds = (
            settings.global_limits.min_saturation,
            settings.global_limits.max_saturation,
        )

    rectangles = build_algorithm_rectangles(db, test_id)

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
