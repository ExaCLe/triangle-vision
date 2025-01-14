from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from db.database import get_db
from models.test import TestCombination, TestCombinationCreate, TestCombinationResponse

router = APIRouter(prefix="/test-combinations", tags=["test-combinations"])


@router.post("/", response_model=TestCombinationResponse)
def create_test_combination(
    combination: TestCombinationCreate, db: Session = Depends(get_db)
):
    db_combination = TestCombination(**combination.model_dump())
    db.add(db_combination)
    db.commit()
    db.refresh(db_combination)
    return db_combination


@router.get("/", response_model=List[TestCombinationResponse])
def read_test_combinations(
    skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
):
    return db.query(TestCombination).offset(skip).limit(limit).all()


@router.get("/{combination_id}", response_model=TestCombinationResponse)
def read_test_combination(combination_id: int, db: Session = Depends(get_db)):
    db_combination = (
        db.query(TestCombination).filter(TestCombination.id == combination_id).first()
    )
    if db_combination is None:
        raise HTTPException(status_code=404, detail="Test combination not found")
    return db_combination


@router.get("/test/{test_id}", response_model=List[TestCombinationResponse])
def read_test_combinations_by_test(test_id: int, db: Session = Depends(get_db)):
    return db.query(TestCombination).filter(TestCombination.test_id == test_id).all()
