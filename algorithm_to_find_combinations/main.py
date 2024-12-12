import numpy as np
from algorithm import run_base_algorithm, test_combination
from plotting import create_plots
import random

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
    # Run algorithm
    combinations = run_base_algorithm(
        triangle_size_bounds, saturation_bounds, orientations, iterations=1000
    )

    # Define smoothing method and parameters
    smoothing_method = "soft_brush"  # Options: 'knn', 'soft_brush'
    smoothing_params = {
        "inner_radius": 5,
        "outer_radius": 60,
        "k": 100,
    }

    # Create plots
    create_plots(
        combinations,
        triangle_size_bounds,
        saturation_bounds,
        smoothing_method=smoothing_method,
        smoothing_params=smoothing_params,
    )


if __name__ == "__main__":
    main()
