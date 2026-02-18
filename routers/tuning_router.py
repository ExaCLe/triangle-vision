"""Algorithm tuning simulation endpoint.

Runs pretest + main algorithm entirely in-memory against a ground-truth model,
producing snapshots the frontend can scrub through to visualise algorithm
progress vs ground truth.
"""

import math
import random
from typing import Optional, List, Literal, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import numpy as np
import pandas as pd

from db.database import get_db
from routers.settings_router import _resolve_model
from algorithm_to_find_combinations.ground_truth import compute_probability
from algorithm_to_find_combinations.plotting import (
    compute_soft_brush_smooth,
    get_scaled_radii,
)
from algorithm_to_find_combinations.pretest import (
    PretestState,
    create_pretest_state,
    get_pretest_trial,
    process_pretest_result,
)
from algorithm_to_find_combinations.algorithm import (
    AlgorithmState,
    get_next_combination,
    update_state,
)
from schemas.settings import (
    PretestProbeRule,
    PretestSearch,
    PretestGlobalLimits,
    PretestSettings,
)

router = APIRouter(prefix="/tuning", tags=["tuning"])


# ── Request / response schemas ───────────────────────────────────────────────

class SimulateRequest(BaseModel):
    model_name: str = "default"
    pretest_mode: Literal["run", "manual"] = "run"

    # Pretest params
    lower_target: float = 0.40
    upper_target: float = 0.95
    success_target: int = 10
    trial_cap: int = 30
    max_probes_per_axis: int = 12
    refine_steps_per_edge: int = 2
    global_size_min: float = 1.0
    global_size_max: float = 100.0
    global_sat_min: float = 0.0
    global_sat_max: float = 1.0
    manual_size_min: Optional[float] = None
    manual_size_max: Optional[float] = None
    manual_sat_min: Optional[float] = None
    manual_sat_max: Optional[float] = None

    # Main algorithm params
    main_iterations: int = 300
    success_rate_threshold: float = 0.85
    total_samples_threshold: int = 5
    max_samples_before_split: int = 60

    # Snapshot control
    main_snapshot_interval: int = 10
    heatmap_steps: int = 60

    # Reproducibility
    seed: Optional[int] = None


class PretestSummary(BaseModel):
    probes_used: int
    current_axis: str
    search_phase: str
    size_lower: Optional[float] = None
    size_upper: Optional[float] = None
    saturation_lower: Optional[float] = None
    saturation_upper: Optional[float] = None


class RectangleInfo(BaseModel):
    bounds_ts: List[float]
    bounds_sat: List[float]
    area: float
    true_samples: int
    false_samples: int


class TrialInfo(BaseModel):
    triangle_size: float
    saturation: float
    success: bool
    probability: float
    phase: str


class Snapshot(BaseModel):
    step: int
    phase: str
    trial_count: int
    pretest_summary: Optional[PretestSummary] = None
    rectangles: List[RectangleInfo] = Field(default_factory=list)
    trials: List[TrialInfo] = Field(default_factory=list)
    completed_probes: List[dict] = Field(default_factory=list)


class SimulateResponse(BaseModel):
    ground_truth_heatmap: dict
    snapshots: List[Snapshot]
    total_trials: int
    pretest_trials: int
    main_trials: int
    final_bounds: Optional[dict] = None
    warnings: List[str] = Field(default_factory=list)


class SmoothHeatmapTrial(BaseModel):
    triangle_size: float
    saturation: float
    success: bool


class SmoothHeatmapRequest(BaseModel):
    model_name: str = "default"
    trials: List[SmoothHeatmapTrial] = Field(default_factory=list)
    size_min: float
    size_max: float
    sat_min: float
    sat_max: float
    steps: int = 100
    inner_radius: Optional[float] = Field(default=None, gt=0.0)
    outer_radius: Optional[float] = Field(default=None, gt=0.0)
    include_heatmap: bool = True


class SmoothHeatmapResponse(BaseModel):
    heatmap: Optional[dict] = None
    error_score: Optional[float] = None


class ShiftedModelCandidate(BaseModel):
    size_shift: float
    sat_shift: float
    avg_neg_log_likelihood: float
    brier_score: float
    accuracy: float
    surface_distance: float
    fit_gain: float
    relative_weight: float


class ShiftedModelSummary(BaseModel):
    best_fit_is_baseline: bool
    baseline_rank: int
    baseline_fit_gap: float
    best_margin: float
    best_relative_weight: float


class CompareShiftedModelsRequest(BaseModel):
    model_name: str = "default"
    trials: List[SmoothHeatmapTrial] = Field(default_factory=list)
    size_min: float
    size_max: float
    sat_min: float
    sat_max: float
    size_shift_min: float = -8.0
    size_shift_max: float = 8.0
    size_shift_steps: int = Field(default=9, ge=1, le=41)
    sat_shift_min: float = -0.08
    sat_shift_max: float = 0.08
    sat_shift_steps: int = Field(default=9, ge=1, le=41)
    surface_steps: int = Field(default=40, ge=8, le=160)
    include_heatmaps: bool = True


class HeatmapGrid(BaseModel):
    triangle_sizes: List[float]
    saturations: List[float]
    grid: List[List[float]]


class CompareShiftedModelsResponse(BaseModel):
    trial_count: int
    size_shifts: List[float]
    sat_shifts: List[float]
    fit_gain_grid: List[List[float]]
    candidates: List[ShiftedModelCandidate]
    best_candidate: ShiftedModelCandidate
    baseline_candidate: ShiftedModelCandidate
    summary: ShiftedModelSummary
    baseline_heatmap: Optional[HeatmapGrid] = None
    best_heatmap: Optional[HeatmapGrid] = None
    delta_heatmap: Optional[HeatmapGrid] = None
    delta_abs_max: Optional[float] = None


class DiscriminationCandidate(BaseModel):
    size_shift: float
    sat_shift: float
    loo_accuracy: float
    separation_rmse: float
    observable_score: float
    mean_trials: float


