"""
Pretest cutting search algorithm.

Pure state machine that finds the rectangle in (triangle_size, saturation) space
where performance transitions from ~40% to ~95% correct.

Search order:
  1. Size axis (probed at max saturation, where contrast is strongest)
     - Larger size = easier (higher p_hat)
     - Smaller size = harder (lower p_hat)
  2. Saturation axis (probed at size_95, the size where performance reaches 95%)
     - Higher saturation = easier
     - Lower saturation = harder
"""

import random
from dataclasses import dataclass, field, asdict
from typing import Optional, List


@dataclass
class ProbeResult:
    value: float
    correct_count: int
    trial_count: int

    @property
    def p_hat(self) -> float:
        if self.trial_count == 0:
            return 0.0
        return self.correct_count / self.trial_count


@dataclass
class PretestState:
    # Targets
    lower_target: float = 0.40
    upper_target: float = 0.95

    # Probe rule
    success_target: int = 10
    trial_cap: int = 30

    # Search config
    max_probes_per_axis: int = 12
    refine_steps_per_edge: int = 2

    # Global limits (the full parameter space)
    global_size_min: float = 10.0
    global_size_max: float = 400.0
    global_sat_min: float = 0.0
    global_sat_max: float = 1.0

    # Current axis: "size" then "saturation"
    current_axis: str = "size"

    # Search phase: "find_anchor" -> "refine_lower" -> "refine_upper" -> axis switch or "done"
    search_phase: str = "find_anchor"

    # Current probe state
    current_probe_value: float = 0.0
    current_probe_correct: int = 0
    current_probe_trials: int = 0

    # Probe count for current axis
    probes_used: int = 0

    # Binary search bracket state
    bracket_lo: float = 0.0
    bracket_hi: float = 0.0
    refine_step: int = 0

    # Anchor value found during find_anchor phase
    anchor_value: Optional[float] = None
    anchor_p_hat: Optional[float] = None

    # Search bounds for find_anchor bisection
    search_lo: float = 0.0
    search_hi: float = 0.0

    # Results
    size_lower: Optional[float] = None
    size_upper: Optional[float] = None
    size_95: Optional[float] = None  # size at which p_hat ~ 95%
    saturation_lower: Optional[float] = None
    saturation_upper: Optional[float] = None

    # State
    warnings: List[str] = field(default_factory=list)
    is_complete: bool = False

    # Completed probes history
    completed_probes: List[dict] = field(default_factory=list)


def create_pretest_state(settings) -> PretestState:
    """Create initial pretest state from PretestSettings."""
    state = PretestState(
        lower_target=settings.lower_target,
        upper_target=settings.upper_target,
        success_target=settings.probe_rule.success_target,
        trial_cap=settings.probe_rule.trial_cap,
        max_probes_per_axis=settings.search.max_probes_per_axis,
        refine_steps_per_edge=settings.search.refine_steps_per_edge,
        global_size_min=settings.global_limits.min_triangle_size,
        global_size_max=settings.global_limits.max_triangle_size,
        global_sat_min=settings.global_limits.min_saturation,
        global_sat_max=settings.global_limits.max_saturation,
    )
    # Size axis: search from global_size_min to global_size_max
    state.search_lo = state.global_size_min
    state.search_hi = state.global_size_max
    # First probe at midpoint
    state.current_probe_value = (state.search_lo + state.search_hi) / 2.0
    state.current_axis = "size"
    state.search_phase = "find_anchor"
    return state


def get_pretest_trial(state: PretestState) -> dict:
    """Return the next trial dict: {triangle_size, saturation, orientation}."""
    orientation = random.choice(["N", "E", "S", "W"])

    if state.current_axis == "size":
        # Probe varying sizes at max saturation (strongest contrast)
        return {
            "triangle_size": state.current_probe_value,
            "saturation": state.global_sat_max,
            "orientation": orientation,
        }
    else:
        # Probe varying saturations at size_95
        return {
            "triangle_size": state.size_95 if state.size_95 is not None else (state.global_size_min + state.global_size_max) / 2.0,
            "saturation": state.current_probe_value,
            "orientation": orientation,
        }


def process_pretest_result(state: PretestState, success: bool) -> PretestState:
    """Process a trial result and advance the state machine if probe is complete."""
    if success:
        state.current_probe_correct += 1
    state.current_probe_trials += 1

    # Check if probe is complete
    probe_done = (
        state.current_probe_correct >= state.success_target
        or state.current_probe_trials >= state.trial_cap
    )

    if probe_done:
        p_hat = state.current_probe_correct / state.current_probe_trials if state.current_probe_trials > 0 else 0.0
        state.completed_probes.append({
            "axis": state.current_axis,
            "phase": state.search_phase,
            "value": state.current_probe_value,
            "correct": state.current_probe_correct,
            "trials": state.current_probe_trials,
            "p_hat": p_hat,
        })
        state.probes_used += 1
        _advance_search(state, p_hat)
        # Reset probe counters for next probe
        state.current_probe_correct = 0
        state.current_probe_trials = 0

    return state


def _advance_search(state: PretestState, p_hat: float):
    """Advance the search state machine after a probe completes."""
    if state.search_phase == "find_anchor":
        _handle_find_anchor(state, p_hat)
    elif state.search_phase == "refine_lower":
        _handle_refine_lower(state, p_hat)
    elif state.search_phase == "refine_upper":
        _handle_refine_upper(state, p_hat)


