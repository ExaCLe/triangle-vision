from sqlalchemy.orm import Session
from models.test import Test, TestCreate, TestUpdate


def create_test(db: Session, test: TestCreate):
    db_test = Test(**test.model_dump())
    db.add(db_test)
    db.commit()
    db.refresh(db_test)
    return db_test


def get_test(db: Session, test_id: int):
    return db.query(Test).filter(Test.id == test_id).first()


def get_tests(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Test).offset(skip).limit(limit).all()


def update_test(db: Session, test_id: int, test: TestUpdate):
    db_test = db.query(Test).filter(Test.id == test_id).first()
    if db_test:
        for key, value in test.model_dump().items():
            setattr(db_test, key, value)
        db.commit()
        db.refresh(db_test)
    return db_test


def delete_test(db: Session, test_id: int):
    db_test = db.query(Test).filter(Test.id == test_id).first()
    if db_test:
        db.delete(db_test)
        db.commit()
    return db_test
