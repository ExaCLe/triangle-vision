import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from scipy.spatial import cKDTree
from ground_truth import ground_truth_probability


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


def create_plots(combinations, triangle_size_bounds, saturation_bounds):
    df = pd.DataFrame(combinations)
    df["success_float"] = df["success"].astype(float)

    # Create grid for theoretical model
    grid_x = np.linspace(triangle_size_bounds[0], triangle_size_bounds[1], 100)
    grid_y = np.linspace(saturation_bounds[0], saturation_bounds[1], 100)
    X, Y = np.meshgrid(grid_x, grid_y)

    # Compute k-NN smoothing
    X_knn, Y_knn, Z_knn, k = compute_knn_smooth(
        df, triangle_size_bounds, saturation_bounds
    )

    # Compute theoretical model
    Z_model = np.vectorize(
        lambda x, y: ground_truth_probability(
            x, y, (triangle_size_bounds, saturation_bounds)
        )
    )(X, Y)

    # Create plots
    fig, axs = plt.subplots(1, 3, figsize=(24, 8))

    scatter = plot_raw_scatter(axs[0], df)
    contour_knn = plot_knn_smooth(axs[1], df, X_knn, Y_knn, Z_knn, k)
    contour_model = plot_theoretical(axs[2], X, Y, Z_model)

    # Add colorbars
    plt.colorbar(scatter, ax=axs[0], label="Success")
    plt.colorbar(contour_knn, ax=axs[1], label="Success Rate")
    plt.colorbar(contour_model, ax=axs[2], label="Success Probability")

    plt.tight_layout()
    plt.show()
