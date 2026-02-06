from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db.database import get_db
from models.settings import PretestSettings
from crud.settings import get_pretest_settings, update_pretest_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/pretest", response_model=PretestSettings)
def get_settings(db: Session = Depends(get_db)):
    return get_pretest_settings(db)


@router.put("/pretest", response_model=PretestSettings)
def put_settings(settings: PretestSettings, db: Session = Depends(get_db)):
    return update_pretest_settings(db, settings)
