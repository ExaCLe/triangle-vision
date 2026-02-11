import math
from dataclasses import dataclass
from typing import Dict, Iterable, List, Literal, Optional, Tuple

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

AxisName = Literal["size", "saturation"]
MethodName = Literal["axis_logistic", "axis_isotonic"]
SwitchPolicy = Literal["uncertainty", "alternate"]


@dataclass
class AxisBounds:
    size_min: float
    size_max: float
    saturation_min: float
    saturation_max: float


def _value_eps(lower: float, upper: float) -> float:
    return max(1e-6, (upper - lower) * 1e-4)


def _make_grid(lower: float, upper: float, points: int = 121) -> np.ndarray:
    if points < 3:
        points = 3
    return np.linspace(lower, upper, points)


def _normalize(values: np.ndarray, lower: float, upper: float) -> np.ndarray:
    den = max(upper - lower, 1e-9)
    return (values - lower) / den


def _fit_logistic(
    x: np.ndarray,
    y: np.ndarray,
    grid: np.ndarray,
    lower: float,
    upper: float,
) -> np.ndarray:
    if len(x) < 3:
        return np.full_like(grid, 0.5, dtype=float)

    unique = np.unique(y)
    if unique.size < 2:
        # No class separation yet; use Laplace-smoothed empirical mean.
        p = float((np.sum(y) + 1.0) / (len(y) + 2.0))
        return np.full_like(grid, p, dtype=float)

    x_train = _normalize(x, lower, upper).reshape(-1, 1)
    x_pred = _normalize(grid, lower, upper).reshape(-1, 1)
    model = LogisticRegression(solver="lbfgs")
    model.fit(x_train, y)
    pred = model.predict_proba(x_pred)[:, 1]
    # Keep monotonic non-decreasing along the axis.
    return np.maximum.accumulate(pred)


def _fit_isotonic(
    x: np.ndarray,
    y: np.ndarray,
    grid: np.ndarray,
) -> np.ndarray:
    if len(x) < 2:
        return np.full_like(grid, 0.5, dtype=float)
    model = IsotonicRegression(y_min=0.0, y_max=1.0, increasing=True, out_of_bounds="clip")
    model.fit(x, y)
    pred = model.predict(grid)
    return np.maximum.accumulate(pred)


