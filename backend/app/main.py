from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import commands, queries, telemetry

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(commands.router, prefix="/api")
app.include_router(queries.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")

@app.get("/")
def read_root():
    return {"Hello": "World"}
