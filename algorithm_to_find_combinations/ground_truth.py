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


def test_combination(triangle_size, saturation, orientation, bounds):
    """Test if a combination succeeds based on ground truth probability"""
    success_probability = ground_truth_probability(triangle_size, saturation, bounds)
    return random.random() < success_probability
