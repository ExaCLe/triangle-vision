from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from db.database import get_db
from models.test import (
    TestResult,
    TestResultCreate,
    TestResultUpdate,
    TestResultResponse,
)

router = APIRouter(prefix="/test-results", tags=["test-results"])


@router.post("/", response_model=TestResultResponse)
def create_test_result(test_result: TestResultCreate, db: Session = Depends(get_db)):
    db_test_result = TestResult(**test_result.model_dump())
    db.add(db_test_result)
    db.commit()
    db.refresh(db_test_result)
    return db_test_result


@router.get("/", response_model=List[TestResultResponse])
def read_test_results(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(TestResult).offset(skip).limit(limit).all()


@router.get("/{test_result_id}", response_model=TestResultResponse)
def read_test_result(test_result_id: int, db: Session = Depends(get_db)):
    db_test_result = (
        db.query(TestResult).filter(TestResult.id == test_result_id).first()
    )
    if db_test_result is None:
        raise HTTPException(status_code=404, detail="Test result not found")
    return db_test_result


@router.put("/{test_result_id}", response_model=TestResultResponse)
def update_test_result(
    test_result_id: int, test_result: TestResultUpdate, db: Session = Depends(get_db)
):
    db_test_result = (
        db.query(TestResult).filter(TestResult.id == test_result_id).first()
    )
    if db_test_result is None:
        raise HTTPException(status_code=404, detail="Test result not found")

    for key, value in test_result.model_dump().items():
        setattr(db_test_result, key, value)

    db.commit()
    db.refresh(db_test_result)
    return db_test_result


@router.delete("/{test_result_id}")
def delete_test_result(test_result_id: int, db: Session = Depends(get_db)):
    db_test_result = (
        db.query(TestResult).filter(TestResult.id == test_result_id).first()
    )
    if db_test_result is None:
        raise HTTPException(status_code=404, detail="Test result not found")

    db.delete(db_test_result)
    db.commit()
    return {"message": "Test result deleted"}
