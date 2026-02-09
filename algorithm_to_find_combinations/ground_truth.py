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


# ---------------------------------------------------------------------------
# Bandpass (sigmoid-window) model
# ---------------------------------------------------------------------------

def _sigmoid(x):
    """Numerically safe sigmoid."""
    x = max(-500.0, min(500.0, x))
    return 1.0 / (1.0 + math.exp(-x))


def bandpass_probability(
    ts, sat,
    ts_low, ts_w_low, ts_high, ts_w_high,
    sat_low, sat_w_low, sat_high, sat_w_high,
    gamma, eps_clip,
):
    """Bandpass (sigmoid-window) probability model.

    P = 0.25 + 0.75 * W
    W = clip(((W_ts * W_sat)^gamma - eps) / (1 - eps), 0, 1)
    W_x = sig((x - low) / w_low) * sig((high - x) / w_high)
    """
    w_ts = _sigmoid((ts - ts_low) / ts_w_low) * _sigmoid((ts_high - ts) / ts_w_high)
    w_sat = _sigmoid((sat - sat_low) / sat_w_low) * _sigmoid((sat_high - sat) / sat_w_high)
    product = math.pow(max(0.0, w_ts * w_sat), gamma)
    denom = 1.0 - eps_clip
    w = max(0.0, min(1.0, (product - eps_clip) / denom if denom > 1e-12 else 0.0))
    return 0.25 + 0.75 * w


def _bandpass_description(
    ts_low, ts_w_low, ts_high, ts_w_high,
    sat_low, sat_w_low, sat_high, sat_w_high,
    gamma, eps_clip,
):
    """Human-readable description for the bandpass model."""
    return (
        f"0.25 + 0.75 * W,  W = clip(((W_ts·W_sat)^{gamma} - {eps_clip}) / (1 - {eps_clip}), 0, 1),  "
        f"W_ts = σ((ts-{ts_low})/{ts_w_low})·σ(({ts_high}-ts)/{ts_w_high}),  "
        f"W_sat = σ((sat-{sat_low})/{sat_w_low})·σ(({sat_high}-sat)/{sat_w_high})"
    )


# ---------------------------------------------------------------------------
# Contrast-threshold model
# ---------------------------------------------------------------------------

def threshold_probability(
    ts, sat,
    c_inf, c_0, ts_50, beta, k,
):
    """Contrast-threshold probability model.

    C_t(ts) = c_inf + (c_0 - c_inf) / (1 + (ts / ts_50)^beta)
    P = 0.25 + 0.75 * (1 - exp(-k * max(0, ln(sat / C_t(ts)))))

    Size sets the required saturation threshold; performance rises only
    when saturation exceeds that threshold.
    """
    c_t = c_inf + (c_0 - c_inf) / (1.0 + math.pow(max(1e-12, ts / ts_50), beta))
    ratio = sat / max(1e-12, c_t)
    log_ratio = math.log(max(1e-12, ratio))
    above = max(0.0, log_ratio)
    return 0.25 + 0.75 * (1.0 - math.exp(-k * above))


def _threshold_description(c_inf, c_0, ts_50, beta, k):
    """Human-readable description for the contrast-threshold model."""
    return (
        f"0.25 + 0.75 * (1 - exp(-{k} * max(0, ln(sat / C_t(ts))))),  "
        f"C_t(ts) = {c_inf} + ({c_0} - {c_inf}) / (1 + (ts/{ts_50})^{beta})"
    )


# ---------------------------------------------------------------------------
# Dispatchers — route to the correct formula based on model_type
# ---------------------------------------------------------------------------

def compute_probability(model_dict, ts, sat):
    """Compute probability for any model type."""
    model_type = model_dict.get("model_type", "polynomial")
    if model_type == "bandpass":
        return bandpass_probability(
            ts, sat,
            model_dict["ts_low"], model_dict["ts_w_low"],
            model_dict["ts_high"], model_dict["ts_w_high"],
            model_dict["sat_low"], model_dict["sat_w_low"],
            model_dict["sat_high"], model_dict["sat_w_high"],
            model_dict["gamma"], model_dict["eps_clip"],
        )
    if model_type == "threshold":
        return threshold_probability(
            ts, sat,
            model_dict["c_inf"], model_dict["c_0"],
            model_dict["ts_50"], model_dict["beta"],
            model_dict["k"],
        )
    # Default: polynomial
    return model_probability(
        ts, sat,
        model_dict["base"], model_dict["coefficient"], model_dict["exponent"],
        model_dict["size_scale"], model_dict["sat_scale"],
    )


def compute_description(model_dict):
    """Build a human-readable formula string for any model type."""
    model_type = model_dict.get("model_type", "polynomial")
    if model_type == "bandpass":
        return _bandpass_description(
            model_dict["ts_low"], model_dict["ts_w_low"],
            model_dict["ts_high"], model_dict["ts_w_high"],
            model_dict["sat_low"], model_dict["sat_w_low"],
            model_dict["sat_high"], model_dict["sat_w_high"],
            model_dict["gamma"], model_dict["eps_clip"],
        )
    if model_type == "threshold":
        return _threshold_description(
            model_dict["c_inf"], model_dict["c_0"],
            model_dict["ts_50"], model_dict["beta"],
            model_dict["k"],
        )
    return _model_description(
        model_dict["base"], model_dict["coefficient"], model_dict["exponent"],
        model_dict["size_scale"], model_dict["sat_scale"],
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
        "model_type": "polynomial",
        "base": 0.6,
        "coefficient": 0.39,
        "exponent": 0.5,
        "size_scale": 400.0,
        "sat_scale": 1.0,
    },
    "model2": {
        "label": "Model 2 (base 0.5)",
        "model_type": "polynomial",
        "base": 0.5,
        "coefficient": 0.39,
        "exponent": 0.5,
        "size_scale": 400.0,
        "sat_scale": 1.0,
    },
    "bandpass_default": {
        "label": "Bandpass Default",
        "model_type": "bandpass",
        "ts_low": 50.0,
        "ts_w_low": 15.0,
        "ts_high": 300.0,
        "ts_w_high": 15.0,
        "sat_low": 0.2,
        "sat_w_low": 0.05,
        "sat_high": 0.8,
        "sat_w_high": 0.05,
        "gamma": 1.0,
        "eps_clip": 0.01,
    },
    "threshold_default": {
        "label": "Contrast Threshold",
        "model_type": "threshold",
        "c_inf": 0.12,
        "c_0": 0.95,
        "ts_50": 60.0,
        "beta": 2.0,
        "k": 3.0,
    },
}

# Add computed descriptions
for _name, _entry in SIMULATION_MODELS.items():
    _entry["description"] = compute_description(_entry)


def simulate_trial(model_name, triangle_size, saturation):
    """Sample a boolean success using the named model (no bounds needed)."""
    entry = SIMULATION_MODELS.get(model_name)
    if entry is None:
        raise ValueError(f"Unknown simulation model: {model_name}")
    probability = compute_probability(entry, triangle_size, saturation)
    return random.random() < probability
