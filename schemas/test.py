from datetime import datetime
from pydantic import BaseModel, ConfigDict, model_validator
from typing import Literal, Optional, List, Dict, Any

ORIENTATIONS = ["N", "E", "S", "W"]
RunMethod = Literal["adaptive_rectangles", "axis_logistic", "axis_isotonic"]
AxisSwitchPolicy = Literal["uncertainty", "alternate"]


class TestBase(BaseModel):
    title: str
    description: str
    min_triangle_size: Optional[float] = None
    max_triangle_size: Optional[float] = None
    min_saturation: Optional[float] = None
    max_saturation: Optional[float] = None

    @model_validator(mode="after")
    def validate_bounds(self):
        bounds = [
            self.min_triangle_size,
            self.max_triangle_size,
            self.min_saturation,
            self.max_saturation,
        ]
        has_any_bound = any(v is not None for v in bounds)
        has_all_bounds = all(v is not None for v in bounds)

        if has_any_bound and not has_all_bounds:
            raise ValueError(
                "If bounds are provided, all four values are required "
                "(min/max triangle size and min/max saturation)."
            )

        if has_all_bounds:
            if self.min_triangle_size > self.max_triangle_size:
                raise ValueError("min_triangle_size must be <= max_triangle_size")
            if self.min_saturation > self.max_saturation:
                raise ValueError("min_saturation must be <= max_saturation")
        return self


class TestCreate(TestBase):
    pass


class TestUpdate(TestBase):
    title: Optional[str] = None
    description: Optional[str] = None


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
    name: str
    method: RunMethod
    pretest_mode: Optional[Literal["run", "reuse_last", "manual"]] = None
    axis_switch_policy: Optional[AxisSwitchPolicy] = None
    pretest_size_min: Optional[float] = None
    pretest_size_max: Optional[float] = None
    pretest_saturation_min: Optional[float] = None
    pretest_saturation_max: Optional[float] = None
    reuse_test_id: Optional[int] = None


class RunResponse(BaseModel):
    id: int
    test_id: int
    name: Optional[str] = None
    method: RunMethod
    axis_switch_policy: Optional[AxisSwitchPolicy] = None
    pretest_mode: Optional[str] = None
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
    name: Optional[str] = None
    method: RunMethod = "adaptive_rectangles"
    axis_switch_policy: Optional[AxisSwitchPolicy] = None
    status: str
    pretest_mode: Optional[str] = None
    pretest_bounds: Optional[Dict[str, Any]] = None
    pretest_warnings: Optional[List[str]] = None
    pretest_trial_count: int = 0
    main_trials_count: int = 0
    axis_trials_count: int = 0
    total_trials_count: int = 0

    model_config = ConfigDict(from_attributes=True)
