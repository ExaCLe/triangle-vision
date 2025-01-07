from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from db.database import engine
from models.test import Base
from routers import test_router

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.mount("/static", StaticFiles(directory="frontend/build"), name="static")
app.include_router(test_router.router)


@app.get("/")
def read_root():
    return {"Hello": "World"}
