import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
from algorithm import run_base_algorithm
from plotting import (
    create_single_smooth_plot,
    compute_knn_smooth,
    compute_soft_brush_smooth,
    compute_error,
    ground_truth_probability,
)
from tqdm import tqdm
import random
from math import ceil
from itertools import product

# Test parameters for visual testing
iterations_list = [200, 500, 1000]
inner_radii = [10, 20, 30, 40]
outer_radii = [50, 70]

# Parameters for random search
n_random_trials = 300
knn_k_range = (5, 200)
soft_brush_inner_range = (5, 50)
soft_brush_outer_range = (30, 100)

# Bounds (same as in main.py)
triangle_size_bounds = (50, 300)
saturation_bounds = (0.5, 1.0)
orientations = ["N", "S", "E", "W"]


def plot_single_smooth(combinations, params, ax, title):
    create_single_smooth_plot(
        combinations,
        triangle_size_bounds,
        saturation_bounds,
        smoothing_method="soft_brush",
        smoothing_params=params,
        ax=ax,
    )
    ax.set_title(title)


def run_hyperparameter_test_visual():
    for iterations in iterations_list:
        # Set seeds for reproducibility
        random.seed(0)
        np.random.seed(0)

        # Run algorithm once for this iteration count
        combinations = run_base_algorithm(
            triangle_size_bounds, saturation_bounds, orientations, iterations
        )

        # Create plots for each inner radius
        for outer_r in outer_radii:
            fig, axs = plt.subplots(1, 4, figsize=(20, 5))
            fig.suptitle(f"Iterations: {iterations}, Inner Radius: {outer_r}")

            for idx, inner_r in enumerate(inner_radii):
                params = {"inner_radius": inner_r, "outer_radius": outer_r}
                plot_single_smooth(
                    combinations, params, axs[idx], f"Outer Radius: {inner_r}"
                )

            plt.tight_layout()
            plt.show()


def random_hyperparameter_search(combinations):
    # Create theoretical model for error computation
    grid_x = np.linspace(triangle_size_bounds[0], triangle_size_bounds[1], 100)
    grid_y = np.linspace(saturation_bounds[0], saturation_bounds[1], 100)
    X, Y = np.meshgrid(grid_x, grid_y)
    Z_model = np.vectorize(
        lambda x, y: ground_truth_probability(
            x, y, (triangle_size_bounds, saturation_bounds)
        )
    )(X, Y)

    # Initialize best results
    best_knn = {"error": float("inf"), "params": None, "result": None}
    best_soft = {"error": float("inf"), "params": None, "result": None}

    print("Running random hyperparameter search...")
    for _ in tqdm(range(n_random_trials)):
        # Random KNN
        k = random.randint(knn_k_range[0], knn_k_range[1])
        X_knn, Y_knn, Z_knn, _ = compute_knn_smooth(
            combinations, triangle_size_bounds, saturation_bounds, k=k
        )
        error_knn = compute_error(Z_knn, Z_model)

        if error_knn < best_knn["error"]:
            best_knn = {
                "error": error_knn,
                "params": {"k": k},
                "result": (X_knn, Y_knn, Z_knn),
            }

        # Random Soft Brush
        inner_r = random.uniform(soft_brush_inner_range[0], soft_brush_inner_range[1])
        outer_r = random.uniform(
            max(inner_r + 10, soft_brush_outer_range[0]), soft_brush_outer_range[1]
        )
        params = {"inner_radius": inner_r, "outer_radius": outer_r}

        X_soft, Y_soft, Z_soft = compute_soft_brush_smooth(
            combinations, triangle_size_bounds, saturation_bounds, params
        )
        error_soft = compute_error(Z_soft, Z_model)

        if error_soft < best_soft["error"]:
            best_soft = {
                "error": error_soft,
                "params": params,
                "result": (X_soft, Y_soft, Z_soft),
            }

    return best_knn, best_soft


def plot_best_results(combinations, best_knn, best_soft):
    fig, axs = plt.subplots(1, 2, figsize=(15, 6))

    # Plot KNN
    X, Y, Z = best_knn["result"]
    contour_knn = axs[0].contourf(X, Y, Z, levels=100, cmap="RdYlGn", alpha=0.9)
    axs[0].scatter(
        combinations["triangle_size"],
        combinations["saturation"],
        c=combinations["success_float"],
        cmap="RdYlGn",
        edgecolor="k",
        alpha=0.5,
    )
    axs[0].set_title(
        f'Best KNN (k={best_knn["params"]["k"]})\nError: {best_knn["error"]:.4f}'
    )
    plt.colorbar(contour_knn, ax=axs[0])

    # Plot Soft Brush
    X, Y, Z = best_soft["result"]
    contour_soft = axs[1].contourf(X, Y, Z, levels=100, cmap="RdYlGn", alpha=0.9)
    axs[1].scatter(
        combinations["triangle_size"],
        combinations["saturation"],
        c=combinations["success_float"],
        cmap="RdYlGn",
        edgecolor="k",
        alpha=0.5,
    )
    axs[1].set_title(
        f'Best Soft Brush (inner={best_soft["params"]["inner_radius"]:.1f}, outer={best_soft["params"]["outer_radius"]:.1f})\nError: {best_soft["error"]:.4f}'
    )
    plt.colorbar(contour_soft, ax=axs[1])

    plt.tight_layout()
    plt.show()


