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
                }
            )
    return new_rects


class AlgorithmState:
    def __init__(self, triangle_size_bounds, saturation_bounds, rectangles=None):
        self.triangle_size_bounds = triangle_size_bounds
        self.saturation_bounds = saturation_bounds
        self.rectangles = rectangles or []
        self.new_rectangles = []
        self.removed_rectangles = []
        self.init_tracking()

    def init_tracking(self):
        """Initialize or reset tracking arrays"""
        if not hasattr(self, "new_rectangles"):
            self.new_rectangles = []
        if not hasattr(self, "removed_rectangles"):
            self.removed_rectangles = []


def get_next_combination(state: AlgorithmState):
    """Get the next combination to test based on current state"""
    state.init_tracking()  # Ensure tracking arrays exist
    if not state.rectangles:
        initial_rect = {
            "bounds": {
                "triangle_size": state.triangle_size_bounds,
                "saturation": state.saturation_bounds,
            },
            "area": 1.0,
            "true_samples": 0,
            "false_samples": 0,
        }
        state.rectangles = [initial_rect]
        state.new_rectangles = [initial_rect]
        state.removed_rectangles = []

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
):
    """Update algorithm state based on test result"""
    if success:
        selected_rect["true_samples"] += 1
    else:
        selected_rect["false_samples"] += 1

    total_samples = selected_rect["true_samples"] + selected_rect["false_samples"]
    success_rate = (
        selected_rect["true_samples"] / total_samples if total_samples > 0 else 0
    )

    if (
        success_rate < success_rate_threshold
        and total_samples > total_samples_threshold
    ):
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
            combination["orientation"],
            (triangle_size_bounds, saturation_bounds),
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
