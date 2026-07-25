from fastapi import FastAPI

app = FastAPI(title="Patilu API", version="0.0.0")


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "patilu-api"}
