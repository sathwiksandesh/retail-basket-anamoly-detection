# API

FastAPI service that serves the pipeline results to the React frontend and re-runs the detectors on demand. It reuses `src/` unchanged.

Run from the project root:

```powershell
uvicorn api.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

| Endpoint | Purpose |
|---|---|
| `GET /api/summary` | KPIs for the current run |
| `GET /api/overview` | Chart data: score trace, flag reasons, size/hour/day breakdowns |
| `GET /api/metrics` | Per-detector flag rate and precision, recall, F1, AP, ROC-AUC, Precision@K |
| `GET /api/sensitivity` | DBSCAN eps sensitivity and k-distance curve (computed on demand) |
| `GET /api/baskets` | Filterable, sortable, paginated basket list |
| `GET /api/baskets/{order_id}` | One basket: reasons, feature percentiles, per-detector result |
| `PUT /api/baskets/{order_id}/review` | Save a reviewer decision (`confirmed`, `dismissed`, `pending`) and note |
| `GET /api/export` | Review queue as CSV, including reviewer decisions and notes |
| `GET/POST /api/datasets` | List datasets / upload and validate a CSV |
| `POST /api/analyze` | Run all four detectors with the given parameters |

On startup the API loads `data/processed/anomaly_results.csv` and `reports/*.csv`, so run `python -m src.pipeline` once first. Analysis results live in memory; restarting the API returns to the saved pipeline run. Reviewer decisions are saved to `data/processed/review_decisions.json` and survive restarts and re-runs.
