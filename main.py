from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

app.mount("/static", StaticFiles(directory="frontend/build"), name="static")


@app.get("/")
def read_root():
    return {"Hello": "World"}