def run_hyperparameter_test_computational():
    # Set seeds for reproducibility
    random.seed(0)
    np.random.seed(0)

    # Run algorithm once
    combinations, _ = run_base_algorithm(
        triangle_size_bounds, saturation_bounds, orientations, iterations=1000
    )
    df = pd.DataFrame(combinations)
    df["success_float"] = df["success"].astype(float)

    # Run random search
    best_knn, best_soft = random_hyperparameter_search(df)

    # Plot best results
    plot_best_results(df, best_knn, best_soft)

    # Print best parameters
    print("\nBest parameters found:")
    print(f"KNN - k: {best_knn['params']['k']}, Error: {best_knn['error']:.4f}")
    print(
        f"Soft Brush - inner_radius: {best_soft['params']['inner_radius']:.1f}, "
        f"outer_radius: {best_soft['params']['outer_radius']:.1f}, Error: {best_soft['error']:.4f}"
    )


def calculate_grid_layout(n_plots):
    """Calculate optimal grid layout with maximum 3 columns."""
    cols = min(3, n_plots)
    rows = ceil(n_plots / cols)
    return rows, cols


def test_specific_parameters(parameter_combinations):
    """
    Test specific parameter combinations and plot results.

    Example parameter_combinations:
    [
        {
            'name': 'Conservative',
            'success_rate': 0.9,
            'total_samples': 5,
            'inner_radius': 10,
            'outer_radius': 50,
            'iterations': 200
        },
        {
            'name': 'Aggressive',
            'success_rate': 0.8,
            'total_samples': 10,
            'inner_radius': 20,
            'outer_radius': 70,
            'iterations': 500
        }
    ]
    """
    n_combinations = len(parameter_combinations)
    rows, cols = calculate_grid_layout(n_combinations)

    fig, axs = plt.subplots(rows, cols, figsize=(6 * cols, 6 * rows))
    if rows == 1 and cols == 1:
        axs = np.array([[axs]])
    elif rows == 1 or cols == 1:
        axs = axs.reshape(rows, cols)

    print("Testing specific parameter combinations...")
    for idx, params in enumerate(tqdm(parameter_combinations)):
        row = idx // cols
        col = idx % cols

        np.random.seed(0)
        random.seed(0)
        # Run algorithm with current parameters
        combinations, _ = run_base_algorithm(
            triangle_size_bounds,
            saturation_bounds,
            orientations,
            iterations=params.get("iterations", 1000),
            success_rate_threshold=params.get("success_rate", 0.9),
            total_samples_threshold=params.get("total_samples", 5),
        )

        # Create smooth plot
        smooth_params = {
            "inner_radius": params.get("inner_radius", 15),
            "outer_radius": params.get("outer_radius", 30),
        }

        create_single_smooth_plot(
            combinations,
            triangle_size_bounds,
            saturation_bounds,
            smoothing_method="soft_brush",
            smoothing_params=smooth_params,
            ax=axs[row, col],
        )

        # Set title with parameter information and name
        title = (
            f"{params.get('name', f'Combination {idx+1}')}\n"
            + f"success_rate: {params['success_rate']}\n"
            + f"total_samples: {params['total_samples']}\n"
            + f"inner_radius: {params['inner_radius']}\n"
            + f"outer_radius: {params['outer_radius']}\n"
            + f"iterations: {params['iterations']}"
        )
        axs[row, col].set_title(title, fontsize=8)

    # Remove empty subplots if any
    for idx in range(n_combinations, rows * cols):
        row = idx // cols
        col = idx % cols
        fig.delaxes(axs[row, col])

    plt.tight_layout()
    plt.show()


def main():
    # Define specific parameter combinations to test
    parameter_combinations = [
        {
            "name": "Conservative",
            "success_rate": 0.9,
            "total_samples": 5,
            "inner_radius": 10,
            "outer_radius": 90,
            "iterations": 200,
        },
        {
            "name": "Conservative",
            "success_rate": 0.85,
            "total_samples": 5,
            "inner_radius": 10,
            "outer_radius": 90,
            "iterations": 200,
        },
        {
            "name": "Conservative",
            "success_rate": 0.9,
            "total_samples": 5,
            "inner_radius": 10,
            "outer_radius": 90,
            "iterations": 100,
        },
        {
            "name": "Moderate",
            "success_rate": 0.9,
            "total_samples": 5,
            "inner_radius": 10,
            "outer_radius": 90,
            "iterations": 350,
        },
        {
            "name": "Moderate",
            "success_rate": 0.85,
            "total_samples": 5,
            "inner_radius": 10,
            "outer_radius": 90,
            "iterations": 350,
        },
        {
            "name": "Moderate",
            "success_rate": 0.85,
            "total_samples": 5,
            "inner_radius": 10,
            "outer_radius": 90,
            "iterations": 100,
        },
    ]

    test_specific_parameters(parameter_combinations)


if __name__ == "__main__":
    main()
    # run_hyperparameter_test_visual()
