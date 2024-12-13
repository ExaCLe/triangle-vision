import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from scipy.spatial import cKDTree
from ground_truth import ground_truth_probability
import matplotlib.patches as patches  # Ensure this import is present


def scaled_values(triangle_size, saturation, bounds):
    ts_scaled = (triangle_size - bounds[0][0]) / (bounds[0][1] - bounds[0][0])
    sat_scaled = (saturation - bounds[1][0]) / (bounds[1][1] - bounds[1][0])
    return ts_scaled, sat_scaled


def plot_raw_scatter(ax, df):
    scatter = ax.scatter(
        df["triangle_size"],
        df["saturation"],
        c=df["success_float"],
        cmap="RdYlGn",
        edgecolor="k",
        alpha=0.7,
    )
    ax.set_title("Raw Sampled Points")
    ax.set_xlabel("Triangle Size")
    ax.set_ylabel("Saturation")
    return scatter


def plot_knn_smooth(ax, df, X, Y, Z_knn, k):
    contour_knn = ax.contourf(X, Y, Z_knn, levels=100, cmap="RdYlGn", alpha=0.9)
    scatter_knn = ax.scatter(
        df["triangle_size"],
        df["saturation"],
        c=df["success_float"],
        cmap="RdYlGn",
        edgecolor="k",
        alpha=0.5,
    )
    ax.set_title(f"k-NN Smoothed (k={k})")
    ax.set_xlabel("Triangle Size")
    ax.set_ylabel("Saturation")
    return contour_knn


def plot_theoretical(ax, X, Y, Z_model):
    contour_model = ax.contourf(X, Y, Z_model, levels=100, cmap="RdYlGn", alpha=0.9)
    ax.set_title("Theoretical Success Probability (Model)")
    ax.set_xlabel("Triangle Size")
    ax.set_ylabel("Saturation")
    return contour_model


def compute_knn_smooth(df, triangle_size_bounds, saturation_bounds, k=None):
    values = df["success_float"].values

    # Normalize coordinates for KDTree
    df["triangle_size_norm"] = (df["triangle_size"] - df["triangle_size"].min()) / (
        df["triangle_size"].max() - df["triangle_size"].min()
    )
    df["saturation_norm"] = (df["saturation"] - df["saturation"].min()) / (
        df["saturation"].max() - df["saturation"].min()
    )

    normalized_points = df[["triangle_size_norm", "saturation_norm"]].values
    tree = cKDTree(normalized_points)

    # Determine k if not provided
    n_samples = len(df)
    if k is None:
        k = max(5, int(0.1 * n_samples))
        k = min(k, n_samples)

    # Create grid
    grid_x = np.linspace(triangle_size_bounds[0], triangle_size_bounds[1], 100)
    grid_y = np.linspace(saturation_bounds[0], saturation_bounds[1], 100)
    X, Y = np.meshgrid(grid_x, grid_y)

    # Normalize grid points and compute k-NN
    X_norm = (X - df["triangle_size"].min()) / (
        df["triangle_size"].max() - df["triangle_size"].min()
    )
    Y_norm = (Y - df["saturation"].min()) / (
        df["saturation"].max() - df["saturation"].min()
    )
    grid_points_norm = np.column_stack([X_norm.ravel(), Y_norm.ravel()])

    dists, idxs = tree.query(grid_points_norm, k=k)
    if k == 1:
        dists = dists[:, np.newaxis]
        idxs = idxs[:, np.newaxis]

    weights = 1 / (dists + 1e-6)
    weights /= weights.sum(axis=1, keepdims=True)
    neighbor_success = values[idxs]
    Z_knn = np.sum(weights * neighbor_success, axis=1).reshape(X.shape)

    return X, Y, Z_knn, k


def compute_soft_brush_smooth(df, triangle_size_bounds, saturation_bounds, params):
    values = df["success_float"].values
    points = df[["triangle_size", "saturation"]].values

    # Extract parameters
    inner_radius = params.get("inner_radius", 15)
    outer_radius = params.get("outer_radius", 30)

    # Normalize both the data points and grid points to [0,1] range for each dimension
    triangle_min, triangle_max = triangle_size_bounds
    saturation_min, saturation_max = saturation_bounds

    points_normalized = np.empty_like(points, dtype=np.float64)
    points_normalized[:, 0] = (points[:, 0] - triangle_min) / (
        triangle_max - triangle_min
    )
    points_normalized[:, 1] = (points[:, 1] - saturation_min) / (
        saturation_max - saturation_min
    )

    # Create grid in original space
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

    # Normalize radii based on the maximum range to maintain aspect ratio
    max_range = max(triangle_max - triangle_min, saturation_max - saturation_min)
    inner_radius_norm = inner_radius / max_range
    outer_radius_norm = outer_radius / max_range

    # Compute squared radii for efficiency
    inner_radius_sq = inner_radius_norm**2
    outer_radius_sq = outer_radius_norm**2

    # Initialize Z with NaNs
    Z = np.full(grid_points_normalized.shape[0], np.nan)

    # Vectorized distance calculation
    from sklearn.metrics import pairwise_distances

    distances_sq = pairwise_distances(
        grid_points_normalized, points_normalized, metric="sqeuclidean"
    )

    # Determine weights based on distances
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

    # Avoid division by zero by setting weights to NaN where total weight is zero
    total_weights = np.sum(weights, axis=1)
    valid = total_weights > 0
    Z[valid] = np.sum(weights[valid] * values, axis=1) / total_weights[valid]

    Z = Z.reshape(X.shape)
    return X, Y, Z


