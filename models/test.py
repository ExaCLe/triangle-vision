from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from db.database import Base
from typing import Literal


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
    rectangles = relationship("Rectangle", back_populates="test")
    combinations = relationship("TestCombination", back_populates="test")


class Rectangle(Base):
    __tablename__ = "rectangles"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"))
    min_triangle_size = Column(Float)
    max_triangle_size = Column(Float)
    min_saturation = Column(Float)
    max_saturation = Column(Float)
    area = Column(Float)
    true_samples = Column(Integer, default=0)
    false_samples = Column(Integer, default=0)

    test = relationship("Test", back_populates="rectangles")
    combinations = relationship("TestCombination", back_populates="rectangle")


class TestCombination(Base):
    __tablename__ = "test_combinations"

    id = Column(Integer, primary_key=True, index=True)
    rectangle_id = Column(Integer, ForeignKey("rectangles.id"))
    test_id = Column(Integer, ForeignKey("tests.id"))
    triangle_size = Column(Float)
    saturation = Column(Float)
    orientation = Column(String)
    success = Column(Integer)  # 1 for true, 0 for false
    created_at = Column(DateTime, default=datetime.utcnow)

    rectangle = relationship("Rectangle", back_populates="combinations")
    test = relationship("Test", back_populates="combinations")


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


class RectangleBase(BaseModel):
    min_triangle_size: float
    max_triangle_size: float
    min_saturation: float
    max_saturation: float
    area: float
    true_samples: int
    false_samples: int


class RectangleCreate(RectangleBase):
    test_id: int


class RectangleResponse(RectangleBase):
    id: int
    test_id: int

    model_config = ConfigDict(from_attributes=True)


class TestCombinationBase(BaseModel):
    triangle_size: float
    saturation: float
    orientation: Literal["N", "E", "S", "W"]
    success: int
    test_id: int
    rectangle_id: int

    model_config = ConfigDict(from_attributes=True)  # Add this to base class


class TestCombinationCreate(TestCombinationBase):
    pass


class TestCombinationResponse(TestCombinationBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
