from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from db.database import get_db
from models.test import TestCreate, TestUpdate, TestResponse
import crud.test as crud

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


@router.put("/{test_id}", response_model=TestResponse)
def update_test(test_id: int, test: TestUpdate, db: Session = Depends(get_db)):
    db_test = crud.update_test(db=db, test_id=test_id, test=test)
    if db_test is None:
        raise HTTPException(status_code=404, detail="Test not found")
    return db_test


@router.delete("/{test_id}", response_model=TestResponse)
def delete_test(test_id: int, db: Session = Depends(get_db)):
    db_test = crud.delete_test(db=db, test_id=test_id)
    if db_test is None:
        raise HTTPException(status_code=404, detail="Test not found")
    return db_test
