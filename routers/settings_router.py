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
)

router = APIRouter(prefix="/settings", tags=["settings"])


def _resolve_model(name: str, db: Session) -> dict | None:
    """Look up a model by name — built-in first, then saved custom models."""
    if name in SIMULATION_MODELS:
        return SIMULATION_MODELS[name]
    for m in get_custom_models(db):
        if m["name"] == name:
            return {
                "label": m["name"],
                "base": m["base"],
                "coefficient": m["coefficient"],
                "exponent": m["exponent"],
                "size_scale": m.get("size_scale", 400.0),
                "sat_scale": m.get("sat_scale", 1.0),
                "description": _model_description(
                    m["base"], m["coefficient"], m["exponent"],
                    m.get("size_scale", 400.0), m.get("sat_scale", 1.0),
                ),
            }
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
    result = [
        {
            "name": name,
            "label": entry["label"],
            "description": entry["description"],
            "base": entry["base"],
            "coefficient": entry["coefficient"],
            "exponent": entry["exponent"],
            "size_scale": entry["size_scale"],
            "sat_scale": entry["sat_scale"],
        }
        for name, entry in SIMULATION_MODELS.items()
    ]
    for m in get_custom_models(db):
        result.append({
            "name": m["name"],
            "label": m["name"],
            "description": _model_description(
                m["base"], m["coefficient"], m["exponent"],
                m.get("size_scale", 400.0), m.get("sat_scale", 1.0),
            ),
            "base": m["base"],
            "coefficient": m["coefficient"],
            "exponent": m["exponent"],
            "size_scale": m.get("size_scale", 400.0),
            "sat_scale": m.get("sat_scale", 1.0),
        })
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
            p = model_probability(
                ts, sat,
                entry["base"], entry["coefficient"], entry["exponent"],
                entry["size_scale"], entry["sat_scale"],
            )
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
    base: float = 0.6
    coefficient: float = 0.39
    exponent: float = 0.5
    size_scale: float = 400.0
    sat_scale: float = 1.0
    steps: int = 20
    min_triangle_size: float = 10
    max_triangle_size: float = 400
    min_saturation: float = 0
    max_saturation: float = 1


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

    grid = []
    for sat in saturations:
        row = []
        for ts in triangle_sizes:
            p = model_probability(
                ts, sat,
                req.base, req.coefficient, req.exponent,
                req.size_scale, req.sat_scale,
            )
            row.append(round(p, 4))
        grid.append(row)

    desc = (
        f"{req.base} + {req.coefficient} * "
        f"(((ts/{req.size_scale})² + (sat/{req.sat_scale})²) / 2)^{req.exponent}"
    )
    return {
        "model_name": "custom",
        "label": f"Custom (base {req.base})",
        "description": desc,
        "triangle_sizes": triangle_sizes,
        "saturations": saturations,
        "grid": grid,
    }


class SaveCustomModelRequest(BaseModel):
    name: str
    base: float = 0.6
    coefficient: float = 0.39
    exponent: float = 0.5
    size_scale: float = 400.0
    sat_scale: float = 1.0


@router.get("/custom-models")
def list_custom_models(db: Session = Depends(get_db)):
    """Return saved custom models."""
    return get_custom_models(db)


@router.post("/custom-models")
def create_custom_model(req: SaveCustomModelRequest, db: Session = Depends(get_db)):
    """Save a custom model."""
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Model name is required")
    model = save_custom_model(
        db, req.name.strip(),
        req.base, req.coefficient, req.exponent,
        req.size_scale, req.sat_scale,
    )
    return model


@router.delete("/custom-models/{name}")
def remove_custom_model(name: str, db: Session = Depends(get_db)):
    """Delete a saved custom model."""
    success = delete_custom_model(db, name)
    if not success:
        raise HTTPException(status_code=404, detail="Model not found")
    return {"success": True}
