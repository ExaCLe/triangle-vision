import random
import colorsys
import numpy as np
from tqdm import tqdm
from ground_truth import test_combination
from plotting import compute_soft_brush_smooth, get_scaled_radii
import pandas as pd

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
                }
            ]
            self.new_rectangles.append(self.rectangles[0])
        else:
            self.rectangles = rectangles
        self.combinations = []


def sample_point_from_grid(
    mean_grid,
    var_grid,
    x_bounds=(0, 1),
    y_bounds=(0, 1),
    target=0.75,
    target_method="exponential",  # Default updated to "exponential"
    variance_influence=1.0,
    alpha=1.0,
):
    """
    Samples a continuous (x,y) point from a grid defined by mean_grid and var_grid.
    The sampling weight for each grid cell is determined solely by a target factor that
    favors cells whose mean is near the specified target value.

    Here the base weight is assumed to be uniform (i.e. the integrated probability is 1 for
    all cells), so the final weight depends only on the target factor.

    The target factor is computed as:
      - For target_method 'gaussian':
            exp(- ((|mu - target| * alpha) / (sigma**variance_influence))**2)
      - For target_method 'exponential':
            exp(- (|mu - target| * alpha) / (sigma**variance_influence))

    Parameters:
      mean_grid : 2D np.array
          Grid of mean values.
      var_grid : 2D np.array
          Grid of variance values.
      x_bounds : tuple (x_min, x_max)
          The continuous domain bounds in x.
      y_bounds : tuple (y_min, y_max)
          The continuous domain bounds in y.
      target : float
          The desired target value (e.g., 0.75).
      target_method : str
          Method to compute the target factor. Options:
            - 'gaussian': uses exp(- ((|mu - target| * alpha) / (sigma**variance_influence))**2)
            - 'exponential': uses exp(- (|mu - target| * alpha) / (sigma**variance_influence))
      variance_influence : float
          The exponent on sigma in the target factor. Higher values increase the influence of variance.
      alpha : float
          A scaling factor applied to |mu - target|.

    Returns:
      sample_pt : tuple
          The sampled continuous (x, y) point.
      weights : 2D np.array
          The computed probability weights for each grid cell (before sampling).
    """
    n_rows, n_cols = mean_grid.shape
    # Compute standard deviation; add a tiny value to avoid division by zero.
    std_grid = np.sqrt(var_grid + 1e-12)
    # replace all nan values in mean_grid with target
    mean_grid = np.nan_to_num(mean_grid, nan=target)

    # Use a uniform base weight (i.e., integrated probability = 1 for all cells).
    base_weights = np.ones_like(mean_grid)

    # Compute the target factor.
    if target_method == "gaussian":
        target_factor = np.exp(
            -(
                ((np.abs(mean_grid - target) * alpha) / (std_grid**variance_influence))
                ** 2
            )
        )
    elif target_method == "exponential":
        target_factor = np.exp(
            -(np.abs(mean_grid - target) * alpha) / (std_grid**variance_influence)
        )
    else:
        target_factor = 1.0  # No additional bias.

    # The final weight is the product of the base weight and the target factor.
    weights = base_weights * target_factor

    # Normalize weights for sampling.
    flat_weights = weights.flatten()
    total_weight = flat_weights.sum()
    if total_weight == 0:
        raise ValueError("All grid cells have zero weight. Check your parameters.")
    flat_weights = flat_weights / total_weight

    # Sample one grid cell based on the normalized weights.
    idx = np.random.choice(n_rows * n_cols, p=flat_weights)
    i = idx // n_cols  # row index
    j = idx % n_cols  # column index

    # Compute continuous cell boundaries.
    x_min, x_max = x_bounds
    y_min, y_max = y_bounds
    cell_width = (x_max - x_min) / n_cols
    cell_height = (y_max - y_min) / n_rows
    cell_x_min = x_min + j * cell_width
    cell_y_min = y_min + i * cell_height

    # Sample uniformly within the chosen cell.
    x_sample = cell_x_min + np.random.rand() * cell_width
    y_sample = cell_y_min + np.random.rand() * cell_height
    sample_pt = (x_sample, y_sample)

    return sample_pt, weights


