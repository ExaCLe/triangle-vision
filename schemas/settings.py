from typing import Literal
from pydantic import BaseModel, Field


class DebugSettings(BaseModel):
    enabled: bool = True


class PretestProbeRule(BaseModel):
    success_target: int = 10
    trial_cap: int = 30


class PretestSearch(BaseModel):
    max_probes_per_axis: int = 12
    refine_steps_per_edge: int = 2


class PretestGlobalLimits(BaseModel):
    min_triangle_size: float = 10.0
    max_triangle_size: float = 400.0
    min_saturation: float = 0.0
    max_saturation: float = 1.0


class DisplayMaskingSettings(BaseModel):
    duration_ms: int = 0


class DisplayEInkSettings(BaseModel):
    enabled: bool = False
    flash_color: Literal["white", "black"] = "white"
    flash_duration_ms: int = 100


class DisplayFlipSettings(BaseModel):
    horizontal: bool = False
    vertical: bool = False


class DisplaySettings(BaseModel):
    masking: DisplayMaskingSettings = Field(default_factory=DisplayMaskingSettings)
    eink: DisplayEInkSettings = Field(default_factory=DisplayEInkSettings)
    flip: DisplayFlipSettings = Field(default_factory=DisplayFlipSettings)


class SimulationSettings(BaseModel):
    enabled: bool = False


class PretestSettings(BaseModel):
    lower_target: float = 0.40
    upper_target: float = 0.95
    probe_rule: PretestProbeRule = Field(default_factory=PretestProbeRule)
    search: PretestSearch = Field(default_factory=PretestSearch)
    global_limits: PretestGlobalLimits = Field(default_factory=PretestGlobalLimits)
    debug: DebugSettings = Field(default_factory=DebugSettings)
    display: DisplaySettings = Field(default_factory=DisplaySettings)
    simulation: SimulationSettings = Field(default_factory=SimulationSettings)
