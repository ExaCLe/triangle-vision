import math

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from db.database import get_db
from schemas.settings import PretestSettings
from crud.settings import (
    get_pretest_settings,
    update_pretest_settings,
    get_custom_models,
    save_custom_model,
    delete_custom_model,
)
from algorithm_to_find_combinations.ground_truth import (
    SIMULATION_MODELS,
    model_probability,
    _model_description,
    compute_probability,
    compute_description,
)

router = APIRouter(prefix="/settings", tags=["settings"])


def _resolve_model(name: str, db: Session) -> dict | None:
    """Look up a model by name — built-in first, then saved custom models."""
    if name in SIMULATION_MODELS:
        return SIMULATION_MODELS[name]
    for m in get_custom_models(db):
        if m["name"] == name:
            entry = dict(m)
            entry["label"] = m["name"]
            # Back-compat: old custom models without model_type are polynomial
            entry.setdefault("model_type", "polynomial")
            if entry["model_type"] == "polynomial":
                entry.setdefault("size_scale", 400.0)
                entry.setdefault("sat_scale", 1.0)
            entry["description"] = compute_description(entry)
            return entry
    return None


@router.get("/pretest", response_model=PretestSettings)
def get_settings(db: Session = Depends(get_db)):
    return get_pretest_settings(db)


@router.put("/pretest", response_model=PretestSettings)
def put_settings(settings: PretestSettings, db: Session = Depends(get_db)):
    return update_pretest_settings(db, settings)


@router.get("/simulation-models")
def list_simulation_models(db: Session = Depends(get_db)):
    """Return all available models — built-in + saved custom models."""
    result = []
    for name, entry in SIMULATION_MODELS.items():
        item = {"name": name}
        # Copy all parameter keys from the entry
        for k, v in entry.items():
            item[k] = v
        result.append(item)
    for m in get_custom_models(db):
        item = dict(m)
        item.setdefault("model_type", "polynomial")
        item["label"] = m["name"]
        if item["model_type"] == "polynomial":
            item.setdefault("size_scale", 400.0)
            item.setdefault("sat_scale", 1.0)
        item["description"] = compute_description(item)
        result.append(item)
    return result


@router.get("/simulation-models/{model_name}/heatmap")
def get_model_heatmap(
    model_name: str,
    db: Session = Depends(get_db),
    steps: int = Query(default=20, ge=2, le=500),
    min_triangle_size: float = Query(default=10),
    max_triangle_size: float = Query(default=400),
    min_saturation: float = Query(default=0),
    max_saturation: float = Query(default=1),
):
    """Return a probability grid for the given model over the parameter space.

    Bounds control the viewing range only — probabilities are computed from
    the model's absolute parameters (size_scale, sat_scale).
    Works for both built-in and saved custom models.
    """
    entry = _resolve_model(model_name, db)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_name}")

    ts_range = max_triangle_size - min_triangle_size
    sat_range = max_saturation - min_saturation

    triangle_sizes = [
        round(min_triangle_size + ts_range * i / (steps - 1), 2)
        for i in range(steps)
    ]
    saturations = [
        round(min_saturation + sat_range * i / (steps - 1), 4)
        for i in range(steps)
    ]

    grid = []
    for sat in saturations:
        row = []
        for ts in triangle_sizes:
            p = compute_probability(entry, ts, sat)
            row.append(round(p, 4))
        grid.append(row)

    return {
        "model_name": model_name,
        "label": entry["label"],
        "description": entry["description"],
        "triangle_sizes": triangle_sizes,
        "saturations": saturations,
        "grid": grid,
    }


class CustomModelRequest(BaseModel):
    model_type: str = "polynomial"
    # Polynomial params
    base: float = 0.6
    coefficient: float = 0.39
    exponent: float = 0.5
    size_scale: float = 400.0
    sat_scale: float = 1.0
    # Bandpass params
    ts_low: float = 50.0
    ts_w_low: float = 15.0
    ts_high: float = 300.0
    ts_w_high: float = 15.0
    sat_low: float = 0.2
    sat_w_low: float = 0.05
    sat_high: float = 0.8
    sat_w_high: float = 0.05
    gamma: float = 1.0
    eps_clip: float = 0.01
    # Threshold params
    c_inf: float = 0.12
    c_0: float = 0.95
    ts_50: float = 60.0
    beta: float = 2.0
    k: float = 3.0
    # Grid range
    steps: int = 20
    min_triangle_size: float = 10
    max_triangle_size: float = 400
    min_saturation: float = 0
    max_saturation: float = 1


