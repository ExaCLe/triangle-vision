from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from db.database import Base
from typing import Literal, Optional, List, Dict, Any


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
    runs = relationship("Run", back_populates="test")


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


class Run(Base):
    __tablename__ = "runs"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    pretest_mode = Column(String, nullable=False)  # "run", "reuse_last", "manual"
    status = Column(String, nullable=False, default="pretest")  # "pretest", "main", "completed"
    pretest_size_min = Column(Float, nullable=True)
    pretest_size_max = Column(Float, nullable=True)
    pretest_saturation_min = Column(Float, nullable=True)
    pretest_saturation_max = Column(Float, nullable=True)
    pretest_warnings = Column(Text, nullable=True)  # JSON array
    pretest_state_json = Column(Text, nullable=True)  # serialized PretestState
    created_at = Column(DateTime, default=datetime.utcnow)

    test = relationship("Test", back_populates="runs")
    combinations = relationship("TestCombination", back_populates="run")


class TestCombination(Base):
    __tablename__ = "test_combinations"

    id = Column(Integer, primary_key=True, index=True)
    rectangle_id = Column(Integer, ForeignKey("rectangles.id"), nullable=True)
    test_id = Column(Integer, ForeignKey("tests.id"))
    run_id = Column(Integer, ForeignKey("runs.id"), nullable=True)
    triangle_size = Column(Float)
    saturation = Column(Float)
    orientation = Column(String)
    success = Column(Integer)  # 1 for true, 0 for false
    phase = Column(String, default="main")  # "pretest" or "main"
    created_at = Column(DateTime, default=datetime.utcnow)

    rectangle = relationship("Rectangle", back_populates="combinations")
    test = relationship("Test", back_populates="combinations")
    run = relationship("Run", back_populates="combinations")


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
    rectangle_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class TestCombinationCreate(TestCombinationBase):
    pass


class TestCombinationResponse(TestCombinationBase):
    id: int
    created_at: datetime
    run_id: Optional[int] = None
    phase: Optional[str] = "main"

    model_config = ConfigDict(from_attributes=True)


class RunCreate(BaseModel):
    test_id: int
    pretest_mode: Literal["run", "reuse_last", "manual"]
    pretest_size_min: Optional[float] = None
    pretest_size_max: Optional[float] = None
    pretest_saturation_min: Optional[float] = None
    pretest_saturation_max: Optional[float] = None


class RunResponse(BaseModel):
    id: int
    test_id: int
    pretest_mode: str
    status: str
    pretest_size_min: Optional[float] = None
    pretest_size_max: Optional[float] = None
    pretest_saturation_min: Optional[float] = None
    pretest_saturation_max: Optional[float] = None
    pretest_warnings: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RunSummary(BaseModel):
    id: int
    test_id: int
    status: str
    pretest_mode: str
    pretest_bounds: Optional[Dict[str, Any]] = None
    pretest_warnings: Optional[List[str]] = None
    pretest_trial_count: int = 0
    main_trials_count: int = 0
    total_trials_count: int = 0

    model_config = ConfigDict(from_attributes=True)
