from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from db.database import engine
from models.test import Base
from routers import test_router, test_combination_router
import os
from fastapi.middleware.cors import CORSMiddleware

Base.metadata.create_all(bind=engine)

app = FastAPI()

origins = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="frontend/build"), name="static")
app.include_router(test_router.router)
app.include_router(test_combination_router.router)


@app.get("/")
def read_root():
    return {"Hello": "World"}
