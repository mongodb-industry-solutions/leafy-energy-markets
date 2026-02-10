from fastapi import FastAPI
from app.api import commands, queries

app = FastAPI()

app.include_router(commands.router, prefix="/api")
app.include_router(queries.router, prefix="/api")

@app.get("/")
def read_root():
    return {"Hello": "World"}
