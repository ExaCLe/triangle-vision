from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from db.database import Base


class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    min_triangle_size = Column(Float)
    max_triangle_size = Column(Float)
    min_saturation = Column(Float)
    max_saturation = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    results = relationship("TestResult", back_populates="test")


class TestResult(Base):
    __tablename__ = "test_results"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"))
    accuracy = Column(Float)
    processing_time = Column(Float)
    num_triangles = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

    test = relationship("Test", back_populates="results")


class TestBase(BaseModel):
    title: str
    description: str
    min_triangle_size: float
    max_triangle_size: float
    min_saturation: float
    max_saturation: float


class TestCreate(TestBase):
    pass


class TestUpdate(TestBase):
    pass


class TestResponse(TestBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TestResultBase(BaseModel):
    accuracy: float
    processing_time: float
    num_triangles: int


class TestResultCreate(TestResultBase):
    test_id: int


class TestResultUpdate(TestResultBase):
    pass


class TestResultResponse(TestResultBase):
    id: int
    test_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
