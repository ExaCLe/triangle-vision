import numpy as np
from algorithm import run_base_algorithm
from plotting import create_plots
import random
from ground_truth import (
    ground_truth_probability,
    ground_truth_probability_model2,
    test_combination,
    test_combination_model2,
)
import matplotlib.pyplot as plt

# Initialize bounds
triangle_size_bounds = (50, 300)
saturation_bounds = (0.5, 1.0)

# Fixed values for other parameters
hue = 0
value = 1.0
orientations = ["N", "S", "E", "W"]

# set seed for reproducibility
random.seed(0)
np.random.seed(0)


def main():
    iterations = 1000
    # Run algorithm
    combinations1, rectangles1 = run_base_algorithm(
        triangle_size_bounds,
        saturation_bounds,
        orientations,
        iterations=iterations,
        test_combination=test_combination,
    )

    # Run algorithm for second model
    combinations2, rectangles2 = run_base_algorithm(
        triangle_size_bounds,
        saturation_bounds,
        orientations,
        iterations=iterations,
        test_combination=test_combination_model2,
    )

    # Define smoothing method and parameters
    smoothing_method = "soft_brush"  # Options: 'knn', 'soft_brush'
    smoothing_params = {
        "inner_radius": 9.8,
        "outer_radius": 96.7,
        "k": 200,
    }

    # Create figure with 2 rows and 3 columns
    fig, axs = plt.subplots(2, 3, figsize=(24, 12))

    # First theoretical model
    create_plots(
        combinations1,
        triangle_size_bounds,
        saturation_bounds,
        smoothing_method=smoothing_method,
        smoothing_params=smoothing_params,
        rectangles=rectangles1,
        ax_raw=axs[0, 0],
        ax_smooth=axs[0, 1],
        ax_model=axs[0, 2],
        ground_truth_func=ground_truth_probability,
        model_name="Model 1",
    )

    # Second theoretical model
    create_plots(
        combinations2,
        triangle_size_bounds,
        saturation_bounds,
        smoothing_method=smoothing_method,
        smoothing_params=smoothing_params,
        rectangles=rectangles2,
        ax_raw=axs[1, 0],
        ax_smooth=axs[1, 1],
        ax_model=axs[1, 2],
        ground_truth_func=ground_truth_probability_model2,
        model_name="Model 2",
    )

    plt.tight_layout()
    plt.show()


def main2():
    iterations = 1000

    # Run algorithm with different sampling strategies
    # set seed for reproducibility
    random.seed(0)
    np.random.seed(0)
    combinations1, rectangles1 = run_base_algorithm(
        triangle_size_bounds,
        saturation_bounds,
        orientations,
        iterations=iterations,
        test_combination=test_combination,
        get_next_combination_strategy="rectangles",  # Original strategy
    )

    # set seed for reproducibility
    random.seed(0)
    np.random.seed(0)
    combinations2, rectangles2 = run_base_algorithm(
        triangle_size_bounds,
        saturation_bounds,
        orientations,
        iterations=iterations,
        test_combination=test_combination,  # Same test combination
        get_next_combination_strategy="rectangles",  # New strategy
    )

    # Define smoothing method and parameters
    smoothing_method = "soft_brush"
    smoothing_params = {
        "inner_radius": 9.8,
        "outer_radius": 96.7,
        "k": 200,
    }

    # Create figure with 2 rows and 3 columns
    fig, axs = plt.subplots(2, 3, figsize=(24, 12))

    # Original sampling strategy
    create_plots(
        combinations1,
        triangle_size_bounds,
        saturation_bounds,
        smoothing_method=smoothing_method,
        smoothing_params=smoothing_params,
        rectangles=rectangles1,
        ax_raw=axs[0, 0],
        ax_smooth=axs[0, 1],
        ax_model=axs[0, 2],
        ground_truth_func=ground_truth_probability,
        model_name="Original Strategy",
    )

    # Confidence bounds strategy
    create_plots(
        combinations2,
        triangle_size_bounds,
        saturation_bounds,
        smoothing_method=smoothing_method,
        smoothing_params=smoothing_params,
        rectangles=rectangles2,
        ax_raw=axs[1, 0],
        ax_smooth=axs[1, 1],
        ax_model=axs[1, 2],
        ground_truth_func=ground_truth_probability,
        model_name="Confidence Bounds",
    )

    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    main2()  # Call main2 instead of main
