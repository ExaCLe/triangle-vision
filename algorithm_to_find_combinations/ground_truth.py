import random
import math


def model_probability(ts, sat, base, coefficient, exponent, size_scale, sat_scale):
    """Compute success probability using absolute per-axis scaling.

    P = base + coefficient * (((ts / size_scale)^2 + (sat / sat_scale)^2) / 2)^exponent

    Parameters are absolute — the result does not depend on any viewing bounds.
    * size_scale: triangle size at which the size contribution reaches 1.0
    * sat_scale:  saturation   at which the sat  contribution reaches 1.0
    """
    ts_norm = ts / size_scale if size_scale else 0
    sat_norm = sat / sat_scale if sat_scale else 0
    raw = (ts_norm ** 2 + sat_norm ** 2) / 2.0
    return min(1.0, max(0.0, base + coefficient * math.pow(raw, exponent)))


def _model_description(base, coefficient, exponent, size_scale, sat_scale):
    """Build a human-readable formula string."""
    return (
        f"{base} + {coefficient} * "
        f"(((ts/{size_scale})² + (sat/{sat_scale})²) / 2)^{exponent}"
    )


# Legacy wrappers — kept so algorithm.py / main.py still import by name.
# They now use absolute scaling with sensible defaults.
def ground_truth_probability(triangle_size, saturation, bounds=None):
    """Default model (base 0.6). *bounds* is accepted but ignored."""
    return model_probability(triangle_size, saturation, 0.6, 0.39, 0.5, 400.0, 1.0)


def ground_truth_probability_model2(triangle_size, saturation, bounds=None):
    """Model 2 (base 0.5). *bounds* is accepted but ignored."""
    return model_probability(triangle_size, saturation, 0.5, 0.39, 0.5, 400.0, 1.0)


def test_combination(triangle_size, saturation, bounds=None):
    """Test if a combination succeeds based on default model."""
    p = ground_truth_probability(triangle_size, saturation)
    return random.random() < p


def test_combination_model2(triangle_size, saturation, bounds=None):
    """Test if a combination succeeds based on model 2."""
    p = ground_truth_probability_model2(triangle_size, saturation)
    return random.random() < p


def normalize_radius(radius, original_bounds=(50, 300)):
    """Normalize radius value relative to original bounds"""
    return radius / (original_bounds[1] - original_bounds[0])


def scale_radius(normalized_radius, current_bounds):
    """Scale normalized radius to current bounds"""
    return normalized_radius * (current_bounds[1] - current_bounds[0])


# Constants for normalized radius values
NORMALIZED_INNER_RADIUS = normalize_radius(9.8)  # ~ 0.0392
NORMALIZED_OUTER_RADIUS = normalize_radius(96.7)  # ~ 0.3868


def get_scaled_radii(bounds):
    """Get scaled inner and outer radius values for current bounds"""
    inner_radius = scale_radius(NORMALIZED_INNER_RADIUS, bounds[0])
    outer_radius = scale_radius(NORMALIZED_OUTER_RADIUS, bounds[0])
    return inner_radius, outer_radius


# ---------------------------------------------------------------------------
# Model registry – each entry stores the parameters for model_probability().
# No separate probability functions needed; all models share the same formula.
# ---------------------------------------------------------------------------
SIMULATION_MODELS = {
    "default": {
        "label": "Default (base 0.6)",
        "base": 0.6,
        "coefficient": 0.39,
        "exponent": 0.5,
        "size_scale": 400.0,
        "sat_scale": 1.0,
    },
    "model2": {
        "label": "Model 2 (base 0.5)",
        "base": 0.5,
        "coefficient": 0.39,
        "exponent": 0.5,
        "size_scale": 400.0,
        "sat_scale": 1.0,
    },
}

# Add computed descriptions
for _name, _entry in SIMULATION_MODELS.items():
    _entry["description"] = _model_description(
        _entry["base"], _entry["coefficient"], _entry["exponent"],
        _entry["size_scale"], _entry["sat_scale"],
    )


def simulate_trial(model_name, triangle_size, saturation):
    """Sample a boolean success using the named model (no bounds needed)."""
    entry = SIMULATION_MODELS.get(model_name)
    if entry is None:
        raise ValueError(f"Unknown simulation model: {model_name}")
    probability = model_probability(
        triangle_size, saturation,
        entry["base"], entry["coefficient"], entry["exponent"],
        entry["size_scale"], entry["sat_scale"],
    )
    return random.random() < probability