class DiscriminationExperimentRequest(BaseModel):
    simulation: SimulateRequest
    inspect_size_min: Optional[float] = None
    inspect_size_max: Optional[float] = None
    inspect_sat_min: Optional[float] = None
    inspect_sat_max: Optional[float] = None
    size_shift_min: float = -8.0
    size_shift_max: float = 8.0
    size_shift_steps: int = Field(default=9, ge=1, le=25)
    sat_shift_min: float = -0.08
    sat_shift_max: float = 0.08
    sat_shift_steps: int = Field(default=9, ge=1, le=25)
    repeats: int = Field(default=4, ge=2, le=16)
    estimate_steps: int = Field(default=80, ge=20, le=160)
    inner_radius: Optional[float] = Field(default=None, gt=0.0)
    outer_radius: Optional[float] = Field(default=None, gt=0.0)
    focus_size_shift: Optional[float] = None
    focus_sat_shift: Optional[float] = None


class DiscriminationExperimentSummary(BaseModel):
    best_shift_is_baseline: bool
    baseline_vs_focus_accuracy: float
    focus_observable_score: float


class DiscriminationExperimentResponse(BaseModel):
    repeats: int
    trial_count_per_run: int
    size_shifts: List[float]
    sat_shifts: List[float]
    reliability_grid: List[List[float]]
    candidates: List[DiscriminationCandidate]
    baseline_candidate: DiscriminationCandidate
    focus_candidate: DiscriminationCandidate
    best_candidate: DiscriminationCandidate
    baseline_mean_heatmap: HeatmapGrid
    focus_mean_heatmap: HeatmapGrid
    focus_delta_heatmap: HeatmapGrid
    focus_signal_heatmap: HeatmapGrid
    focus_signal_abs_max: float
    baseline_ground_truth_heatmap: HeatmapGrid
    focus_ground_truth_heatmap: HeatmapGrid
    ground_truth_delta_heatmap: HeatmapGrid
    ground_truth_delta_abs_max: float
    summary: DiscriminationExperimentSummary


# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_settings(req: SimulateRequest) -> PretestSettings:
    """Build a PretestSettings object from the flat request params."""
    return PretestSettings(
        lower_target=req.lower_target,
        upper_target=req.upper_target,
        probe_rule=PretestProbeRule(
            success_target=req.success_target,
            trial_cap=req.trial_cap,
        ),
        search=PretestSearch(
            max_probes_per_axis=req.max_probes_per_axis,
            refine_steps_per_edge=req.refine_steps_per_edge,
        ),
        global_limits=PretestGlobalLimits(
            min_triangle_size=req.global_size_min,
            max_triangle_size=req.global_size_max,
            min_saturation=req.global_sat_min,
            max_saturation=req.global_sat_max,
        ),
    )


def _generate_heatmap(model_dict: dict, req: SimulateRequest) -> dict:
    """Compute the ground-truth probability grid."""
    steps = max(2, min(500, req.heatmap_steps))
    ts_range = req.global_size_max - req.global_size_min
    sat_range = req.global_sat_max - req.global_sat_min

    triangle_sizes = [
        round(req.global_size_min + ts_range * i / (steps - 1), 2)
        for i in range(steps)
    ]
    saturations = [
        round(req.global_sat_min + sat_range * i / (steps - 1), 4)
        for i in range(steps)
    ]

    grid = []
    for sat in saturations:
        row = [round(compute_probability(model_dict, ts, sat), 4) for ts in triangle_sizes]
        grid.append(row)

    return {
        "triangle_sizes": triangle_sizes,
        "saturations": saturations,
        "grid": grid,
    }


def _validate_global_bounds(req: SimulateRequest) -> None:
    if req.global_size_min >= req.global_size_max:
        raise HTTPException(
            status_code=422,
            detail="global_size_min must be < global_size_max",
        )
    if req.global_sat_min >= req.global_sat_max:
        raise HTTPException(
            status_code=422,
            detail="global_sat_min must be < global_sat_max",
        )


def _manual_bounds(req: SimulateRequest) -> Tuple[float, float, float, float]:
    values = [
        req.manual_size_min,
        req.manual_size_max,
        req.manual_sat_min,
        req.manual_sat_max,
    ]
    if any(v is None for v in values):
        raise HTTPException(
            status_code=422,
            detail=(
                "Manual mode requires all four bounds "
                "(manual_size_min/max, manual_sat_min/max)"
            ),
        )

    size_min = float(req.manual_size_min)
    size_max = float(req.manual_size_max)
    sat_min = float(req.manual_sat_min)
    sat_max = float(req.manual_sat_max)

    if size_min >= size_max:
        raise HTTPException(
            status_code=422,
            detail="manual_size_min must be < manual_size_max",
        )
    if sat_min >= sat_max:
        raise HTTPException(
            status_code=422,
            detail="manual_sat_min must be < manual_sat_max",
        )

    return size_min, size_max, sat_min, sat_max


def _validate_bounds(
    size_min: float,
    size_max: float,
    sat_min: float,
    sat_max: float,
    *,
    prefix: str,
) -> None:
    if size_min >= size_max:
        raise HTTPException(
            status_code=422,
            detail=f"{prefix}_size_min must be < {prefix}_size_max",
        )
    if sat_min >= sat_max:
        raise HTTPException(
            status_code=422,
            detail=f"{prefix}_sat_min must be < {prefix}_sat_max",
        )


def _build_smoothed_heatmap(
    model_dict: dict,
    trials: List[SmoothHeatmapTrial],
    *,
    size_min: float,
    size_max: float,
    sat_min: float,
    sat_max: float,
    steps: int,
    inner_radius: Optional[float],
    outer_radius: Optional[float],
    include_heatmap: bool,
) -> SmoothHeatmapResponse:
    if not trials:
        raise HTTPException(status_code=422, detail="At least one trial is required")

    step_count = max(10, min(500, steps))
    triangle_bounds = (size_min, size_max)
    saturation_bounds = (sat_min, sat_max)

    df = pd.DataFrame(
        [
            {
                "triangle_size": t.triangle_size,
                "saturation": t.saturation,
                "success_float": float(t.success),
            }
            for t in trials
        ]
    )

    default_inner, default_outer = get_scaled_radii((triangle_bounds, saturation_bounds))
    resolved_inner = inner_radius if inner_radius is not None else default_inner
    resolved_outer = outer_radius if outer_radius is not None else default_outer
    if resolved_outer <= resolved_inner:
        raise HTTPException(
            status_code=422,
            detail="outer_radius must be greater than inner_radius",
        )
    params = {"inner_radius": resolved_inner, "outer_radius": resolved_outer}

    X_s, Y_s, Z_s = compute_soft_brush_smooth(
        df,
        triangle_bounds,
        saturation_bounds,
        params,
        steps=step_count,
    )

    Z_model = np.vectorize(
        lambda x, y: compute_probability(model_dict, float(x), float(y))
    )(X_s, Y_s)

    valid = np.isfinite(Z_s)
    if np.any(valid):
        mse = float(np.mean((Z_s[valid] - Z_model[valid]) ** 2))
    else:
        # Fallback for pathological sparse inputs
        z_filled = np.nan_to_num(Z_s, nan=0.25)
        mse = float(np.mean((z_filled - Z_model) ** 2))

    heatmap = None
    if include_heatmap:
        z_display = np.nan_to_num(Z_s, nan=0.25)
        triangle_sizes = [round(float(v), 2) for v in X_s[0, :].tolist()]
        saturations = [round(float(v), 4) for v in Y_s[:, 0].tolist()]
        grid = [[round(float(v), 4) for v in row] for row in z_display.tolist()]
        heatmap = {
            "triangle_sizes": triangle_sizes,
            "saturations": saturations,
            "grid": grid,
        }

    return SmoothHeatmapResponse(
        heatmap=heatmap,
        error_score=round(mse * 100.0, 6),
    )


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _is_zero(value: float, *, eps: float = 1e-9) -> bool:
    return abs(value) <= eps