def _custom_request_to_model_dict(req: CustomModelRequest) -> dict:
    """Build a model dict from a CustomModelRequest."""
    if req.model_type == "bandpass":
        return {
            "model_type": "bandpass",
            "ts_low": req.ts_low, "ts_w_low": req.ts_w_low,
            "ts_high": req.ts_high, "ts_w_high": req.ts_w_high,
            "sat_low": req.sat_low, "sat_w_low": req.sat_w_low,
            "sat_high": req.sat_high, "sat_w_high": req.sat_w_high,
            "gamma": req.gamma, "eps_clip": req.eps_clip,
        }
    if req.model_type == "threshold":
        return {
            "model_type": "threshold",
            "c_inf": req.c_inf, "c_0": req.c_0,
            "ts_50": req.ts_50, "beta": req.beta, "k": req.k,
        }
    return {
        "model_type": "polynomial",
        "base": req.base, "coefficient": req.coefficient,
        "exponent": req.exponent,
        "size_scale": req.size_scale, "sat_scale": req.sat_scale,
    }


@router.post("/simulation-models/custom/heatmap")
def custom_model_heatmap(req: CustomModelRequest):
    """Compute a heatmap for a user-defined model formula.

    Uses absolute per-axis scaling — bounds are only for the grid range.
    """
    steps = max(2, min(500, req.steps))
    ts_range = req.max_triangle_size - req.min_triangle_size
    sat_range = req.max_saturation - req.min_saturation

    triangle_sizes = [
        round(req.min_triangle_size + ts_range * i / (steps - 1), 2)
        for i in range(steps)
    ]
    saturations = [
        round(req.min_saturation + sat_range * i / (steps - 1), 4)
        for i in range(steps)
    ]

    model_dict = _custom_request_to_model_dict(req)
    grid = []
    for sat in saturations:
        row = []
        for ts in triangle_sizes:
            p = compute_probability(model_dict, ts, sat)
            row.append(round(p, 4))
        grid.append(row)

    desc = compute_description(model_dict)
    label = f"Custom ({req.model_type})"
    return {
        "model_name": "custom",
        "label": label,
        "description": desc,
        "triangle_sizes": triangle_sizes,
        "saturations": saturations,
        "grid": grid,
    }


class SaveCustomModelRequest(BaseModel):
    name: str
    model_type: str = "polynomial"
    # Polynomial params
    base: float = 0.6
    coefficient: float = 0.39
    exponent: float = 0.5
    size_scale: float = 400.0
    sat_scale: float = 1.0
    # Bandpass params
    ts_low: float = 50.0
    ts_w_low: float = 15.0
    ts_high: float = 300.0
    ts_w_high: float = 15.0
    sat_low: float = 0.2
    sat_w_low: float = 0.05
    sat_high: float = 0.8
    sat_w_high: float = 0.05
    gamma: float = 1.0
    eps_clip: float = 0.01
    # Threshold params
    c_inf: float = 0.12
    c_0: float = 0.95
    ts_50: float = 60.0
    beta: float = 2.0
    k: float = 3.0


@router.get("/custom-models")
def list_custom_models(db: Session = Depends(get_db)):
    """Return saved custom models."""
    return get_custom_models(db)


@router.post("/custom-models")
def create_custom_model(req: SaveCustomModelRequest, db: Session = Depends(get_db)):
    """Save a custom model."""
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Model name is required")
    if req.model_type == "bandpass":
        model_data = {
            "name": req.name.strip(),
            "model_type": "bandpass",
            "ts_low": req.ts_low, "ts_w_low": req.ts_w_low,
            "ts_high": req.ts_high, "ts_w_high": req.ts_w_high,
            "sat_low": req.sat_low, "sat_w_low": req.sat_w_low,
            "sat_high": req.sat_high, "sat_w_high": req.sat_w_high,
            "gamma": req.gamma, "eps_clip": req.eps_clip,
        }
    elif req.model_type == "threshold":
        model_data = {
            "name": req.name.strip(),
            "model_type": "threshold",
            "c_inf": req.c_inf, "c_0": req.c_0,
            "ts_50": req.ts_50, "beta": req.beta, "k": req.k,
        }
    else:
        model_data = {
            "name": req.name.strip(),
            "model_type": "polynomial",
            "base": req.base, "coefficient": req.coefficient,
            "exponent": req.exponent,
            "size_scale": req.size_scale, "sat_scale": req.sat_scale,
        }
    model = save_custom_model(db, model_data)
    return model


@router.delete("/custom-models/{name}")
def remove_custom_model(name: str, db: Session = Depends(get_db)):
    """Delete a saved custom model."""
    success = delete_custom_model(db, name)
    if not success:
        raise HTTPException(status_code=404, detail="Model not found")
    return {"success": True}
