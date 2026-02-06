from datetime import datetime
from pydantic import BaseModel, ConfigDict
from typing import Literal, Optional, List, Dict, Any

ORIENTATIONS = ["N", "E", "S", "W"]


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