def _build_shift_axis(min_shift: float, max_shift: float, steps: int) -> List[float]:
    if steps <= 1 or abs(max_shift - min_shift) <= 1e-12:
        return [round(float(min_shift), 6)]
    values = np.linspace(min_shift, max_shift, num=steps)
    return [round(float(v), 6) for v in values.tolist()]


def _shifted_probability(
    model_dict: dict,
    triangle_size: float,
    saturation: float,
    *,
    size_shift: float,
    sat_shift: float,
    size_min: float,
    size_max: float,
    sat_min: float,
    sat_max: float,
) -> float:
    shifted_size = _clamp(triangle_size - size_shift, size_min, size_max)
    shifted_sat = _clamp(saturation - sat_shift, sat_min, sat_max)
    return compute_probability(model_dict, shifted_size, shifted_sat)


def _compute_shifted_surface(
    model_dict: dict,
    surface_sizes: np.ndarray,
    surface_sats: np.ndarray,
    *,
    size_shift: float,
    sat_shift: float,
    size_min: float,
    size_max: float,
    sat_min: float,
    sat_max: float,
) -> np.ndarray:
    surface = np.zeros((len(surface_sats), len(surface_sizes)))
    for sat_idx, sat in enumerate(surface_sats):
        for size_idx, triangle_size in enumerate(surface_sizes):
            surface[sat_idx, size_idx] = _shifted_probability(
                model_dict,
                float(triangle_size),
                float(sat),
                size_shift=size_shift,
                sat_shift=sat_shift,
                size_min=size_min,
                size_max=size_max,
                sat_min=sat_min,
                sat_max=sat_max,
            )
    return surface


def _surface_to_heatmap(
    surface: np.ndarray,
    surface_sizes: np.ndarray,
    surface_sats: np.ndarray,
) -> HeatmapGrid:
    return HeatmapGrid(
        triangle_sizes=[round(float(v), 2) for v in surface_sizes.tolist()],
        saturations=[round(float(v), 4) for v in surface_sats.tolist()],
        grid=[[round(float(v), 6) for v in row] for row in surface.tolist()],
    )


def _to_shifted_candidate(entry: dict) -> ShiftedModelCandidate:
    return ShiftedModelCandidate(
        size_shift=round(float(entry["size_shift"]), 6),
        sat_shift=round(float(entry["sat_shift"]), 6),
        avg_neg_log_likelihood=round(float(entry["avg_neg_log_likelihood"]), 6),
        brier_score=round(float(entry["brier_score"]), 6),
        accuracy=round(float(entry["accuracy"]), 6),
        surface_distance=round(float(entry["surface_distance"]), 6),
        fit_gain=round(float(entry["fit_gain"]), 6),
        relative_weight=round(float(entry["relative_weight"]), 6),
    )


