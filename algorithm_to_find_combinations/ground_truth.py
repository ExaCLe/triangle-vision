import random
import math


def scaled_values(triangle_size, saturation, bounds):
    """Scale values to [0,1] range"""
    ts_scaled = (triangle_size - bounds[0][0]) / (bounds[0][1] - bounds[0][0])
    sat_scaled = (saturation - bounds[1][0]) / (bounds[1][1] - bounds[1][0])
    return ts_scaled, sat_scaled


def ground_truth_probability(triangle_size, saturation, bounds):
    """Calculate the theoretical success probability"""
    ts_scaled, sat_scaled = scaled_values(triangle_size, saturation, bounds)
    return 0.6 + 0.39 * math.sqrt((ts_scaled**2 + sat_scaled**2) / 2.0)


def ground_truth_probability_model2(triangle_size, saturation, bounds):
    # Tweaked version of the ground truth model
    ts_scaled, sat_scaled = scaled_values(triangle_size, saturation, bounds)
    return 0.5 + 0.39 * math.sqrt((ts_scaled**2 + sat_scaled**2) / 2.0)


def test_combination(triangle_size, saturation, bounds):
    """Test if a combination succeeds based on ground truth probability"""
    success_probability = ground_truth_probability(triangle_size, saturation, bounds)
    return random.random() < success_probability


def test_combination_model2(triangle_size, saturation, bounds):
    """Test if a combination succeeds based on ground truth probability"""
    success_probability = ground_truth_probability_model2(
        triangle_size, saturation, bounds
    )
    return random.random() < success_probability


def normalize_radius(radius, original_bounds=(50, 300)):
    """Normalize radius value relative to original bounds"""
    return radius / (original_bounds[1] - original_bounds[0])


def scale_radius(normalized_radius, current_bounds):
    """Scale normalized radius to current bounds"""
    return normalized_radius * (current_bounds[1] - current_bounds[0])


# Constants for normalized radius values
NORMALIZED_INNER_RADIUS = normalize_radius(9.8)  # ≈ 0.0392
NORMALIZED_OUTER_RADIUS = normalize_radius(96.7)  # ≈ 0.3868


def get_scaled_radii(bounds):
    """Get scaled inner and outer radius values for current bounds"""
    inner_radius = scale_radius(NORMALIZED_INNER_RADIUS, bounds[0])
    outer_radius = scale_radius(NORMALIZED_OUTER_RADIUS, bounds[0])
    return inner_radius, outer_radius
