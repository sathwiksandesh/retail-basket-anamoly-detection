"""FastAPI backend for the basket anomaly review dashboard.

Run from the project root so ``src`` is importable:

    uvicorn api.main:app --reload --port 8000
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from api import service
from api.service import STORE


@asynccontextmanager
async def lifespan(_: FastAPI):
    service.bootstrap()
    yield


app = FastAPI(title="Retail Basket Anomaly API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    dataset_id: str = service.SAMPLE_ID
    sample_size: int | None = Field(None, ge=500, le=service.MAX_ANALYSIS_ROWS)
    inject_synthetic: bool | None = Field(
        None, description="Inject labelled synthetic anomalies. Defaults to true for the bundled sample."
    )
    contamination: float = Field(0.02, ge=0.005, le=0.10)
    dbscan_eps: float = Field(0.7, gt=0.05, le=5.0)
    dbscan_min_samples: int = Field(10, ge=2, le=100)
    hdbscan_min_cluster_size: int = Field(20, ge=2, le=500)
    hdbscan_min_samples: int = Field(10, ge=1, le=100)
    review_fraction: float = Field(0.05, ge=0.01, le=0.20)


def current_run() -> service.Run:
    run = STORE.run
    if run is None:
        raise HTTPException(404, "No analysis has been run yet. POST /api/analyze first.")
    return run


@app.get("/api/health")
def health():
    return {"status": "ok", "has_run": STORE.run is not None, "datasets": len(STORE.datasets)}


@app.get("/api/summary")
def get_summary():
    return service.summary(current_run())


@app.get("/api/overview")
def get_overview():
    return service.overview(current_run())


@app.get("/api/metrics")
def get_metrics():
    return service.metrics_view(current_run())


@app.get("/api/sensitivity")
def get_sensitivity():
    run = current_run()
    return {"rows": service.get_sensitivity(run), "kdistance": service.get_kdistance(run),
            "eps": run.params["dbscan_eps"]}


@app.get("/api/baskets")
def get_baskets(
    model: Literal["review", "dbscan", "hdbscan", "isolation_forest", "local_outlier_factor"] = "review",
    flagged_only: bool = True,
    min_score: float = Query(0.0, ge=0.0),
    q: str | None = None,
    sort: str = "score",
    descending: bool = True,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    try:
        return service.list_baskets(current_run(), model, flagged_only, min_score, q, sort, descending, limit, offset)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/baskets/{order_id}")
def get_basket(order_id: int):
    detail = service.basket_detail(current_run(), order_id)
    if detail is None:
        raise HTTPException(404, f"Basket {order_id} is not in the current run.")
    return detail


@app.get("/api/export")
def export(status: Literal["Needs Review", "Monitor"] | None = "Needs Review"):
    body = service.export_csv(current_run(), status)
    name = "review_queue.csv" if status == "Needs Review" else "all_baskets.csv"
    return Response(body, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.get("/api/datasets")
def list_datasets():
    return {
        "datasets": [service.dataset_info(d) for d in STORE.datasets.values()],
        "required_columns": service.REQUIRED_COLUMNS,
        "preview": {d.id: service.dataset_preview(d) for d in STORE.datasets.values() if d.builtin},
    }


@app.post("/api/datasets")
async def upload_dataset(file: UploadFile = File(...)):
    raw = await file.read()
    if len(raw) > 60 * 1024 * 1024:
        raise HTTPException(413, "File is larger than 60 MB.")
    return service.validate_upload(raw, file.filename or "upload.csv")


@app.post("/api/analyze")
def analyze(request: AnalyzeRequest):
    """Run all four detectors with the given parameters and make the result the current run."""
    if request.dataset_id not in STORE.datasets:
        raise HTTPException(404, f"Unknown dataset {request.dataset_id!r}.")
    if not STORE.lock.acquire(blocking=False):
        raise HTTPException(409, "Another analysis is still running. Try again when it finishes.")
    try:
        run = service.run_analysis(request.model_dump())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        STORE.lock.release()
    return {"summary": service.summary(run), "metrics": service.metrics_view(run)}