def _compare_shifted_models(
    model_dict: dict,
    req: CompareShiftedModelsRequest,
) -> CompareShiftedModelsResponse:
    if not req.trials:
        raise HTTPException(status_code=422, detail="At least one trial is required")
    if req.size_shift_min > req.size_shift_max:
        raise HTTPException(
            status_code=422,
            detail="size_shift_min must be <= size_shift_max",
        )
    if req.sat_shift_min > req.sat_shift_max:
        raise HTTPException(
            status_code=422,
            detail="sat_shift_min must be <= sat_shift_max",
        )

    size_shifts = _build_shift_axis(
        req.size_shift_min,
        req.size_shift_max,
        req.size_shift_steps,
    )
    sat_shifts = _build_shift_axis(
        req.sat_shift_min,
        req.sat_shift_max,
        req.sat_shift_steps,
    )
    if not any(_is_zero(v) for v in size_shifts):
        size_shifts = sorted(size_shifts + [0.0])
    if not any(_is_zero(v) for v in sat_shifts):
        sat_shifts = sorted(sat_shifts + [0.0])

    trial_points = [
        (
            float(t.triangle_size),
            float(t.saturation),
            1.0 if bool(t.success) else 0.0,
        )
        for t in req.trials
    ]
    trial_count = len(trial_points)
    eps = 1e-6

    surface_steps = max(8, min(160, req.surface_steps))
    surface_sizes = np.linspace(req.size_min, req.size_max, num=surface_steps)
    surface_sats = np.linspace(req.sat_min, req.sat_max, num=surface_steps)

    baseline_surface = _compute_shifted_surface(
        model_dict,
        surface_sizes,
        surface_sats,
        size_shift=0.0,
        sat_shift=0.0,
        size_min=req.size_min,
        size_max=req.size_max,
        sat_min=req.sat_min,
        sat_max=req.sat_max,
    )

    candidates_raw: List[dict] = []
    for sat_shift in sat_shifts:
        for size_shift in size_shifts:
            log_likelihood = 0.0
            brier_sum = 0.0
            correct = 0

            for triangle_size, saturation, success in trial_points:
                probability = _shifted_probability(
                    model_dict,
                    triangle_size,
                    saturation,
                    size_shift=size_shift,
                    sat_shift=sat_shift,
                    size_min=req.size_min,
                    size_max=req.size_max,
                    sat_min=req.sat_min,
                    sat_max=req.sat_max,
                )
                probability = _clamp(probability, eps, 1.0 - eps)
                log_likelihood += (
                    success * math.log(probability)
                    + (1.0 - success) * math.log(1.0 - probability)
                )
                brier_sum += (probability - success) ** 2
                if (probability >= 0.5) == bool(success):
                    correct += 1

            avg_nll = -log_likelihood / trial_count
            brier_score = brier_sum / trial_count
            accuracy = correct / trial_count

            if _is_zero(size_shift) and _is_zero(sat_shift):
                surface_distance = 0.0
            else:
                shifted_surface = _compute_shifted_surface(
                    model_dict,
                    surface_sizes,
                    surface_sats,
                    size_shift=size_shift,
                    sat_shift=sat_shift,
                    size_min=req.size_min,
                    size_max=req.size_max,
                    sat_min=req.sat_min,
                    sat_max=req.sat_max,
                )
                diff = shifted_surface - baseline_surface
                surface_distance = math.sqrt(float(np.mean(diff * diff))) * 100.0

            candidates_raw.append(
                {
                    "size_shift": float(size_shift),
                    "sat_shift": float(sat_shift),
                    "avg_neg_log_likelihood": float(avg_nll),
                    "brier_score": float(brier_score),
                    "accuracy": float(accuracy),
                    "surface_distance": float(surface_distance),
                    "fit_gain": 0.0,
                    "relative_weight": 0.0,
                }
            )

    baseline_entry = next(
        (
            candidate
            for candidate in candidates_raw
            if _is_zero(candidate["size_shift"]) and _is_zero(candidate["sat_shift"])
        ),
        None,
    )
    if baseline_entry is None:
        raise HTTPException(
            status_code=500,
            detail="Baseline candidate (0 shift) could not be evaluated",
        )

    baseline_nll = baseline_entry["avg_neg_log_likelihood"]
    for candidate in candidates_raw:
        candidate["fit_gain"] = baseline_nll - candidate["avg_neg_log_likelihood"]

    log_weights = [
        -(candidate["avg_neg_log_likelihood"] * trial_count)
        for candidate in candidates_raw
    ]
    max_log_weight = max(log_weights)
    raw_weights = [math.exp(v - max_log_weight) for v in log_weights]
    weight_sum = max(sum(raw_weights), 1e-12)
    for candidate, weight in zip(candidates_raw, raw_weights):
        candidate["relative_weight"] = weight / weight_sum

    sorted_candidates = sorted(
        candidates_raw,
        key=lambda candidate: candidate["avg_neg_log_likelihood"],
    )
    best_entry = sorted_candidates[0]
    runner_up = sorted_candidates[1] if len(sorted_candidates) > 1 else sorted_candidates[0]
    baseline_rank = next(
        index + 1
        for index, candidate in enumerate(sorted_candidates)
        if _is_zero(candidate["size_shift"]) and _is_zero(candidate["sat_shift"])
    )

    fit_gain_lookup = {
        (round(c["size_shift"], 6), round(c["sat_shift"], 6)): c["fit_gain"]
        for c in candidates_raw
    }
    fit_gain_grid = [
        [
            round(fit_gain_lookup[(round(size_shift, 6), round(sat_shift, 6))], 6)
            for size_shift in size_shifts
        ]
        for sat_shift in sat_shifts
    ]

    baseline_heatmap = None
    best_heatmap = None
    delta_heatmap = None
    delta_abs_max = None
    if req.include_heatmaps:
        best_surface = _compute_shifted_surface(
            model_dict,
            surface_sizes,
            surface_sats,
            size_shift=best_entry["size_shift"],
            sat_shift=best_entry["sat_shift"],
            size_min=req.size_min,
            size_max=req.size_max,
            sat_min=req.sat_min,
            sat_max=req.sat_max,
        )
        delta_surface = best_surface - baseline_surface
        delta_abs_max = float(np.max(np.abs(delta_surface)))
        baseline_heatmap = _surface_to_heatmap(
            baseline_surface,
            surface_sizes,
            surface_sats,
        )
        best_heatmap = _surface_to_heatmap(
            best_surface,
            surface_sizes,
            surface_sats,
        )
        delta_heatmap = _surface_to_heatmap(
            delta_surface,
            surface_sizes,
            surface_sats,
        )

    return CompareShiftedModelsResponse(
        trial_count=trial_count,
        size_shifts=[round(v, 6) for v in size_shifts],
        sat_shifts=[round(v, 6) for v in sat_shifts],
        fit_gain_grid=fit_gain_grid,
        candidates=[_to_shifted_candidate(candidate) for candidate in sorted_candidates],
        best_candidate=_to_shifted_candidate(best_entry),
        baseline_candidate=_to_shifted_candidate(baseline_entry),
        summary=ShiftedModelSummary(
            best_fit_is_baseline=baseline_rank == 1,
            baseline_rank=baseline_rank,
            baseline_fit_gap=round(
                baseline_entry["avg_neg_log_likelihood"] - best_entry["avg_neg_log_likelihood"],
                6,
            ),
            best_margin=round(
                runner_up["avg_neg_log_likelihood"] - best_entry["avg_neg_log_likelihood"],
                6,
            ),
            best_relative_weight=round(best_entry["relative_weight"], 6),
        ),
        baseline_heatmap=baseline_heatmap,
        best_heatmap=best_heatmap,
        delta_heatmap=delta_heatmap,
        delta_abs_max=(
            round(float(delta_abs_max), 6)
            if delta_abs_max is not None
            else None
        ),
    )


def _trial_probability_with_shift(
    model_dict: dict,
    req: SimulateRequest,
    triangle_size: float,
    saturation: float,
    *,
    size_shift: float,
    sat_shift: float,
) -> float:
    return _shifted_probability(
        model_dict,
        triangle_size,
        saturation,
        size_shift=size_shift,
        sat_shift=sat_shift,
        size_min=req.global_size_min,
        size_max=req.global_size_max,
        sat_min=req.global_sat_min,
        sat_max=req.global_sat_max,
    )


