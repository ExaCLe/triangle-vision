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
from algorithm_to_find_combinations.ground_truth import SIMULATION_MODELS

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/pretest", response_model=PretestSettings)
def get_settings(db: Session = Depends(get_db)):
    return get_pretest_settings(db)


@router.put("/pretest", response_model=PretestSettings)
def put_settings(settings: PretestSettings, db: Session = Depends(get_db)):
    return update_pretest_settings(db, settings)


@router.get("/simulation-models")
def list_simulation_models(db: Session = Depends(get_db)):
    """Return available ground-truth simulation models, including saved custom models."""
    models = [
        {"name": name, "label": entry["label"], "description": entry["description"]}
        for name, entry in SIMULATION_MODELS.items()
    ]
    # Add saved custom models
    custom_models = get_custom_models(db)
    for cm in custom_models:
        desc = f"{cm['base']} + {cm['coefficient']} * ((ts² + sat²) / 2)^{cm['exponent']}"
        models.append({
            "name": f"custom:{cm['name']}",
            "label": f"Custom: {cm['name']}",
            "description": desc,
        })
    return models


@router.get("/simulation-models/{model_name}/heatmap")
def get_model_heatmap(
    model_name: str,
    steps: int = Query(default=50, ge=2, le=100),
    min_triangle_size: float = Query(default=10),
    max_triangle_size: float = Query(default=400),
    min_saturation: float = Query(default=0),
    max_saturation: float = Query(default=1),
    db: Session = Depends(get_db),
):
    """Return a probability grid for the given model over the parameter space."""
    bounds = ((min_triangle_size, max_triangle_size), (min_saturation, max_saturation))

    # Check if it's a custom model
    if model_name.startswith("custom:"):
        custom_name = model_name[7:]  # Remove "custom:" prefix
        custom_models = get_custom_models(db)
        custom_model = next((m for m in custom_models if m["name"] == custom_name), None)
        if custom_model is None:
            raise HTTPException(status_code=404, detail=f"Unknown custom model: {custom_name}")

        # Use custom model parameters
        base = custom_model["base"]
        coefficient = custom_model["coefficient"]
        exponent = custom_model["exponent"]
        prob_fn = lambda ts, sat, bounds: _custom_probability(ts, sat, bounds, base, coefficient, exponent)
        label = f"Custom: {custom_name}"
        description = f"{base} + {coefficient} * ((ts² + sat²) / 2)^{exponent}"
    else:
        # Built-in model
        entry = SIMULATION_MODELS.get(model_name)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"Unknown model: {model_name}")
        prob_fn = entry["probability_fn"]
        label = entry["label"]
        description = entry["description"]

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
            p = prob_fn(ts, sat, bounds)
            row.append(round(p, 4))
        grid.append(row)

    return {
        "model_name": model_name,
        "label": label,
        "description": description,
        "triangle_sizes": triangle_sizes,
        "saturations": saturations,
        "grid": grid,
    }


class CustomModelRequest(BaseModel):
    base: float = 0.6
    coefficient: float = 0.39
    exponent: float = 0.5
    steps: int = 50
    min_triangle_size: float = 10
    max_triangle_size: float = 400
    min_saturation: float = 0
    max_saturation: float = 1


def _custom_probability(ts, sat, bounds, base, coefficient, exponent):
    """Evaluate base + coefficient * ((ts_scaled^2 + sat_scaled^2) / 2)^exponent."""
    ts_range = bounds[0][1] - bounds[0][0]
    sat_range = bounds[1][1] - bounds[1][0]
    ts_s = (ts - bounds[0][0]) / ts_range if ts_range else 0
    sat_s = (sat - bounds[1][0]) / sat_range if sat_range else 0
    raw = (ts_s ** 2 + sat_s ** 2) / 2.0
    return min(1.0, max(0.0, base + coefficient * math.pow(raw, exponent)))


@router.post("/simulation-models/custom/heatmap")
def custom_model_heatmap(req: CustomModelRequest):
    """Compute a heatmap for a user-defined model formula."""
    steps = max(2, min(100, req.steps))
    bounds = (
        (req.min_triangle_size, req.max_triangle_size),
        (req.min_saturation, req.max_saturation),
    )
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
            p = _custom_probability(
                ts, sat, bounds, req.base, req.coefficient, req.exponent
            )
            row.append(round(p, 4))
        grid.append(row)

    desc = f"{req.base} + {req.coefficient} * ((ts² + sat²) / 2)^{req.exponent}"
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


@router.get("/custom-models")
def list_custom_models(db: Session = Depends(get_db)):
    """Return saved custom models."""
    return get_custom_models(db)


@router.post("/custom-models")
def create_custom_model(req: SaveCustomModelRequest, db: Session = Depends(get_db)):
    """Save a custom model."""
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Model name is required")
    model = save_custom_model(db, req.name.strip(), req.base, req.coefficient, req.exponent)
    return model


@router.delete("/custom-models/{name}")
def remove_custom_model(name: str, db: Session = Depends(get_db)):
    """Delete a saved custom model."""
    success = delete_custom_model(db, name)
    if not success:
        raise HTTPException(status_code=404, detail="Model not found")
    return {"success": True}
