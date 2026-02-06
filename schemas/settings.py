from pydantic import BaseModel


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


class PretestSettings(BaseModel):
    lower_target: float = 0.40
    upper_target: float = 0.95
    probe_rule: PretestProbeRule = PretestProbeRule()
    search: PretestSearch = PretestSearch()
    global_limits: PretestGlobalLimits = PretestGlobalLimits()
