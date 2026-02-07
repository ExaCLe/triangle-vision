from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from db.database import get_db
from schemas.settings import PretestSettings
from crud.settings import get_pretest_settings, update_pretest_settings
from algorithm_to_find_combinations.ground_truth import SIMULATION_MODELS

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/pretest", response_model=PretestSettings)
def get_settings(db: Session = Depends(get_db)):
    return get_pretest_settings(db)


@router.put("/pretest", response_model=PretestSettings)
def put_settings(settings: PretestSettings, db: Session = Depends(get_db)):
    return update_pretest_settings(db, settings)


@router.get("/simulation-models")
def list_simulation_models():
    """Return available ground-truth simulation models."""
    return [
        {"name": name, "label": entry["label"], "description": entry["description"]}
        for name, entry in SIMULATION_MODELS.items()
    ]


@router.get("/simulation-models/{model_name}/heatmap")
def get_model_heatmap(
    model_name: str,
    steps: int = Query(default=20, ge=2, le=100),
    min_triangle_size: float = Query(default=10),
    max_triangle_size: float = Query(default=400),
    min_saturation: float = Query(default=0),
    max_saturation: float = Query(default=1),
):
    """Return a probability grid for the given model over the parameter space."""
    entry = SIMULATION_MODELS.get(model_name)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_name}")

    prob_fn = entry["probability_fn"]
    bounds = ((min_triangle_size, max_triangle_size), (min_saturation, max_saturation))

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
        "label": entry["label"],
        "description": entry["description"],
        "triangle_sizes": triangle_sizes,
        "saturations": saturations,
        "grid": grid,
    }