def _simulate_trials_only(
    req: SimulateRequest,
    model_dict: dict,
    *,
    size_shift: float,
    sat_shift: float,
    rng_seed: int,
) -> Tuple[List[SmoothHeatmapTrial], int, List[str]]:
    _validate_global_bounds(req)

    rng = random.Random(rng_seed)
    all_trials: List[SmoothHeatmapTrial] = []
    warnings: List[str] = []

    pretest_state: Optional[PretestState] = None
    pretest_trial_count = 0
    if req.pretest_mode == "run":
        settings = _build_settings(req)
        pretest_state = create_pretest_state(settings)

        max_pretest_trials = 5000
        while not pretest_state.is_complete and pretest_trial_count < max_pretest_trials:
            trial = get_pretest_trial(pretest_state)
            ts = trial["triangle_size"]
            sat = trial["saturation"]

            prob = _trial_probability_with_shift(
                model_dict,
                req,
                ts,
                sat,
                size_shift=size_shift,
                sat_shift=sat_shift,
            )
            success = rng.random() < prob

            pretest_state = process_pretest_result(pretest_state, success)
            pretest_trial_count += 1
            all_trials.append(
                SmoothHeatmapTrial(
                    triangle_size=ts,
                    saturation=sat,
                    success=success,
                )
            )

        warnings.extend(pretest_state.warnings)
        if pretest_trial_count >= max_pretest_trials and not pretest_state.is_complete:
            warnings.append("Pretest hit safety limit without completing")

        size_lower = (
            pretest_state.size_lower
            if pretest_state.size_lower is not None
            else req.global_size_min
        )
        size_upper = (
            pretest_state.size_upper
            if pretest_state.size_upper is not None
            else req.global_size_max
        )
        sat_lower = (
            pretest_state.saturation_lower
            if pretest_state.saturation_lower is not None
            else req.global_sat_min
        )
        sat_upper = (
            pretest_state.saturation_upper
            if pretest_state.saturation_upper is not None
            else req.global_sat_max
        )
    else:
        size_lower, size_upper, sat_lower, sat_upper = _manual_bounds(req)

    algo_state = AlgorithmState(
        (size_lower, size_upper),
        (sat_lower, sat_upper),
    )
    main_trial_count = 0
    for _ in range(req.main_iterations):
        combination, selected_rect = get_next_combination(algo_state)
        if not combination:
            break

        ts = combination["triangle_size"]
        sat = combination["saturation"]
        prob = _trial_probability_with_shift(
            model_dict,
            req,
            ts,
            sat,
            size_shift=size_shift,
            sat_shift=sat_shift,
        )
        success = rng.random() < prob

        algo_state = update_state(
            algo_state,
            selected_rect,
            combination,
            success,
            success_rate_threshold=req.success_rate_threshold,
            total_samples_threshold=req.total_samples_threshold,
            max_samples=req.max_samples_before_split,
        )
        main_trial_count += 1
        all_trials.append(
            SmoothHeatmapTrial(
                triangle_size=ts,
                saturation=sat,
                success=success,
            )
        )

    return all_trials, pretest_trial_count + main_trial_count, warnings


def _estimate_surface_from_trials(
    trials: List[SmoothHeatmapTrial],
    *,
    size_min: float,
    size_max: float,
    sat_min: float,
    sat_max: float,
    steps: int,
    inner_radius: Optional[float],
    outer_radius: Optional[float],
) -> Tuple[HeatmapGrid, np.ndarray, np.ndarray, np.ndarray]:
    if not trials:
        raise HTTPException(status_code=422, detail="At least one trial is required")

    step_count = max(20, min(160, steps))
    triangle_bounds = (size_min, size_max)
    saturation_bounds = (sat_min, sat_max)

    df = pd.DataFrame(
        [
            {
                "triangle_size": t.triangle_size,
                "saturation": t.saturation,
                "success_float": float(t.success),
            }
            for t in trials
        ]
    )

    default_inner, default_outer = get_scaled_radii((triangle_bounds, saturation_bounds))
    resolved_inner = inner_radius if inner_radius is not None else default_inner
    resolved_outer = outer_radius if outer_radius is not None else default_outer
    if resolved_outer <= resolved_inner:
        raise HTTPException(
            status_code=422,
            detail="outer_radius must be greater than inner_radius",
        )
    params = {"inner_radius": resolved_inner, "outer_radius": resolved_outer}
    X_s, Y_s, Z_s = compute_soft_brush_smooth(
        df,
        triangle_bounds,
        saturation_bounds,
        params,
        steps=step_count,
    )
    surface = np.nan_to_num(Z_s, nan=0.25)
    x_axis = X_s[0, :]
    y_axis = Y_s[:, 0]
    return _surface_to_heatmap(surface, x_axis, y_axis), surface, x_axis, y_axis


def _ground_truth_surface_from_axes(
    model_dict: dict,
    sim_req: SimulateRequest,
    x_axis: np.ndarray,
    y_axis: np.ndarray,
    *,
    size_shift: float,
    sat_shift: float,
) -> np.ndarray:
    surface = np.zeros((len(y_axis), len(x_axis)))
    for sat_idx, sat in enumerate(y_axis):
        for size_idx, triangle_size in enumerate(x_axis):
            surface[sat_idx, size_idx] = _trial_probability_with_shift(
                model_dict,
                sim_req,
                float(triangle_size),
                float(sat),
                size_shift=size_shift,
                sat_shift=sat_shift,
            )
    return surface


def _rmse(a: np.ndarray, b: np.ndarray) -> float:
    return float(math.sqrt(float(np.mean((a - b) ** 2))))


def _loo_discrimination_accuracy(
    baseline_surfaces: List[np.ndarray],
    candidate_surfaces: List[np.ndarray],
) -> float:
    n = min(len(baseline_surfaces), len(candidate_surfaces))
    if n == 0:
        return 0.0

    baseline_stack = np.stack(baseline_surfaces)
    candidate_stack = np.stack(candidate_surfaces)
    baseline_mean = np.mean(baseline_stack, axis=0)
    candidate_mean = np.mean(candidate_stack, axis=0)

    correct = 0
    total = 0
    for idx in range(n):
        if n > 1:
            baseline_loo = np.mean(np.delete(baseline_stack, idx, axis=0), axis=0)
        else:
            baseline_loo = baseline_surfaces[idx]
        d_same = _rmse(baseline_surfaces[idx], baseline_loo)
        d_other = _rmse(baseline_surfaces[idx], candidate_mean)
        correct += int(d_same <= d_other)
        total += 1

    for idx in range(n):
        if n > 1:
            candidate_loo = np.mean(np.delete(candidate_stack, idx, axis=0), axis=0)
        else:
            candidate_loo = candidate_surfaces[idx]
        d_same = _rmse(candidate_surfaces[idx], candidate_loo)
        d_other = _rmse(candidate_surfaces[idx], baseline_mean)
        correct += int(d_same <= d_other)
        total += 1

    return float(correct) / float(max(total, 1))


