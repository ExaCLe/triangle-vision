import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from scipy.spatial import cKDTree
from .ground_truth import ground_truth_probability, get_scaled_radii
import matplotlib.patches as patches  # Ensure this import is present

# Define uniform levels
uniform_levels = np.linspace(0.3, 1.0, 200)


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
        vmin=0.6,
        vmax=1.0,  # Fixed color map limits
        edgecolor="k",
        alpha=0.7,
    )
    ax.set_title("Raw Sampled Points")
    ax.set_xlabel("Triangle Size")
    ax.set_ylabel("Saturation")
    return scatter


def plot_knn_smooth(ax, df, X, Y, Z_knn, k):
    contour_knn = ax.contourf(
        X,
        Y,
        Z_knn,
        levels=uniform_levels,  # Use uniform levels
        cmap="RdYlGn",
        alpha=0.9,
        vmin=0.6,
        vmax=1.0,  # Fixed color map limits
    )
    # Add contour lines at 0.75 and 0.9
    ax.contour(X, Y, Z_knn, levels=[0.75], colors="white", linewidths=2)
    ax.contour(X, Y, Z_knn, levels=[0.9], colors="black", linewidths=2)

    scatter_knn = ax.scatter(
        df["triangle_size"],
        df["saturation"],
        c=df["success_float"],
        cmap="RdYlGn",
        vmin=0.6,
        vmax=1.0,  # Fixed color map limits
        edgecolor="k",
        alpha=0.5,
    )
    ax.set_title(f"k-NN Smoothed (k={k})")
    ax.set_xlabel("Triangle Size")
    ax.set_ylabel("Saturation")
    return contour_knn


