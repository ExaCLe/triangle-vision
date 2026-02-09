from algorithm_to_find_combinations.algorithm import AlgorithmState, update_state


def _find_rect(rectangles, ts_bounds, sat_bounds):
    return next(
        r
        for r in rectangles
        if r["bounds"]["triangle_size"] == ts_bounds
        and r["bounds"]["saturation"] == sat_bounds
    )


def test_split_redistributes_existing_samples_into_children():
    state = AlgorithmState((0.0, 10.0), (0.0, 10.0))
    root = state.rectangles[0]

    samples = [
        (1.0, 1.0, True),   # lower-left
        (2.0, 2.0, False),  # lower-left
        (7.0, 1.0, True),   # lower-right
        (8.0, 2.0, False),  # lower-right
        (1.0, 7.0, False),  # upper-left
        (8.0, 8.0, True),   # upper-right
    ]

    for ts, sat, success in samples:
        state = update_state(
            state,
            root,
            {"triangle_size": ts, "saturation": sat},
            success,
            success_rate_threshold=0.85,
            total_samples_threshold=5,
            max_samples=60,
        )

    assert len(state.rectangles) == 4

    ll = _find_rect(state.rectangles, (0.0, 5.0), (0.0, 5.0))
    lr = _find_rect(state.rectangles, (5.0, 10.0), (0.0, 5.0))
    ul = _find_rect(state.rectangles, (0.0, 5.0), (5.0, 10.0))
    ur = _find_rect(state.rectangles, (5.0, 10.0), (5.0, 10.0))

    assert (ll["true_samples"], ll["false_samples"]) == (1, 1)
    assert (lr["true_samples"], lr["false_samples"]) == (1, 1)
    assert (ul["true_samples"], ul["false_samples"]) == (0, 1)
    assert (ur["true_samples"], ur["false_samples"]) == (1, 0)

    total_true = sum(r["true_samples"] for r in state.rectangles)
    total_false = sum(r["false_samples"] for r in state.rectangles)
    assert total_true == 3
    assert total_false == 3


def test_update_state_can_skip_re_recording_existing_sample():
    state = AlgorithmState((0.0, 10.0), (0.0, 10.0))
    rect = state.rectangles[0]
    rect["true_samples"] = 2
    rect["false_samples"] = 1
    rect["samples"] = [
        {"triangle_size": 1.0, "saturation": 1.0, "success": True},
        {"triangle_size": 2.0, "saturation": 2.0, "success": True},
        {"triangle_size": 3.0, "saturation": 3.0, "success": False},
    ]

    state = update_state(
        state,
        rect,
        {"triangle_size": 4.0, "saturation": 4.0},
        True,
        record_sample=False,
    )

    assert rect["true_samples"] == 2
    assert rect["false_samples"] == 1
    assert len(rect["samples"]) == 3
