"""Tests for the pretest cutting search algorithm."""
import pytest
from algorithm_to_find_combinations.pretest import (
    PretestState,
    create_pretest_state,
    get_pretest_trial,
    process_pretest_result,
    serialize_pretest_state,
    deserialize_pretest_state,
)
from schemas.settings import PretestSettings


def make_default_state(**overrides):
    settings = PretestSettings()
    state = create_pretest_state(settings)
    for k, v in overrides.items():
        setattr(state, k, v)
    return state


def run_probe(state, success_pattern):
    """Run a full probe with the given success pattern (list of bools)."""
    for success in success_pattern:
        state = process_pretest_result(state, success)
    return state


class TestProbeScoring:
    def test_p_hat_all_correct(self):
        state = make_default_state(trial_cap=5, success_target=5)
        for _ in range(5):
            state = process_pretest_result(state, True)
        last_probe = state.completed_probes[-1]
        assert last_probe["p_hat"] == 1.0

    def test_p_hat_half_correct(self):
        state = make_default_state(trial_cap=4, success_target=100)
        results = [True, False, True, False]
        for s in results:
            state = process_pretest_result(state, s)
        last_probe = state.completed_probes[-1]
        assert last_probe["p_hat"] == 0.5

    def test_probe_completes_at_trial_cap(self):
        state = make_default_state(trial_cap=5, success_target=100)
        for _ in range(5):
            state = process_pretest_result(state, False)
        assert len(state.completed_probes) == 1
        assert state.completed_probes[0]["trials"] == 5

    def test_probe_completes_at_success_target(self):
        state = make_default_state(trial_cap=100, success_target=3)
        for _ in range(3):
            state = process_pretest_result(state, True)
        assert len(state.completed_probes) == 1
        assert state.completed_probes[0]["correct"] == 3


class TestAnchorSearch:
    def test_anchor_found_in_band(self):
        """If p_hat is within [lower_target, upper_target], anchor should be found."""
        state = make_default_state(
            trial_cap=10,
            success_target=100,
            lower_target=0.3,
            upper_target=0.9,
        )
        # 5/10 = 0.5, within [0.3, 0.9]
        results = [True, False, True, False, True, False, True, False, True, False]
        state = run_probe(state, results)
        assert state.anchor_value is not None
        assert state.search_phase == "refine_lower"

    def test_too_easy_moves_toward_harder(self):
        """If p_hat > upper_target, search should move toward harder values."""
        state = make_default_state(
            trial_cap=10,
            success_target=10,
            upper_target=0.8,
        )
        initial_probe = state.current_probe_value
        # All correct = p_hat 1.0 > 0.8 -> should move toward harder (smaller size)
        for _ in range(10):
            state = process_pretest_result(state, True)
        assert state.current_probe_value < initial_probe

    def test_too_hard_moves_toward_easier(self):
        """If p_hat < lower_target, search should move toward easier values."""
        state = make_default_state(
            trial_cap=10,
            success_target=100,
            lower_target=0.5,
        )
        initial_probe = state.current_probe_value
        # All wrong = p_hat 0.0 < 0.5 -> should move toward easier (larger size)
        for _ in range(10):
            state = process_pretest_result(state, False)
        assert state.current_probe_value > initial_probe


class TestBoundaryRefinement:
    def test_refine_lower_and_upper(self):
        """After anchor is found, refinement should produce lower and upper bounds."""
        state = make_default_state(
            trial_cap=4,
            success_target=100,
            refine_steps_per_edge=1,
            lower_target=0.3,
            upper_target=0.9,
        )
        # First probe: 2/4 = 0.5 -> anchor
        state = run_probe(state, [True, False, True, False])
        assert state.search_phase == "refine_lower"

        # Refine lower: 1 step
        state = run_probe(state, [True, False, True, False])
        assert state.search_phase == "refine_upper"

        # Refine upper: 1 step
        state = run_probe(state, [True, True, True, False])
        # After size upper is done, should switch to saturation axis
        assert state.current_axis == "saturation"
        assert state.size_lower is not None
        assert state.size_upper is not None


class TestAxisSwitching:
    def test_size_then_saturation(self):
        """After completing size axis, should switch to saturation axis."""
        state = make_default_state(
            trial_cap=4,
            success_target=100,
            refine_steps_per_edge=1,
            lower_target=0.2,
            upper_target=0.9,
        )
        assert state.current_axis == "size"

        # Run through size axis: anchor + refine_lower + refine_upper
        for _ in range(3):
            state = run_probe(state, [True, False, True, False])

        assert state.current_axis == "saturation"
        assert state.search_phase == "find_anchor"


class TestClampAndWarn:
    def test_clamp_when_probes_exhausted(self):
        """When max_probes_per_axis is hit, should clamp to global limits."""
        state = make_default_state(
            trial_cap=1,
            success_target=100,
            max_probes_per_axis=2,
            upper_target=0.5,  # Set very low so all probes are "too easy"
        )
        # All correct, p_hat=1.0 > 0.5, every probe is too easy
        state = process_pretest_result(state, True)  # probe 1
        state = process_pretest_result(state, True)  # probe 2 -> exhausted
        assert len(state.warnings) > 0
        assert state.current_axis == "saturation"
        assert state.size_lower == state.global_size_min
        assert state.size_upper == state.global_size_max


class TestFullFlow:
    def test_complete_pretest_with_synthetic_responder(self):
        """Run a full pretest with a synthetic monotonic responder."""
        state = make_default_state(
            trial_cap=10,
            success_target=100,
            refine_steps_per_edge=1,
            lower_target=0.3,
            upper_target=0.8,
        )

        max_iterations = 200
        iteration = 0
        while not state.is_complete and iteration < max_iterations:
            trial = get_pretest_trial(state)
            # Synthetic responder: larger size / higher saturation = more likely correct
            if state.current_axis == "size":
                p = trial["triangle_size"] / state.global_size_max
            else:
                p = trial["saturation"] / state.global_sat_max
            import random
            random.seed(iteration)
            success = random.random() < p
            state = process_pretest_result(state, success)
            iteration += 1

        assert state.is_complete
        assert state.size_lower is not None
        assert state.size_upper is not None
        assert state.saturation_lower is not None
        assert state.saturation_upper is not None
        assert state.size_lower <= state.size_upper
        assert state.saturation_lower <= state.saturation_upper


class TestSerialization:
    def test_roundtrip(self):
        state = make_default_state()
        state.warnings.append("test warning")
        state.completed_probes.append({"value": 1.0, "p_hat": 0.5})
        data = serialize_pretest_state(state)
        restored = deserialize_pretest_state(data)
        assert restored.lower_target == state.lower_target
        assert restored.warnings == ["test warning"]
        assert len(restored.completed_probes) == 1

    def test_serialization_preserves_bounds(self):
        state = make_default_state()
        state.size_lower = 50.0
        state.size_upper = 200.0
        data = serialize_pretest_state(state)
        restored = deserialize_pretest_state(data)
        assert restored.size_lower == 50.0
        assert restored.size_upper == 200.0