def _to_discrimination_candidate(entry: dict) -> DiscriminationCandidate:
    return DiscriminationCandidate(
        size_shift=round(float(entry["size_shift"]), 6),
        sat_shift=round(float(entry["sat_shift"]), 6),
        loo_accuracy=round(float(entry["loo_accuracy"]), 6),
        separation_rmse=round(float(entry["separation_rmse"]), 6),
        observable_score=round(float(entry["observable_score"]), 6),
        mean_trials=round(float(entry["mean_trials"]), 3),
    )


def _run_discrimination_experiment(
    req: DiscriminationExperimentRequest,
    model_dict: dict,
) -> DiscriminationExperimentResponse:
    sim_req = req.simulation
    _validate_global_bounds(sim_req)

    inspect_size_min = (
        req.inspect_size_min
        if req.inspect_size_min is not None
        else sim_req.global_size_min
    )
    inspect_size_max = (
        req.inspect_size_max
        if req.inspect_size_max is not None
        else sim_req.global_size_max
    )
    inspect_sat_min = (
        req.inspect_sat_min
        if req.inspect_sat_min is not None
        else sim_req.global_sat_min
    )
    inspect_sat_max = (
        req.inspect_sat_max
        if req.inspect_sat_max is not None
        else sim_req.global_sat_max
    )
    _validate_bounds(
        inspect_size_min,
        inspect_size_max,
        inspect_sat_min,
        inspect_sat_max,
        prefix="inspection",
    )

    if req.size_shift_min > req.size_shift_max:
        raise HTTPException(status_code=422, detail="size_shift_min must be <= size_shift_max")
    if req.sat_shift_min > req.sat_shift_max:
        raise HTTPException(status_code=422, detail="sat_shift_min must be <= sat_shift_max")

    size_shifts = _build_shift_axis(req.size_shift_min, req.size_shift_max, req.size_shift_steps)
    sat_shifts = _build_shift_axis(req.sat_shift_min, req.sat_shift_max, req.sat_shift_steps)
    if not any(_is_zero(v) for v in size_shifts):
        size_shifts = sorted(size_shifts + [0.0])
    if not any(_is_zero(v) for v in sat_shifts):
        sat_shifts = sorted(sat_shifts + [0.0])

    candidate_keys = [(round(size_shift, 6), round(sat_shift, 6))
                      for sat_shift in sat_shifts
                      for size_shift in size_shifts]
    baseline_key = (0.0, 0.0)

    base_seed = sim_req.seed if sim_req.seed is not None else random.randint(1, 10**9)

    surfaces_by_candidate = {}
    mean_trials_by_candidate = {}
    x_axis = None
    y_axis = None

    for candidate_idx, (size_shift, sat_shift) in enumerate(candidate_keys):
        candidate_surfaces: List[np.ndarray] = []
        trial_counts: List[int] = []

        for repeat_idx in range(req.repeats):
            run_seed = int(base_seed + repeat_idx + candidate_idx * 10000)
            trials, trial_count, _warnings = _simulate_trials_only(
                sim_req,
                model_dict,
                size_shift=size_shift,
                sat_shift=sat_shift,
                rng_seed=run_seed,
            )
            _, surface, local_x_axis, local_y_axis = _estimate_surface_from_trials(
                trials,
                size_min=inspect_size_min,
                size_max=inspect_size_max,
                sat_min=inspect_sat_min,
                sat_max=inspect_sat_max,
                steps=req.estimate_steps,
                inner_radius=req.inner_radius,
                outer_radius=req.outer_radius,
            )
            candidate_surfaces.append(surface)
            trial_counts.append(trial_count)
            if x_axis is None:
                x_axis = local_x_axis
                y_axis = local_y_axis

        surfaces_by_candidate[(size_shift, sat_shift)] = candidate_surfaces
        mean_trials_by_candidate[(size_shift, sat_shift)] = float(np.mean(trial_counts))

    if baseline_key not in surfaces_by_candidate:
        raise HTTPException(status_code=500, detail="Baseline candidate was not simulated")

    baseline_surfaces = surfaces_by_candidate[baseline_key]
    baseline_stack = np.stack(baseline_surfaces)
    baseline_mean = np.mean(baseline_stack, axis=0)
    baseline_within = [_rmse(surface, baseline_mean) * 100.0 for surface in baseline_surfaces]
    baseline_noise = float(np.mean(baseline_within))

    candidate_stats = []
    for key, candidate_surfaces in surfaces_by_candidate.items():
        candidate_stack = np.stack(candidate_surfaces)
        candidate_mean = np.mean(candidate_stack, axis=0)
        candidate_within = [_rmse(surface, candidate_mean) * 100.0 for surface in candidate_surfaces]
        separation_rmse = _rmse(candidate_mean, baseline_mean) * 100.0
        if key == baseline_key:
            loo_accuracy = 0.5
            observable_score = 0.0
        else:
            loo_accuracy = _loo_discrimination_accuracy(baseline_surfaces, candidate_surfaces)
            noise = max((baseline_noise + float(np.mean(candidate_within))) / 2.0, 1e-6)
            observable_score = separation_rmse / noise

        candidate_stats.append(
            {
                "size_shift": key[0],
                "sat_shift": key[1],
                "loo_accuracy": loo_accuracy,
                "separation_rmse": separation_rmse,
                "observable_score": observable_score,
                "mean_trials": mean_trials_by_candidate[key],
                "mean_surface": candidate_mean,
            }
        )

    candidate_lookup = {
        (round(c["size_shift"], 6), round(c["sat_shift"], 6)): c
        for c in candidate_stats
    }
    reliability_grid = [
        [
            round(
                float(candidate_lookup[(round(size_shift, 6), round(sat_shift, 6))]["loo_accuracy"]),
                6,
            )
            for size_shift in size_shifts
        ]
        for sat_shift in sat_shifts
    ]

    non_baseline_candidates = [
        c for c in candidate_stats
        if not (_is_zero(c["size_shift"]) and _is_zero(c["sat_shift"]))
    ]
    non_baseline_candidates.sort(
        key=lambda c: (c["loo_accuracy"], c["observable_score"], c["separation_rmse"]),
        reverse=True,
    )
    best_candidate = non_baseline_candidates[0] if non_baseline_candidates else candidate_lookup[baseline_key]

    focus_candidate = best_candidate
    if req.focus_size_shift is not None and req.focus_sat_shift is not None:
        for candidate in candidate_stats:
            if _is_zero(candidate["size_shift"] - req.focus_size_shift) and _is_zero(
                candidate["sat_shift"] - req.focus_sat_shift
            ):
                focus_candidate = candidate
                break

    focus_key = (round(focus_candidate["size_shift"], 6), round(focus_candidate["sat_shift"], 6))
    focus_surfaces = surfaces_by_candidate[focus_key]
    focus_stack = np.stack(focus_surfaces)
    focus_mean = np.mean(focus_stack, axis=0)
    delta_surface = focus_mean - baseline_mean

    baseline_std = np.std(baseline_stack, axis=0)
    focus_std = np.std(focus_stack, axis=0)
    pooled_std = np.sqrt((baseline_std ** 2 + focus_std ** 2) / 2.0)
    signal_surface = np.divide(delta_surface, pooled_std + 1e-6)
    signal_abs_max = float(np.max(np.abs(signal_surface)))

    baseline_ground_truth_surface = _ground_truth_surface_from_axes(
        model_dict,
        sim_req,
        x_axis,
        y_axis,
        size_shift=0.0,
        sat_shift=0.0,
    )
    focus_ground_truth_surface = _ground_truth_surface_from_axes(
        model_dict,
        sim_req,
        x_axis,
        y_axis,
        size_shift=focus_candidate["size_shift"],
        sat_shift=focus_candidate["sat_shift"],
    )
    ground_truth_delta_surface = focus_ground_truth_surface - baseline_ground_truth_surface
    ground_truth_delta_abs_max = float(np.max(np.abs(ground_truth_delta_surface)))

    sorted_for_response = [candidate_lookup[baseline_key], *non_baseline_candidates]

    trial_count_per_run = int(round(mean_trials_by_candidate[baseline_key]))
    return DiscriminationExperimentResponse(
        repeats=req.repeats,
        trial_count_per_run=trial_count_per_run,
        size_shifts=[round(v, 6) for v in size_shifts],
        sat_shifts=[round(v, 6) for v in sat_shifts],
        reliability_grid=reliability_grid,
        candidates=[_to_discrimination_candidate(entry) for entry in sorted_for_response],
        baseline_candidate=_to_discrimination_candidate(candidate_lookup[baseline_key]),
        focus_candidate=_to_discrimination_candidate(focus_candidate),
        best_candidate=_to_discrimination_candidate(best_candidate),
        baseline_mean_heatmap=_surface_to_heatmap(baseline_mean, x_axis, y_axis),
        focus_mean_heatmap=_surface_to_heatmap(focus_mean, x_axis, y_axis),
        focus_delta_heatmap=_surface_to_heatmap(delta_surface, x_axis, y_axis),
        focus_signal_heatmap=_surface_to_heatmap(signal_surface, x_axis, y_axis),
        focus_signal_abs_max=round(signal_abs_max, 6),
        baseline_ground_truth_heatmap=_surface_to_heatmap(
            baseline_ground_truth_surface,
            x_axis,
            y_axis,
        ),
        focus_ground_truth_heatmap=_surface_to_heatmap(
            focus_ground_truth_surface,
            x_axis,
            y_axis,
        ),
        ground_truth_delta_heatmap=_surface_to_heatmap(
            ground_truth_delta_surface,
            x_axis,
            y_axis,
        ),
        ground_truth_delta_abs_max=round(ground_truth_delta_abs_max, 6),
        summary=DiscriminationExperimentSummary(
            best_shift_is_baseline=bool(best_candidate["loo_accuracy"] <= 0.5),
            baseline_vs_focus_accuracy=round(float(focus_candidate["loo_accuracy"]), 6),
            focus_observable_score=round(float(focus_candidate["observable_score"]), 6),
        ),
    )


