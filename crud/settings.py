import json
from sqlalchemy.orm import Session
from models.settings import Setting
from schemas.settings import PretestSettings

PRETEST_SETTINGS_KEY = "pretest_settings"


def get_pretest_settings(db: Session) -> PretestSettings:
    setting = db.query(Setting).filter(Setting.key == PRETEST_SETTINGS_KEY).first()
    if setting is None:
        return PretestSettings()
    return PretestSettings.model_validate_json(setting.value)


def update_pretest_settings(db: Session, settings: PretestSettings) -> PretestSettings:
    setting = db.query(Setting).filter(Setting.key == PRETEST_SETTINGS_KEY).first()
    value = settings.model_dump_json()
    if setting is None:
        setting = Setting(key=PRETEST_SETTINGS_KEY, value=value)
        db.add(setting)
    else:
        setting.value = value
    db.commit()
    db.refresh(setting)
    return PretestSettings.model_validate_json(setting.value)
