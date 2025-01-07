from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from db.database import Base


class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class TestBase(BaseModel):
    title: str
    description: str


class TestCreate(TestBase):
    pass


class TestUpdate(TestBase):
    pass


class TestResponse(TestBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}
