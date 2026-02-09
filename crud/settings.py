import json
from sqlalchemy.orm import Session
from models.settings import Setting
from schemas.settings import PretestSettings

PRETEST_SETTINGS_KEY = "pretest_settings"
CUSTOM_MODELS_KEY = "custom_simulation_models"


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


def get_custom_models(db: Session) -> list:
    setting = db.query(Setting).filter(Setting.key == CUSTOM_MODELS_KEY).first()
    if setting is None:
        return []
    return json.loads(setting.value)


def save_custom_model(db: Session, model_data: dict) -> dict:
    models = get_custom_models(db)
    model = dict(model_data)
    name = model.get("name", "")
    # Replace if exists, otherwise append
    existing_idx = next((i for i, m in enumerate(models) if m["name"] == name), None)
    if existing_idx is not None:
        models[existing_idx] = model
    else:
        models.append(model)

    setting = db.query(Setting).filter(Setting.key == CUSTOM_MODELS_KEY).first()
    value = json.dumps(models)
    if setting is None:
        setting = Setting(key=CUSTOM_MODELS_KEY, value=value)
        db.add(setting)
    else:
        setting.value = value
    db.commit()
    return model


def delete_custom_model(db: Session, name: str) -> bool:
    models = get_custom_models(db)
    filtered = [m for m in models if m["name"] != name]
    if len(filtered) == len(models):
        return False

    setting = db.query(Setting).filter(Setting.key == CUSTOM_MODELS_KEY).first()
    if setting is None:
        return False

    setting.value = json.dumps(filtered)
    db.commit()
    return True