def create_single_smooth_plot(
    combinations,
    triangle_size_bounds,
    saturation_bounds,
    smoothing_method="soft_brush",
    smoothing_params=None,
    ax=None,
):
    df = pd.DataFrame(combinations)
    df["success_float"] = df["success"].astype(float)

    if smoothing_params is None:
        smoothing_params = {}

    if smoothing_method == "soft_brush":
        X_smooth, Y_smooth, Z_smooth = compute_soft_brush_smooth(
            df, triangle_size_bounds, saturation_bounds, smoothing_params
        )
        contour_smooth = ax.contourf(
            X_smooth, Y_smooth, Z_smooth, levels=100, cmap="RdYlGn", alpha=0.9
        )
        ax.scatter(
            df["triangle_size"],
            df["saturation"],
            c=df["success_float"],
            cmap="RdYlGn",
            edgecolor="k",
            alpha=0.5,
        )
        ax.set_xlabel("Triangle Size")
        ax.set_ylabel("Saturation")
        plt.colorbar(contour_smooth, ax=ax, label="Success Rate")
    else:
        raise ValueError(f"Unknown smoothing method: {smoothing_method}")


def compute_error(Z_smooth, Z_model):
    from sklearn.metrics import mean_squared_error

    error = mean_squared_error(Z_model.flatten(), Z_smooth.flatten())
    return error * 100  # 100 to see differences easier


def create_plots(
    combinations,
    triangle_size_bounds,
    saturation_bounds,
    smoothing_method="knn",
    smoothing_params=None,
    rectangles=None,
):
    df = pd.DataFrame(combinations)
    df["success_float"] = df["success"].astype(float)

    if smoothing_params is None:
        smoothing_params = {}

    # Create grid for theoretical model
    grid_x = np.linspace(triangle_size_bounds[0], triangle_size_bounds[1], 100)
    grid_y = np.linspace(saturation_bounds[0], saturation_bounds[1], 100)
    X, Y = np.meshgrid(grid_x, grid_y)

    if smoothing_method == "knn":
        # Compute k-NN smoothing
        X_smooth, Y_smooth, Z_smooth, k = compute_knn_smooth(
            df, triangle_size_bounds, saturation_bounds, k=smoothing_params.get("k")
        )
        smooth_title = f"k-NN Smoothed (k={k})"
    elif smoothing_method == "soft_brush":
        # Compute soft brush smoothing
        X_smooth, Y_smooth, Z_smooth = compute_soft_brush_smooth(
            df, triangle_size_bounds, saturation_bounds, smoothing_params
        )
        smooth_title = "Soft Brush Smoothing"
    else:
        raise ValueError(f"Unknown smoothing method: {smoothing_method}")

    # Compute theoretical model
    Z_model = np.vectorize(
        lambda x, y: ground_truth_probability(
            x, y, (triangle_size_bounds, saturation_bounds)
        )
    )(X, Y)

    # Compute errors for both methods
    X_knn, Y_knn, Z_knn, k = compute_knn_smooth(
        df, triangle_size_bounds, saturation_bounds, k=smoothing_params.get("k")
    )
    error_knn = compute_error(Z_knn, Z_model)

    X_soft, Y_soft, Z_soft = compute_soft_brush_smooth(
        df, triangle_size_bounds, saturation_bounds, smoothing_params
    )
    error_soft = compute_error(Z_soft, Z_model)

    print(f"k-NN Error: {error_knn}")
    print(f"Soft Brush Error: {error_soft}")

    # Create plots based on selected smoothing method
    if smoothing_method == "knn":
        X_smooth, Y_smooth, Z_smooth = X_knn, Y_knn, Z_knn
        smooth_title = f"k-NN Smoothed (k={k})"
    elif smoothing_method == "soft_brush":
        X_smooth, Y_smooth, Z_smooth = X_soft, Y_soft, Z_soft
        smooth_title = "Soft Brush Smoothing"
    else:
        raise ValueError(f"Unknown smoothing method: {smoothing_method}")

    # Create plots
    fig, axs = plt.subplots(1, 3, figsize=(24, 8))

    scatter = plot_raw_scatter(axs[0], df)

    # Add rectangle boundaries using rectangle patches
    if rectangles is not None:
        for rect in rectangles:
            bounds = rect["bounds"]
            x_min, x_max = bounds["triangle_size"]
            y_min, y_max = bounds["saturation"]

            # Create a rectangle patch
            rect_patch = patches.Rectangle(
                (x_min, y_min),  # (x,y) position
                x_max - x_min,  # width
                y_max - y_min,  # height
                linewidth=1,
                edgecolor="blue",
                facecolor="none",
                linestyle="--",
                alpha=0.3,
            )
            axs[0].add_patch(rect_patch)

    contour_smooth = axs[1].contourf(
        X_smooth, Y_smooth, Z_smooth, levels=100, cmap="RdYlGn", alpha=0.9
    )
    axs[1].scatter(
        df["triangle_size"],
        df["saturation"],
        c=df["success_float"],
        cmap="RdYlGn",
        edgecolor="k",
        alpha=0.5,
    )
    axs[1].set_title(smooth_title)
    axs[1].set_xlabel("Triangle Size")
    axs[1].set_ylabel("Saturation")

    contour_model = plot_theoretical(axs[2], X, Y, Z_model)

    # Add colorbars
    plt.colorbar(scatter, ax=axs[0], label="Success")
    plt.colorbar(contour_smooth, ax=axs[1], label="Success Rate")
    plt.colorbar(contour_model, ax=axs[2], label="Success Probability")

    plt.tight_layout()
    plt.show()
