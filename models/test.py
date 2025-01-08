from sqlalchemy import Column, Integer, String, DateTime, Float
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
