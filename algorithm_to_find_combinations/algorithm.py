import random
import colorsys
from tqdm import tqdm
from .ground_truth import test_combination

# Remove hardcoded bounds and just keep orientations
orientations = ["N", "S", "E", "W"]


def selection_probability(rect):
    A = rect["area"]
    n = rect["true_samples"] + rect["false_samples"]
    s = rect["true_samples"] / (n + 1)  # Add 1 to avoid division by zero
    return (A / (n + 1)) * (1 - s)


def hsv_to_rgb(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h / 360, s, v)
    return int(r * 255), int(g * 255), int(b * 255)


def _in_child_bounds(value, lower, upper, parent_upper, eps=1e-9):
    """Half-open bounds for children, closed on the parent's max edge."""
    return (value >= lower - eps) and (
        value < upper - eps or abs(upper - parent_upper) <= eps
    )


def _assign_sample_to_child(sample, children, parent_bounds):
    ts = sample["triangle_size"]
    sat = sample["saturation"]
    parent_ts_max = parent_bounds["triangle_size"][1]
    parent_sat_max = parent_bounds["saturation"][1]

    for child in children:
        ts_min, ts_max = child["bounds"]["triangle_size"]
        sat_min, sat_max = child["bounds"]["saturation"]
        if _in_child_bounds(ts, ts_min, ts_max, parent_ts_max) and _in_child_bounds(
            sat, sat_min, sat_max, parent_sat_max
        ):
            return child
    return None


def split_rectangle(rect):
    bounds = rect["bounds"]
    midpoints = {k: (v[0] + v[1]) / 2 for k, v in bounds.items()}
    new_rects = []
    # Split into 4 sub-rectangles
    for i in range(2):
        for j in range(2):
            new_bounds = {
                "triangle_size": (
                    (bounds["triangle_size"][0], midpoints["triangle_size"])
                    if i == 0
                    else (midpoints["triangle_size"], bounds["triangle_size"][1])
                ),
                "saturation": (
                    (bounds["saturation"][0], midpoints["saturation"])
                    if j == 0
                    else (midpoints["saturation"], bounds["saturation"][1])
                ),
            }
            new_rects.append(
                {
                    "bounds": new_bounds,
                    "area": rect["area"] / 4,
                    "true_samples": 0,
                    "false_samples": 0,
                    "samples": [],
                }
            )

    # Preserve history by redistributing the parent rectangle's samples.
    for sample in rect.get("samples", []):
        child = _assign_sample_to_child(sample, new_rects, bounds)
        if child is None:
            continue
        child["samples"].append(sample)
        if sample["success"]:
            child["true_samples"] += 1
        else:
            child["false_samples"] += 1
    return new_rects


class AlgorithmState:
    def __init__(self, triangle_size_bounds, saturation_bounds, rectangles=None):
        self.triangle_size_bounds = triangle_size_bounds
        self.saturation_bounds = saturation_bounds
        self.new_rectangles = []
        self.removed_rectangles = []
        if rectangles is None or len(rectangles) == 0:
            # Initialize with a single rectangle covering the entire space
            self.rectangles = [
                {
                    "bounds": {
                        "triangle_size": triangle_size_bounds,
                        "saturation": saturation_bounds,
                    },
                    "area": 1.0,
                    "true_samples": 0,
                    "false_samples": 0,
                    "samples": [],
                }
            ]
            self.new_rectangles.append(self.rectangles[0])
        else:
            self.rectangles = rectangles


def get_next_combination(state: AlgorithmState):
    """Get the next combination to test based on current state"""
    probabilities = [selection_probability(r) for r in state.rectangles]
    total_prob = sum(probabilities)
    if total_prob == 0:
        return None, None

    probabilities = [p / total_prob for p in probabilities]
    selected_rect = random.choices(state.rectangles, weights=probabilities, k=1)[0]
    bounds = selected_rect["bounds"]

    triangle_size = random.uniform(*bounds["triangle_size"])
    saturation = random.uniform(*bounds["saturation"])

    return {
        "triangle_size": triangle_size,
        "saturation": saturation,
    }, selected_rect


def update_state(
    state: AlgorithmState,
    selected_rect,
    combination,
    success: bool,
    success_rate_threshold=0.85,
    total_samples_threshold=5,
    max_samples=60,
    record_sample=True,
):
    """Update algorithm state based on test result"""
    if "samples" not in selected_rect or selected_rect["samples"] is None:
        selected_rect["samples"] = []

    if record_sample:
        sample = {
            "triangle_size": combination["triangle_size"],
            "saturation": combination["saturation"],
            "success": bool(success),
        }
        selected_rect["samples"].append(sample)
        if success:
            selected_rect["true_samples"] += 1
        else:
            selected_rect["false_samples"] += 1

    total_samples = selected_rect["true_samples"] + selected_rect["false_samples"]
    success_rate = (
        selected_rect["true_samples"] / total_samples if total_samples > 0 else 0
    )

    # Split if success rate is too low or if we have too many samples
    if (
        success_rate < success_rate_threshold
        and total_samples > total_samples_threshold
    ) or total_samples > max_samples:
        new_rects = split_rectangle(selected_rect)
        state.rectangles.remove(selected_rect)
        state.rectangles.extend(new_rects)

        # Track changes
        state.removed_rectangles.append(selected_rect)
        state.new_rectangles.extend(new_rects)

    return state


def run_base_algorithm(
    triangle_size_bounds,
    saturation_bounds,
    orientations,
    iterations=1000,
    success_rate_threshold=0.85,
    total_samples_threshold=5,
    test_combination=test_combination,
):
    """Keep original function working by using the new stateful version internally"""
    state = AlgorithmState(triangle_size_bounds, saturation_bounds)
    combinations = []

    for _ in tqdm(range(iterations), desc="Sampling Iterations"):
        combination, selected_rect = get_next_combination(state)
        if not combination:
            break

        success = test_combination(
            combination["triangle_size"],
            combination["saturation"],
            bounds=(triangle_size_bounds, saturation_bounds),
        )

        state = update_state(
            state,
            selected_rect,
            combination,
            success,
            success_rate_threshold,
            total_samples_threshold,
        )

        combination["success"] = success
        combinations.append(combination)

    return combinations, state.rectangles