def _handle_find_anchor(state: PretestState, p_hat: float):
    """Handle the find_anchor phase: looking for a probe in [lower_target, upper_target]."""
    if state.lower_target <= p_hat <= state.upper_target:
        # Anchor found in band
        state.anchor_value = state.current_probe_value
        state.anchor_p_hat = p_hat
        _setup_refinement(state)
    elif p_hat > state.upper_target:
        # Too easy -> move toward harder (smaller size / lower saturation)
        state.search_hi = state.current_probe_value
        if state.probes_used >= state.max_probes_per_axis:
            _clamp_and_warn(state, "anchor_not_found")
            return
        state.current_probe_value = (state.search_lo + state.search_hi) / 2.0
    elif p_hat < state.lower_target:
        # Too hard -> move toward easier (larger size / higher saturation)
        state.search_lo = state.current_probe_value
        if state.probes_used >= state.max_probes_per_axis:
            _clamp_and_warn(state, "anchor_not_found")
            return
        state.current_probe_value = (state.search_lo + state.search_hi) / 2.0


def _setup_refinement(state: PretestState):
    """Set up binary search refinement brackets after anchor is found."""
    if state.current_axis == "size":
        hard_end = state.global_size_min  # smaller = harder for size
        easy_end = state.global_size_max  # larger = easier
    else:
        hard_end = state.global_sat_min  # lower sat = harder
        easy_end = state.global_sat_max  # higher sat = easier

    # Refine lower: binary search between [hard_end, anchor] for ~40% crossing
    state.search_phase = "refine_lower"
    state.bracket_lo = hard_end
    state.bracket_hi = state.anchor_value
    state.refine_step = 0
    state.current_probe_value = (state.bracket_lo + state.bracket_hi) / 2.0


def _handle_refine_lower(state: PretestState, p_hat: float):
    """Binary search for the lower (~40%) crossing between [hard_end, anchor]."""
    if p_hat > state.lower_target:
        # Still above lower target -> move toward harder
        state.bracket_hi = state.current_probe_value
    else:
        # Below lower target -> move toward easier
        state.bracket_lo = state.current_probe_value

    state.refine_step += 1
    if state.refine_step >= state.refine_steps_per_edge:
        # Record lower bound
        lower_bound = (state.bracket_lo + state.bracket_hi) / 2.0
        if state.current_axis == "size":
            state.size_lower = lower_bound
        else:
            state.saturation_lower = lower_bound

        # Switch to refine_upper
        if state.current_axis == "size":
            easy_end = state.global_size_max
        else:
            easy_end = state.global_sat_max

        state.search_phase = "refine_upper"
        state.bracket_lo = state.anchor_value
        state.bracket_hi = easy_end
        state.refine_step = 0
        state.current_probe_value = (state.bracket_lo + state.bracket_hi) / 2.0
    else:
        state.current_probe_value = (state.bracket_lo + state.bracket_hi) / 2.0


def _handle_refine_upper(state: PretestState, p_hat: float):
    """Binary search for the upper (~95%) crossing between [anchor, easy_end]."""
    if p_hat < state.upper_target:
        # Below upper target -> move toward easier
        state.bracket_lo = state.current_probe_value
    else:
        # Above upper target -> move toward harder
        state.bracket_hi = state.current_probe_value

    state.refine_step += 1
    if state.refine_step >= state.refine_steps_per_edge:
        # Record upper bound
        upper_bound = (state.bracket_lo + state.bracket_hi) / 2.0
        if state.current_axis == "size":
            state.size_upper = upper_bound
            state.size_95 = upper_bound  # Store size at ~95%

            # Switch to saturation axis
            state.current_axis = "saturation"
            state.search_phase = "find_anchor"
            state.probes_used = 0
            state.search_lo = state.global_sat_min
            state.search_hi = state.global_sat_max
            state.current_probe_value = (state.search_lo + state.search_hi) / 2.0
            state.anchor_value = None
            state.anchor_p_hat = None
        else:
            state.saturation_upper = upper_bound
            state.is_complete = True
    else:
        state.current_probe_value = (state.bracket_lo + state.bracket_hi) / 2.0


def _clamp_and_warn(state: PretestState, reason: str):
    """When search exhausts probes, clamp to global limits and move on."""
    axis = state.current_axis
    state.warnings.append(
        f"{reason}: Could not find anchor for {axis} axis within "
        f"{state.max_probes_per_axis} probes. Clamping to global limits."
    )

    if axis == "size":
        state.size_lower = state.global_size_min
        state.size_upper = state.global_size_max
        state.size_95 = state.global_size_max

        # Switch to saturation axis
        state.current_axis = "saturation"
        state.search_phase = "find_anchor"
        state.probes_used = 0
        state.search_lo = state.global_sat_min
        state.search_hi = state.global_sat_max
        state.current_probe_value = (state.search_lo + state.search_hi) / 2.0
        state.anchor_value = None
        state.anchor_p_hat = None
    else:
        state.saturation_lower = state.global_sat_min
        state.saturation_upper = state.global_sat_max
        state.is_complete = True


def serialize_pretest_state(state: PretestState) -> dict:
    """Serialize PretestState to a JSON-compatible dict."""
    return asdict(state)


def deserialize_pretest_state(data: dict) -> PretestState:
    """Deserialize a dict back into PretestState."""
    # Handle completed_probes and warnings which are lists
    return PretestState(**data)