def _pretest_summary(state: PretestState) -> PretestSummary:
    return PretestSummary(
        probes_used=state.probes_used,
        current_axis=state.current_axis,
        search_phase=state.search_phase,
        size_lower=state.size_lower,
        size_upper=state.size_upper,
        saturation_lower=state.saturation_lower,
        saturation_upper=state.saturation_upper,
    )


def _rects_info(state: AlgorithmState) -> List[RectangleInfo]:
    return [
        RectangleInfo(
            bounds_ts=list(r["bounds"]["triangle_size"]),
            bounds_sat=list(r["bounds"]["saturation"]),
            area=r["area"],
            true_samples=r["true_samples"],
            false_samples=r["false_samples"],
        )
        for r in state.rectangles
    ]


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/simulate", response_model=SimulateResponse)
def run_simulation(req: SimulateRequest, db: Session = Depends(get_db)):
    """Run an in-memory pretest + main algorithm simulation against a model."""

    _validate_global_bounds(req)

    # Resolve model (needs DB for custom models)
    model_dict = _resolve_model(req.model_name, db)
    if model_dict is None:
        raise HTTPException(status_code=404, detail=f"Unknown model: {req.model_name}")

    if req.seed is not None:
        random.seed(req.seed)

    # Generate ground-truth heatmap
    heatmap = _generate_heatmap(model_dict, req)

    all_trials: List[TrialInfo] = []
    snapshots: List[Snapshot] = []
    warnings: List[str] = []

    pretest_state: Optional[PretestState] = None
    pretest_trial_count = 0
    if req.pretest_mode == "run":
        # ── Pretest phase ────────────────────────────────────────────────────
        settings = _build_settings(req)
        pretest_state = create_pretest_state(settings)

        max_pretest_trials = 5000  # safety limit
        prev_probes = 0
        prev_axis = pretest_state.current_axis
        prev_phase = pretest_state.search_phase

        # Initial snapshot
        snapshots.append(Snapshot(
            step=0,
            phase="pretest",
            trial_count=0,
            pretest_summary=_pretest_summary(pretest_state),
            completed_probes=list(pretest_state.completed_probes),
        ))

        while not pretest_state.is_complete and pretest_trial_count < max_pretest_trials:
            trial = get_pretest_trial(pretest_state)
            ts = trial["triangle_size"]
            sat = trial["saturation"]

            prob = compute_probability(model_dict, ts, sat)
            success = random.random() < prob

            pretest_state = process_pretest_result(pretest_state, success)
            pretest_trial_count += 1

            all_trials.append(TrialInfo(
                triangle_size=ts,
                saturation=sat,
                success=success,
                probability=round(prob, 4),
                phase="pretest",
            ))

            # Snapshot when a probe completes or axis/phase changes
            changed = (
                pretest_state.probes_used != prev_probes
                or pretest_state.current_axis != prev_axis
                or pretest_state.search_phase != prev_phase
            )
            if changed:
                snapshots.append(Snapshot(
                    step=len(snapshots),
                    phase="pretest",
                    trial_count=pretest_trial_count,
                    pretest_summary=_pretest_summary(pretest_state),
                    trials=list(all_trials),
                    completed_probes=list(pretest_state.completed_probes),
                ))
                prev_probes = pretest_state.probes_used
                prev_axis = pretest_state.current_axis
                prev_phase = pretest_state.search_phase

        warnings.extend(pretest_state.warnings)

        if pretest_trial_count >= max_pretest_trials and not pretest_state.is_complete:
            warnings.append("Pretest hit safety limit without completing")

        # ── Extract bounds from pretest ──────────────────────────────────────
        size_lower = (
            pretest_state.size_lower
            if pretest_state.size_lower is not None
            else req.global_size_min
        )
        size_upper = (
            pretest_state.size_upper
            if pretest_state.size_upper is not None
            else req.global_size_max
        )
        sat_lower = (
            pretest_state.saturation_lower
            if pretest_state.saturation_lower is not None
            else req.global_sat_min
        )
        sat_upper = (
            pretest_state.saturation_upper
            if pretest_state.saturation_upper is not None
            else req.global_sat_max
        )
    else:
        size_lower, size_upper, sat_lower, sat_upper = _manual_bounds(req)
        snapshots.append(Snapshot(
            step=0,
            phase="main",
            trial_count=0,
        ))

    final_bounds = {
        "size_lower": round(size_lower, 2),
        "size_upper": round(size_upper, 2),
        "saturation_lower": round(sat_lower, 4),
        "saturation_upper": round(sat_upper, 4),
    }

    # ── Main algorithm phase ─────────────────────────────────────────────────
    algo_state = AlgorithmState(
        (size_lower, size_upper),
        (sat_lower, sat_upper),
    )

    main_trial_count = 0

    for i in range(req.main_iterations):
        combination, selected_rect = get_next_combination(algo_state)
        if not combination:
            warnings.append(f"Main algorithm: no valid combination at iteration {i}")
            break

        ts = combination["triangle_size"]
        sat = combination["saturation"]
        prob = compute_probability(model_dict, ts, sat)
        success = random.random() < prob

        algo_state = update_state(
            algo_state,
            selected_rect,
            combination,
            success,
            success_rate_threshold=req.success_rate_threshold,
            total_samples_threshold=req.total_samples_threshold,
            max_samples=req.max_samples_before_split,
        )

        main_trial_count += 1

        all_trials.append(TrialInfo(
            triangle_size=ts,
            saturation=sat,
            success=success,
            probability=round(prob, 4),
            phase="main",
        ))

        # Snapshot at intervals
        if main_trial_count % req.main_snapshot_interval == 0:
            snapshots.append(Snapshot(
                step=len(snapshots),
                phase="main",
                trial_count=pretest_trial_count + main_trial_count,
                pretest_summary=_pretest_summary(pretest_state) if pretest_state else None,
                rectangles=_rects_info(algo_state),
                trials=list(all_trials),
                completed_probes=list(pretest_state.completed_probes) if pretest_state else [],
            ))

    # Final snapshot if not already at interval boundary
    if main_trial_count % req.main_snapshot_interval != 0:
        snapshots.append(Snapshot(
            step=len(snapshots),
            phase="main",
            trial_count=pretest_trial_count + main_trial_count,
            pretest_summary=_pretest_summary(pretest_state) if pretest_state else None,
            rectangles=_rects_info(algo_state),
            trials=list(all_trials),
            completed_probes=list(pretest_state.completed_probes) if pretest_state else [],
        ))

    return SimulateResponse(
        ground_truth_heatmap=heatmap,
        snapshots=snapshots,
        total_trials=pretest_trial_count + main_trial_count,
        pretest_trials=pretest_trial_count,
        main_trials=main_trial_count,
        final_bounds=final_bounds,
        warnings=warnings,
    )


