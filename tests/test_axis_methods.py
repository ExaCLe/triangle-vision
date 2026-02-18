from algorithm_to_find_combinations.axis_methods import (
    AxisBounds,
    build_axis_analysis,
    choose_next_trial,
    infer_axis_from_trial,
)


def _bounds():
    return AxisBounds(
        size_min=10.0,
        size_max=200.0,
        saturation_min=0.0,
        saturation_max=1.0,
    )


def test_infer_axis_from_trial():
    bounds = _bounds()
    assert infer_axis_from_trial(100.0, 1.0, bounds) == "size"
    assert infer_axis_from_trial(200.0, 0.4, bounds) == "saturation"


def test_choose_next_trial_alternate_switches_axis():
    bounds = _bounds()
    trials = []

    first = choose_next_trial("axis_logistic", "alternate", trials, bounds)
    trials.append(
        {
            "triangle_size": first["triangle_size"],
            "saturation": first["saturation"],
            "success": 1,
        }
    )

    second = choose_next_trial("axis_logistic", "alternate", trials, bounds)
    assert first["axis"] != second["axis"]


def test_build_axis_analysis_returns_curves_and_thresholds():
    bounds = _bounds()
    trials = [
        {"triangle_size": 20.0, "saturation": 1.0, "success": 0},
        {"triangle_size": 60.0, "saturation": 1.0, "success": 0},
        {"triangle_size": 120.0, "saturation": 1.0, "success": 1},
        {"triangle_size": 180.0, "saturation": 1.0, "success": 1},
        {"triangle_size": 200.0, "saturation": 0.1, "success": 0},
        {"triangle_size": 200.0, "saturation": 0.3, "success": 0},
        {"triangle_size": 200.0, "saturation": 0.6, "success": 1},
        {"triangle_size": 200.0, "saturation": 0.8, "success": 1},
    ]

    analysis = build_axis_analysis("axis_isotonic", trials, bounds, percent_step=5)
    assert analysis["counts"]["total"] == 8
    assert analysis["counts"]["size_axis_trials"] == 4
    assert analysis["counts"]["saturation_axis_trials"] == 4
    assert len(analysis["curves"]["size"]["x"]) > 0
    assert len(analysis["curves"]["saturation"]["x"]) > 0
    assert analysis["threshold_table"]["percent_step"] == 5
    assert len(analysis["threshold_table"]["size"]) > 0
    assert len(analysis["threshold_table"]["saturation"]) > 0
