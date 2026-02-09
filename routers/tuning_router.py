"""Algorithm tuning simulation endpoint.

Runs pretest + main algorithm entirely in-memory against a ground-truth model,
producing snapshots the frontend can scrub through to visualise algorithm
progress vs ground truth.
"""

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


class SmoothHeatmapResponse(BaseModel):
    heatmap: dict
    error_score: Optional[float] = None


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

    inner_radius, outer_radius = get_scaled_radii((triangle_bounds, saturation_bounds))
    params = {"inner_radius": inner_radius, "outer_radius": outer_radius}

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

    z_display = np.nan_to_num(Z_s, nan=0.25)
    triangle_sizes = [round(float(v), 2) for v in X_s[0, :].tolist()]
    saturations = [round(float(v), 4) for v in Y_s[:, 0].tolist()]
    grid = [[round(float(v), 4) for v in row] for row in z_display.tolist()]

    return SmoothHeatmapResponse(
        heatmap={
            "triangle_sizes": triangle_sizes,
            "saturations": saturations,
            "grid": grid,
        },
        error_score=round(mse * 100.0, 6),
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
    )