def _bootstrap_curve(
    method: MethodName,
    x: np.ndarray,
    y: np.ndarray,
    grid: np.ndarray,
    lower: float,
    upper: float,
    *,
    bootstrap_rounds: int = 64,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    if len(x) == 0:
        base = np.full_like(grid, 0.5, dtype=float)
        return base, np.full_like(grid, 0.25, dtype=float), np.full_like(grid, 0.75, dtype=float)

    if method == "axis_logistic":
        base = _fit_logistic(x, y, grid, lower, upper)
    else:
        base = _fit_isotonic(x, y, grid)

    if len(x) < 4:
        spread = np.full_like(grid, 0.2, dtype=float)
        lo = np.clip(base - spread, 0.0, 1.0)
        hi = np.clip(base + spread, 0.0, 1.0)
        return base, lo, hi

    rng = np.random.default_rng(seed=len(x) * 7919 + int(np.sum(y)) * 104729)
    curves = []
    for _ in range(bootstrap_rounds):
        idx = rng.integers(0, len(x), len(x))
        bx = x[idx]
        by = y[idx]
        try:
            if method == "axis_logistic":
                pred = _fit_logistic(bx, by, grid, lower, upper)
            else:
                pred = _fit_isotonic(bx, by, grid)
            curves.append(pred)
        except Exception:
            continue

    if not curves:
        spread = np.full_like(grid, 0.2, dtype=float)
        lo = np.clip(base - spread, 0.0, 1.0)
        hi = np.clip(base + spread, 0.0, 1.0)
        return base, lo, hi

    matrix = np.vstack(curves)
    lo = np.quantile(matrix, 0.1, axis=0)
    hi = np.quantile(matrix, 0.9, axis=0)
    return base, lo, hi


def _threshold_for_probability(
    grid: np.ndarray,
    probs: np.ndarray,
    target_probability: float,
) -> Optional[float]:
    if probs.size == 0:
        return None
    if target_probability <= probs[0]:
        return float(grid[0])
    if target_probability > probs[-1]:
        return None

    idx = int(np.searchsorted(probs, target_probability, side="left"))
    if idx <= 0:
        return float(grid[0])
    if idx >= len(grid):
        return float(grid[-1])

    x1, x2 = float(grid[idx - 1]), float(grid[idx])
    y1, y2 = float(probs[idx - 1]), float(probs[idx])
    if abs(y2 - y1) < 1e-9:
        return x2
    ratio = (target_probability - y1) / (y2 - y1)
    return x1 + (x2 - x1) * ratio


def infer_axis_from_trial(
    triangle_size: float,
    saturation: float,
    bounds: AxisBounds,
) -> Optional[AxisName]:
    size_eps = _value_eps(bounds.size_min, bounds.size_max)
    sat_eps = _value_eps(bounds.saturation_min, bounds.saturation_max)
    is_size_axis = math.isclose(saturation, bounds.saturation_max, abs_tol=sat_eps)
    is_sat_axis = math.isclose(triangle_size, bounds.size_max, abs_tol=size_eps)

    if is_size_axis and not is_sat_axis:
        return "size"
    if is_sat_axis and not is_size_axis:
        return "saturation"
    if is_size_axis and is_sat_axis:
        return "saturation"
    return None


def split_axis_samples(
    axis_trials: Iterable[dict],
    bounds: AxisBounds,
) -> Dict[AxisName, Dict[str, np.ndarray]]:
    size_x: List[float] = []
    size_y: List[int] = []
    sat_x: List[float] = []
    sat_y: List[int] = []

    for trial in axis_trials:
        axis = infer_axis_from_trial(
            float(trial["triangle_size"]),
            float(trial["saturation"]),
            bounds,
        )
        if axis == "size":
            size_x.append(float(trial["triangle_size"]))
            size_y.append(int(trial["success"]))
        elif axis == "saturation":
            sat_x.append(float(trial["saturation"]))
            sat_y.append(int(trial["success"]))

    return {
        "size": {
            "x": np.array(size_x, dtype=float),
            "y": np.array(size_y, dtype=float),
        },
        "saturation": {
            "x": np.array(sat_x, dtype=float),
            "y": np.array(sat_y, dtype=float),
        },
    }


def _axis_uncertainty_score(
    method: MethodName,
    x: np.ndarray,
    y: np.ndarray,
    grid: np.ndarray,
    lower: float,
    upper: float,
) -> Tuple[float, np.ndarray]:
    _, lo, hi = _bootstrap_curve(method, x, y, grid, lower, upper)
    uncertainty = np.maximum(0.0, hi - lo)
    if uncertainty.size == 0:
        return 1.0, np.array([1.0], dtype=float)
    return float(np.max(uncertainty)), uncertainty


def choose_next_axis(
    method: MethodName,
    policy: SwitchPolicy,
    axis_samples: Dict[AxisName, Dict[str, np.ndarray]],
    bounds: AxisBounds,
) -> AxisName:
    size_count = len(axis_samples["size"]["x"])
    sat_count = len(axis_samples["saturation"]["x"])

    if policy == "alternate":
        return "size" if size_count <= sat_count else "saturation"

    size_grid = _make_grid(bounds.size_min, bounds.size_max)
    sat_grid = _make_grid(bounds.saturation_min, bounds.saturation_max)

    size_score, _ = _axis_uncertainty_score(
        method,
        axis_samples["size"]["x"],
        axis_samples["size"]["y"],
        size_grid,
        bounds.size_min,
        bounds.size_max,
    )
    sat_score, _ = _axis_uncertainty_score(
        method,
        axis_samples["saturation"]["x"],
        axis_samples["saturation"]["y"],
        sat_grid,
        bounds.saturation_min,
        bounds.saturation_max,
    )

    if abs(size_score - sat_score) <= 1e-9:
        return "size" if size_count <= sat_count else "saturation"
    return "size" if size_score > sat_score else "saturation"


def choose_next_trial(
    method: MethodName,
    policy: SwitchPolicy,
    axis_trials: Iterable[dict],
    bounds: AxisBounds,
) -> dict:
    samples = split_axis_samples(axis_trials, bounds)
    axis = choose_next_axis(method, policy, samples, bounds)

    if axis == "size":
        x = samples["size"]["x"]
        y = samples["size"]["y"]
        lower, upper = bounds.size_min, bounds.size_max
        grid = _make_grid(lower, upper)
        score, uncertainty = _axis_uncertainty_score(method, x, y, grid, lower, upper)
        if x.size == 0 or score <= 0.0:
            chosen = float((lower + upper) / 2.0)
        else:
            chosen = float(grid[int(np.argmax(uncertainty))])

        size_high_guard = bounds.size_max - _value_eps(bounds.size_min, bounds.size_max)
        chosen = min(chosen, size_high_guard)
        return {
            "axis": "size",
            "triangle_size": chosen,
            "saturation": bounds.saturation_max,
        }

    x = samples["saturation"]["x"]
    y = samples["saturation"]["y"]
    lower, upper = bounds.saturation_min, bounds.saturation_max
    grid = _make_grid(lower, upper)
    score, uncertainty = _axis_uncertainty_score(method, x, y, grid, lower, upper)
    if x.size == 0 or score <= 0.0:
        chosen = float((lower + upper) / 2.0)
    else:
        chosen = float(grid[int(np.argmax(uncertainty))])

    sat_high_guard = bounds.saturation_max - _value_eps(bounds.saturation_min, bounds.saturation_max)
    chosen = min(chosen, sat_high_guard)
    return {
        "axis": "saturation",
        "triangle_size": bounds.size_max,
        "saturation": chosen,
    }


def _build_axis_curve(
    method: MethodName,
    x: np.ndarray,
    y: np.ndarray,
    *,
    lower: float,
    upper: float,
    decimals_x: int,
) -> dict:
    grid = _make_grid(lower, upper)
    pred, lo, hi = _bootstrap_curve(method, x, y, grid, lower, upper)
    return {
        "x": [round(float(v), decimals_x) for v in grid.tolist()],
        "probability": [round(float(v), 6) for v in pred.tolist()],
        "lower": [round(float(v), 6) for v in lo.tolist()],
        "upper": [round(float(v), 6) for v in hi.tolist()],
    }


def _build_thresholds(
    grid: List[float],
    probability: List[float],
    *,
    percent_step: int,
    decimals_x: int,
) -> List[dict]:
    arr_x = np.array(grid, dtype=float)
    arr_p = np.array(probability, dtype=float)
    rows: List[dict] = []
    for pct in range(percent_step, 100, percent_step):
        target = pct / 100.0
        threshold = _threshold_for_probability(arr_x, arr_p, target)
        rows.append(
            {
                "percent": pct,
                "probability": round(target, 4),
                "value": round(threshold, decimals_x) if threshold is not None else None,
            }
        )
    return rows


def build_axis_analysis(
    method: MethodName,
    axis_trials: Iterable[dict],
    bounds: AxisBounds,
    *,
    percent_step: int,
) -> dict:
    samples = split_axis_samples(axis_trials, bounds)
    warnings: List[str] = []
    if samples["size"]["x"].size < 4:
        warnings.append("size axis has sparse data; curve uncertainty is high")
    if samples["saturation"]["x"].size < 4:
        warnings.append("saturation axis has sparse data; curve uncertainty is high")

    size_curve = _build_axis_curve(
        method,
        samples["size"]["x"],
        samples["size"]["y"],
        lower=bounds.size_min,
        upper=bounds.size_max,
        decimals_x=2,
    )
    sat_curve = _build_axis_curve(
        method,
        samples["saturation"]["x"],
        samples["saturation"]["y"],
        lower=bounds.saturation_min,
        upper=bounds.saturation_max,
        decimals_x=4,
    )

    size_count = int(samples["size"]["x"].size)
    sat_count = int(samples["saturation"]["x"].size)

    return {
        "warnings": warnings,
        "counts": {
            "total": size_count + sat_count,
            "size_axis_trials": size_count,
            "saturation_axis_trials": sat_count,
        },
        "curves": {
            "size": {
                **size_curve,
                "fixed_counterpart": {"saturation": bounds.saturation_max},
            },
            "saturation": {
                **sat_curve,
                "fixed_counterpart": {"triangle_size": bounds.size_max},
            },
        },
        "threshold_table": {
            "percent_step": percent_step,
            "size": _build_thresholds(
                size_curve["x"],
                size_curve["probability"],
                percent_step=percent_step,
                decimals_x=2,
            ),
            "saturation": _build_thresholds(
                sat_curve["x"],
                sat_curve["probability"],
                percent_step=percent_step,
                decimals_x=4,
            ),
        },
    }
