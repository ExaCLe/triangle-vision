import random
import colorsys
import seaborn as sns
import pandas as pd
import matplotlib.pyplot as plt
from tqdm import tqdm
import math
import numpy as np
from scipy.spatial import cKDTree

# Initialize bounds
triangle_size_bounds = (50, 300)
saturation_bounds = (0.5, 1.0)

# Fixed values for other parameters
hue = 0
value = 1.0
orientations = ["N", "S", "E", "W"]

# Initial rectangle (entire parameter space)
rectangles = [
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


def selection_probability(rect):
    A = rect["area"]
    n = rect["true_samples"] + rect["false_samples"]
    s = rect["true_samples"] / (n + 1)  # Add 1 to avoid division by zero
    return (A / (n + 1)) * (1 - s)


def hsv_to_rgb(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h / 360, s, v)
    return int(r * 255), int(g * 255), int(b * 255)


def scaled_values(triangle_size, saturation):
    # Scale triangle_size from [50,300] to [0,1]
    ts_scaled = (triangle_size - triangle_size_bounds[0]) / (
        triangle_size_bounds[1] - triangle_size_bounds[0]
    )
    # Scale saturation from [0.5,1.0] to [0,1]
    sat_scaled = (saturation - saturation_bounds[0]) / (
        saturation_bounds[1] - saturation_bounds[0]
    )
    return ts_scaled, sat_scaled


def test_combination(triangle_size, saturation, orientation):
    """Return success/failure based on a gradient probability."""
    ts_scaled, sat_scaled = scaled_values(triangle_size, saturation)
    # Compute a smooth gradient success probability
    success_probability = 0.6 + 0.39 * math.sqrt((ts_scaled**2 + sat_scaled**2) / 2.0)
    return random.random() < success_probability


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


# Initialize combinations list and set number of iterations
combinations = []
iterations = 1000

for _ in tqdm(range(iterations), desc="Sampling Iterations"):
    probabilities = [selection_probability(r) for r in rectangles]
    total_prob = sum(probabilities)
    if total_prob == 0:
        print("Total selection probability is zero. Stopping sampling.")
        break
    probabilities = [p / total_prob for p in probabilities]
    selected_rect = random.choices(rectangles, weights=probabilities, k=1)[0]
    bounds = selected_rect["bounds"]

    # Generate a single combination
    triangle_size = random.uniform(*bounds["triangle_size"])
    saturation = random.uniform(*bounds["saturation"])
    orientation = random.choice(orientations)

    # Test this specific combination once
    success = test_combination(triangle_size, saturation, orientation)

    # Update rectangle stats
    if success:
        selected_rect["true_samples"] += 1
    else:
        selected_rect["false_samples"] += 1

    total_samples = selected_rect["true_samples"] + selected_rect["false_samples"]
    success_rate = (
        selected_rect["true_samples"] / total_samples if total_samples > 0 else 0
    )

    # If success rate is low after a few samples, subdivide the rectangle
    if success_rate < 0.75 and total_samples > 5:
        new_rects = split_rectangle(selected_rect)
        rectangles.remove(selected_rect)
        rectangles.extend(new_rects)

    # Append the combination data
    combinations.append(
        {
            "triangle_size": triangle_size,
            "saturation": saturation,
            "orientation": orientation,
            "success": success,
        }
    )

# Convert combinations to DataFrame
df = pd.DataFrame(combinations)

# Check if DataFrame is not empty
if df.empty:
    raise ValueError("No combinations were sampled. Please check the sampling logic.")

# Convert success boolean to float and get values array
df["success_float"] = df["success"].astype(float)
values = df["success_float"].values  # Define values here

# Normalize coordinates for KDTree
min_triangle = df["triangle_size"].min()
max_triangle = df["triangle_size"].max()
min_saturation = df["saturation"].min()
max_saturation = df["saturation"].max()

# Handle cases where min and max are equal to avoid division by zero
if max_triangle == min_triangle:
    df["triangle_size_norm"] = 0.5  # Arbitrary constant
else:
    df["triangle_size_norm"] = (df["triangle_size"] - min_triangle) / (
        max_triangle - min_triangle
    )

if max_saturation == min_saturation:
    df["saturation_norm"] = 0.5  # Arbitrary constant
else:
    df["saturation_norm"] = (df["saturation"] - min_saturation) / (
        max_saturation - min_saturation
    )

normalized_points = df[["triangle_size_norm", "saturation_norm"]].values
tree = cKDTree(normalized_points)

n_samples = len(df)
k = max(5, int(0.1 * n_samples))  # k at least 5, or 10% of total samples
k = min(k, n_samples)  # Ensure k does not exceed number of samples

# Adjust the grid computation
grid_x = np.linspace(triangle_size_bounds[0], triangle_size_bounds[1], 100)
grid_y = np.linspace(saturation_bounds[0], saturation_bounds[1], 100)
X, Y = np.meshgrid(grid_x, grid_y)

# Normalize grid points
X_norm = (
    (X - min_triangle) / (max_triangle - min_triangle)
    if max_triangle != min_triangle
    else np.full_like(X, 0.5)
)
Y_norm = (
    (Y - min_saturation) / (max_saturation - min_saturation)
    if max_saturation != min_saturation
    else np.full_like(Y, 0.5)
)
grid_points_norm = np.column_stack([X_norm.ravel(), Y_norm.ravel()])

# Query k-NN for all grid points at once
dists, idxs = tree.query(grid_points_norm, k=k)

# Handle cases where k=1 (squeeze dimensions)
if k == 1:
    dists = dists[:, np.newaxis]
    idxs = idxs[:, np.newaxis]

# Compute weights
weights = 1 / (dists + 1e-6)  # Add small epsilon to avoid division by zero
weights /= weights.sum(axis=1, keepdims=True)  # Normalize weights

# Compute weighted average of success values
neighbor_success = values[idxs]  # Shape: (num_grid_points, k)
Z_knn = np.sum(weights * neighbor_success, axis=1).reshape(X.shape)


# For comparison, create the theoretical model
def compute_theoretical_success(triangle_size, saturation):
    ts_scaled, sat_scaled = scaled_values(triangle_size, saturation)
    return 0.6 + 0.39 * math.sqrt((ts_scaled**2 + sat_scaled**2) / 2.0)


# Vectorize the theoretical model computation
vectorized_model = np.vectorize(compute_theoretical_success)
Z_model = vectorized_model(X, Y)

# Plotting
fig, axs = plt.subplots(1, 3, figsize=(24, 8))

# Left plot: raw scatter
scatter = axs[0].scatter(
    df["triangle_size"],
    df["saturation"],
    c=df["success_float"],
    cmap="RdYlGn",
    edgecolor="k",
    alpha=0.7,
)
axs[0].set_title("Raw Sampled Points")
axs[0].set_xlabel("Triangle Size")
axs[0].set_ylabel("Saturation")
cbar1 = fig.colorbar(scatter, ax=axs[0], label="Success")
cbar1.set_ticks([0, 1])
cbar1.set_ticklabels(["Failure", "Success"])

# Middle plot: k-NN based smoothing
contour_knn = axs[1].contourf(X, Y, Z_knn, levels=100, cmap="RdYlGn", alpha=0.9)
scatter_knn = axs[1].scatter(
    df["triangle_size"],
    df["saturation"],
    c=df["success_float"],
    cmap="RdYlGn",
    edgecolor="k",
    alpha=0.5,
)
axs[1].set_title(f"k-NN Smoothed (k={k})")
axs[1].set_xlabel("Triangle Size")
axs[1].set_ylabel("Saturation")
cbar2 = fig.colorbar(contour_knn, ax=axs[1], label="Success Rate")

# Right plot: theoretical model
contour_model = axs[2].contourf(X, Y, Z_model, levels=100, cmap="RdYlGn", alpha=0.9)
axs[2].set_title("Theoretical Success Probability (Model)")
axs[2].set_xlabel("Triangle Size")
axs[2].set_ylabel("Saturation")
cbar3 = fig.colorbar(contour_model, ax=axs[2], label="Success Probability")

plt.tight_layout()
plt.show()