@router.post("/smooth-heatmap", response_model=SmoothHeatmapResponse)
def smooth_heatmap(req: SmoothHeatmapRequest, db: Session = Depends(get_db)):
    """Compute analysis-style soft-brush heatmap + MSE*100 score for tuning."""
    _validate_bounds(
        req.size_min,
        req.size_max,
        req.sat_min,
        req.sat_max,
        prefix="inspection",
    )

    model_dict = _resolve_model(req.model_name, db)
    if model_dict is None:
        raise HTTPException(status_code=404, detail=f"Unknown model: {req.model_name}")

    return _build_smoothed_heatmap(
        model_dict,
        req.trials,
        size_min=req.size_min,
        size_max=req.size_max,
        sat_min=req.sat_min,
        sat_max=req.sat_max,
        steps=req.steps,
        inner_radius=req.inner_radius,
        outer_radius=req.outer_radius,
        include_heatmap=req.include_heatmap,
    )


@router.post("/compare-shifted-models", response_model=CompareShiftedModelsResponse)
def compare_shifted_models(
    req: CompareShiftedModelsRequest,
    db: Session = Depends(get_db),
):
    """Compare baseline model vs shifted variants on observed trial outcomes."""
    _validate_bounds(
        req.size_min,
        req.size_max,
        req.sat_min,
        req.sat_max,
        prefix="inspection",
    )

    model_dict = _resolve_model(req.model_name, db)
    if model_dict is None:
        raise HTTPException(status_code=404, detail=f"Unknown model: {req.model_name}")

    return _compare_shifted_models(model_dict, req)


@router.post("/discrimination-experiment", response_model=DiscriminationExperimentResponse)
def discrimination_experiment(
    req: DiscriminationExperimentRequest,
    db: Session = Depends(get_db),
):
    """Run repeated baseline vs shifted-model simulations and compare estimations."""
    model_dict = _resolve_model(req.simulation.model_name, db)
    if model_dict is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown model: {req.simulation.model_name}",
        )
    return _run_discrimination_experiment(req, model_dict)
