import numpy as np
import matplotlib.pyplot as plt
from algorithm import run_base_algorithm
from plotting import create_single_smooth_plot
import random

# Test parameters
iterations_list = [200, 500, 1000]
inner_radii = [10, 20, 30, 40]
outer_radii = [50, 70]

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


def run_hyperparameter_test():
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


if __name__ == "__main__":
    run_hyperparameter_test()
