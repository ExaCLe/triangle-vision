import os
import sys
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from db.database import engine
from models.test import Base
from routers import test_router, test_combination_router
from fastapi.middleware.cors import CORSMiddleware

# Initialize the database
Base.metadata.create_all(bind=engine)

app = FastAPI()

# CORS configuration
origins = ["http://localhost:3000", "http://localhost:8000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Determine the absolute path to the frontend build
if getattr(sys, "frozen", False):
    # If the application is run as a bundle (PyInstaller)
    base_path = sys._MEIPASS
else:
    # If the application is run normally
    base_path = os.path.dirname(os.path.abspath(__file__))

frontend_build_dir = os.path.join(base_path, "frontend", "build")

# Mount static files
app.mount("/static", StaticFiles(directory=frontend_build_dir), name="static")

# Include routers
app.include_router(test_router.router)
app.include_router(test_combination_router.router)


@app.get("/")
def read_root():
    return {"Hello": "World"}
