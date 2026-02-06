import os
import sys
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import inspect, text
from db.database import engine
from models.test import Base
from models.settings import Setting  # Ensure settings table is created
from routers import test_router, test_combination_router
from routers import settings_router, run_router
from fastapi.middleware.cors import CORSMiddleware

# Initialize the database
Base.metadata.create_all(bind=engine)

# Migration: add new columns to existing tables if missing
inspector = inspect(engine)
if "test_combinations" in inspector.get_table_names():
    existing_columns = {col["name"] for col in inspector.get_columns("test_combinations")}
    with engine.connect() as conn:
        if "run_id" not in existing_columns:
            conn.execute(text("ALTER TABLE test_combinations ADD COLUMN run_id INTEGER REFERENCES runs(id)"))
            conn.commit()
        if "phase" not in existing_columns:
            conn.execute(text("ALTER TABLE test_combinations ADD COLUMN phase VARCHAR DEFAULT 'main'"))
            conn.commit()

app = FastAPI()

# CORS configuration
origins = ["http://localhost:3000", "http://localhost:8000", "http://127.0.0.1:8000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# First, mount the API routes with a prefix
app.include_router(test_router.router, prefix="/api")
app.include_router(test_combination_router.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(run_router.router, prefix="/api")

# Determine the absolute path to the frontend build
if getattr(sys, "frozen", False):
    # If the application is run as a bundle (PyInstaller)
    base_path = sys._MEIPASS  # type: ignore
else:
    # If the application is run normally
    base_path = os.path.dirname(os.path.abspath(__file__))

frontend_build_dir = os.path.join(base_path, "frontend", "build")

# Serve static files from the build directory
app.mount(
    "/static",
    StaticFiles(directory=os.path.join(frontend_build_dir, "static")),
    name="static",
)


@app.get("/{full_path:path}")
async def serve_react(full_path: str):
    if full_path.startswith("api/"):
        return {"detail": "Not Found"}
    return FileResponse(os.path.join(frontend_build_dir, "index.html"))
