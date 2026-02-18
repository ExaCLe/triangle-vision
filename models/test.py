from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
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
    name = Column(String, nullable=True)
    method = Column(String, nullable=False, default="adaptive_rectangles")
    axis_switch_policy = Column(String, nullable=True)
    pretest_mode = Column(String, nullable=True)  # "run", "reuse_last", "manual"
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