def compute_sample_density(
    df,
    triangle_size_bounds,
    saturation_bounds,
    params=None,
):
    """
    Compute sample density for each point using soft brush approach.
    Returns a grid of density values where higher values indicate more samples in the area.

    Args:
        df: DataFrame with 'triangle_size' and 'saturation' columns
        triangle_size_bounds: Tuple of (min, max) for triangle size
        saturation_bounds: Tuple of (min, max) for saturation
        params: Dictionary with optional 'inner_radius' and 'outer_radius'

    Returns:
        X, Y: Meshgrid coordinates
        Z_density: Grid of density values
    """
    points = df[["triangle_size", "saturation"]].values

    # Get default radii if not provided
    inner_radius, outer_radius = get_scaled_radii(
        (triangle_size_bounds, saturation_bounds),
        normalized_inner_radius=3,
        normalized_outer_radius=30,
    )
    if params:
        inner_radius = params.get("inner_radius", inner_radius)
        outer_radius = params.get("outer_radius", outer_radius)

    # Normalize coordinates
    triangle_min, triangle_max = triangle_size_bounds
    saturation_min, saturation_max = saturation_bounds

    points_normalized = np.empty_like(points, dtype=np.float64)
    points_normalized[:, 0] = (points[:, 0] - triangle_min) / (
        triangle_max - triangle_min
    )
    points_normalized[:, 1] = (points[:, 1] - saturation_min) / (
        saturation_max - saturation_min
    )

    # Create grid
    grid_x = np.linspace(triangle_min, triangle_max, 100)
    grid_y = np.linspace(saturation_min, saturation_max, 100)
    X, Y = np.meshgrid(grid_x, grid_y)
    grid_points = np.column_stack([X.ravel(), Y.ravel()])

    # Normalize grid points
    grid_points_normalized = np.empty_like(grid_points, dtype=np.float64)
    grid_points_normalized[:, 0] = (grid_points[:, 0] - triangle_min) / (
        triangle_max - triangle_min
    )
    grid_points_normalized[:, 1] = (grid_points[:, 1] - saturation_min) / (
        saturation_max - saturation_min
    )

    # Normalize radii
    max_range = max(triangle_max - triangle_min, saturation_max - saturation_min)
    inner_radius_norm = inner_radius / max_range
    outer_radius_norm = outer_radius / max_range

    # Compute squared radii
    inner_radius_sq = inner_radius_norm**2
    outer_radius_sq = outer_radius_norm**2

    # Calculate distances
    from sklearn.metrics import pairwise_distances

    distances_sq = pairwise_distances(
        grid_points_normalized, points_normalized, metric="sqeuclidean"
    )

    # Calculate weights based on distances
    weights = np.where(
        distances_sq <= inner_radius_sq,
        1.0,
        np.where(
            (distances_sq > inner_radius_sq) & (distances_sq <= outer_radius_sq),
            (outer_radius_norm - np.sqrt(distances_sq))
            / (outer_radius_norm - inner_radius_norm),
            0.0,
        ),
    )

    # Sum up weights to get density
    Z_density = np.sum(weights, axis=1)
    Z_density = Z_density.reshape(X.shape)

    # Normalize density to [0, 1] range
    # Z_density = (Z_density - Z_density.min()) / (Z_density.max() - Z_density.min())
    # Z_density = 1 - Z_density

    Z_density = np.exp(-0.5 * np.sqrt(Z_density))

    return X, Y, Z_density


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


def get_next_combinations_confidence_bounds(state):
    # sample the first 20 points uniformly at random
    if len(state.combinations) < 50:
        bounds = {
            "triangle_size": state.triangle_size_bounds,
            "saturation": state.saturation_bounds,
        }
        triangle_size = random.uniform(*bounds["triangle_size"])
        saturation = random.uniform(*bounds["saturation"])
        return {
            "triangle_size": triangle_size,
            "saturation": saturation,
        }, None

    df = pd.DataFrame(state.combinations)
    df["success_float"] = df["success"].astype(float)
    _, _, mean = compute_soft_brush_smooth(
        df, state.triangle_size_bounds, state.saturation_bounds, params=None
    )
    _, _, variance = compute_sample_density(
        df, state.triangle_size_bounds, state.saturation_bounds, params=None
    )
    point, _ = sample_point_from_grid(
        mean,
        variance,
        state.triangle_size_bounds,
        state.saturation_bounds,
        alpha=1000.0,
        variance_influence=0.1,
    )

    return {
        "triangle_size": point[0],
        "saturation": point[1],
    }, None


def update_state(
    state: AlgorithmState,
    selected_rect,
    combination,
    success: bool,
    success_rate_threshold=0.85,
    total_samples_threshold=5,
):
    """Update algorithm state based on test result"""

    if selected_rect is None:
        combination["success"] = 1 if success else 0
        state.combinations.append(combination)
        return state

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
    ) or total_samples > 60:
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
    get_next_combination_strategy="rectangles",  # New parameter
):
    """Keep original function working by using the new stateful version internally"""
    state = AlgorithmState(triangle_size_bounds, saturation_bounds)
    combinations = []

    if get_next_combination_strategy == "rectangles":
        get_next_combination_strategy = get_next_combination
    elif get_next_combination_strategy == "confidence_bounds":
        get_next_combination_strategy = get_next_combinations_confidence_bounds
    else:
        raise ValueError("Invalid strategy")

    for _ in tqdm(range(iterations), desc="Sampling Iterations"):
        combination, selected_rect = get_next_combination_strategy(state)
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
