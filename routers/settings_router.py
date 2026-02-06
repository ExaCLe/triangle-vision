from fastapi import APIRouter, Depends
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