def plot_theoretical(ax, X, Y, Z_model):
    contour_model = ax.contourf(
        X,
        Y,
        Z_model,
        levels=uniform_levels,  # Use uniform levels
        cmap="RdYlGn",
        alpha=0.9,
        vmin=0.6,
        vmax=1.0,  # Fixed color map limits
    )
    # Add contour lines at 0.75 and 0.9
    ax.contour(X, Y, Z_model, levels=[0.75], colors="white", linewidths=2)
    ax.contour(X, Y, Z_model, levels=[0.9], colors="black", linewidths=2)

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

    inner_radius, outer_radius = get_scaled_radii(
        (triangle_size_bounds, saturation_bounds)
    )

    # Use the scaled radii instead of fixed values
    inner_radius = params.get("inner_radius", inner_radius)
    outer_radius = params.get("outer_radius", outer_radius)

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
    rectangles=None,  # Add rectangles parameter
):
    df = pd.DataFrame(combinations)
    df["success_float"] = df["success"].astype(float)

    if smoothing_params is None:
        # Get default normalized parameters if none provided
        inner_radius, outer_radius = get_scaled_radii(
            (triangle_size_bounds, saturation_bounds)
        )
        smoothing_params = {"inner_radius": inner_radius, "outer_radius": outer_radius}

    if smoothing_method == "soft_brush":
        X_smooth, Y_smooth, Z_smooth = compute_soft_brush_smooth(
            df, triangle_size_bounds, saturation_bounds, smoothing_params
        )
        contour_smooth = ax.contourf(
            X_smooth,
            Y_smooth,
            Z_smooth,
            levels=uniform_levels,
            cmap="RdYlGn",
            alpha=0.9,
            vmin=0.6,
            vmax=1.0,
        )
        ax.contour(
            X_smooth, Y_smooth, Z_smooth, levels=[0.7], colors="black", linewidths=2
        )

        # Add rectangle visualization if provided
        if rectangles is not None:
            for rect in rectangles:
                bounds = rect["bounds"]
                x_min, x_max = bounds["triangle_size"]
                y_min, y_max = bounds["saturation"]
                rect_patch = patches.Rectangle(
                    (x_min, y_min),
                    x_max - x_min,
                    y_max - y_min,
                    linewidth=1,
                    edgecolor="blue",
                    facecolor="none",
                    linestyle="--",
                    alpha=0.5,
                )
                ax.add_patch(rect_patch)

        ax.scatter(
            df["triangle_size"],
            df["saturation"],
            c=df["success_float"],
            cmap="RdYlGn",
            vmin=0.6,
            vmax=1.0,  # Fixed color map limits
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
    ax_raw=None,
    ax_smooth=None,
    ax_model=None,
    ground_truth_func=ground_truth_probability,
    model_name="",
):
    df = pd.DataFrame(combinations)
    df["success_float"] = df["success"].astype(float)

    if smoothing_params is None and smoothing_method == "soft_brush":
        # Get default normalized parameters if none provided
        inner_radius, outer_radius = get_scaled_radii(
            (triangle_size_bounds, saturation_bounds)
        )
        smoothing_params = {"inner_radius": inner_radius, "outer_radius": outer_radius}

    # Create grid for theoretical model
    grid_x = np.linspace(triangle_size_bounds[0], triangle_size_bounds[1], 100)
    grid_y = np.linspace(saturation_bounds[0], saturation_bounds[1], 100)
    X, Y = np.meshgrid(grid_x, grid_y)

    # Compute theoretical model using the provided function
    Z_model = np.vectorize(
        lambda x, y: ground_truth_func(x, y, (triangle_size_bounds, saturation_bounds))
    )(X, Y)

    # Compute smoothing
    if smoothing_method == "knn":
        X_smooth, Y_smooth, Z_smooth, k = compute_knn_smooth(
            df, triangle_size_bounds, saturation_bounds, k=smoothing_params.get("k")
        )
        smooth_title = f"k-NN Smoothed (k={k})"
    elif smoothing_method == "soft_brush":
        X_smooth, Y_smooth, Z_smooth = compute_soft_brush_smooth(
            df, triangle_size_bounds, saturation_bounds, smoothing_params
        )
        smooth_title = "Soft Brush Smoothing"
    else:
        raise ValueError(f"Unknown smoothing method: {smoothing_method}")

    # Compute error
    error = compute_error(Z_smooth, Z_model)
    print(f"{model_name} - Smoothing Error: {error}")

    # Plot raw scatter
    scatter = plot_raw_scatter(ax_raw, df)
    ax_raw.set_title(f"Raw Sampled Points ({model_name})")

    # Add rectangle boundaries if provided
    if rectangles is not None:
        for rect in rectangles:
            bounds = rect["bounds"]
            x_min, x_max = bounds["triangle_size"]
            y_min, y_max = bounds["saturation"]
            rect_patch = patches.Rectangle(
                (x_min, y_min),
                x_max - x_min,
                y_max - y_min,
                linewidth=1,
                edgecolor="blue",
                facecolor="none",
                linestyle="--",
                alpha=0.3,
            )
            ax_raw.add_patch(rect_patch)

    # Plot smoothed data
    contour_smooth = ax_smooth.contourf(
        X_smooth,
        Y_smooth,
        Z_smooth,
        levels=uniform_levels,  # Use uniform levels
        cmap="RdYlGn",
        alpha=0.9,
        vmin=0.6,
        vmax=1.0,  # Fixed color map limits
    )
    # Add contour lines at 0.75 and 0.9
    ax_smooth.contour(
        X_smooth, Y_smooth, Z_smooth, levels=[0.75], colors="white", linewidths=2
    )
    ax_smooth.contour(
        X_smooth, Y_smooth, Z_smooth, levels=[0.9], colors="black", linewidths=2
    )
    ax_smooth.scatter(
        df["triangle_size"],
        df["saturation"],
        c=df["success_float"],
        cmap="RdYlGn",
        vmin=0.6,
        vmax=1.0,  # Fixed color map limits
        edgecolor="k",
        alpha=0.5,
    )
    ax_smooth.set_title(f"{smooth_title} ({model_name})")
    ax_smooth.set_xlabel("Triangle Size")
    ax_smooth.set_ylabel("Saturation")
    plt.colorbar(contour_smooth, ax=ax_smooth, label="Success Rate")

    # Plot theoretical model
    contour_model = plot_theoretical(ax_model, X, Y, Z_model)
    ax_model.set_title(f"Theoretical Success Probability ({model_name})")
    ax_model.set_xlabel("Triangle Size")
    ax_model.set_ylabel("Saturation")
    plt.colorbar(contour_model, ax=ax_model, label="Success Probability")

    # Add colorbar to raw scatter plot
    plt.colorbar(scatter, ax=ax_raw, label="Success")
