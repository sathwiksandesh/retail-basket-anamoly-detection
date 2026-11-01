"""Service layer between the FastAPI routes and the existing ``src`` pipeline.

Nothing in ``src`` is modified. This module holds the in-memory state (datasets and
analysis runs), calls ``run_detectors`` and shapes results for the React frontend.
"""
from __future__ import annotations

import copy
import io
import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN

from src.anomaly_scoring import run_detectors
from src.config import load_config
from src.dbscan_model import k_distance_curve
from src.dimensionality import FEATURE_COLUMNS, prepare_features
from src.synthetic_generator import inject_synthetic_anomalies

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "configs" / "config.yaml"
SAMPLE_ID = "sample"
MAX_ANALYSIS_ROWS = 50_000
MAX_UPLOAD_ROWS = 200_000
MODELS = {
    "dbscan": "DBSCAN",
    "hdbscan": "HDBSCAN",
    "isolation_forest": "Isolation Forest",
    "local_outlier_factor": "Local Outlier Factor",
}
REQUIRED_COLUMNS = ["order_id", *FEATURE_COLUMNS]
WARNING = (
    "A flagged basket is a lead for human review, not proof of wrongdoing. Accuracy figures "
    "measure recovery of injected synthetic anomalies, not real-world fraud detection. "
    "Instacart has no prices, store IDs or calendar dates."
)
DEVIATION_FEATURES = [
    "item_count", "unique_departments", "unique_aisles", "reorder_ratio", "rare_item_count",
    "mean_item_rarity", "days_since_prior_order", "order_hour_of_day", "order_number",
]


# ---------------------------------------------------------------- helpers
def clean(value):
    """Make numpy/pandas scalars JSON safe (NaN and inf become null)."""
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return float(value) if np.isfinite(value) else None
    return value


def records(frame: pd.DataFrame) -> list[dict]:
    return [{k: clean(v) for k, v in row.items()} for row in frame.to_dict("records")]


def split_reasons(text) -> list[str]:
    if not isinstance(text, str) or not text:
        return []
    return [part.strip() for part in text.split(";") if part.strip()]


# ---------------------------------------------------------------- state
@dataclass
class Dataset:
    id: str
    name: str
    frame: pd.DataFrame
    builtin: bool = False

    @property
    def labeled(self) -> bool:
        return "is_anomaly" in self.frame.columns


@dataclass
class Run:
    id: str
    dataset_id: str
    dataset_name: str
    scored: pd.DataFrame
    X: np.ndarray
    metrics: pd.DataFrame | None
    params: dict
    runtime_seconds: float
    created_at: str
    labeled: bool
    sensitivity: list[dict] | None = None
    kdistance: list[float] | None = None
    review_fraction: float = 0.05


class Store:
    def __init__(self) -> None:
        self.datasets: dict[str, Dataset] = {}
        self.runs: dict[str, Run] = {}
        self.current: str | None = None
        self.lock = threading.Lock()          # one analysis at a time
        self._cache_lock = threading.Lock()

    @property
    def run(self) -> Run | None:
        return self.runs.get(self.current) if self.current else None


STORE = Store()


def _base_config() -> dict:
    return load_config(CONFIG_PATH)


def _matrix(frame: pd.DataFrame, label_col: str = "is_anomaly", pca_components: int = 0) -> np.ndarray:
    """Rebuild the model input matrix the same way ``run_detectors`` does (scaler fit on non-anomalies)."""
    reference = frame.loc[frame[label_col].astype(int) == 0] if label_col in frame else frame
    _, scaler, pca, cols = prepare_features(reference, pca_components=pca_components)
    X, _, _, _ = prepare_features(frame, feature_columns=cols, fit=False, scaler=scaler, pca=pca)
    return X


def bootstrap() -> None:
    """Register the bundled sample and load the last pipeline run from disk, if present."""
    features_path = ROOT / "data" / "processed" / "basket_features.csv"
    if features_path.exists():
        frame = pd.read_csv(features_path)
        STORE.datasets[SAMPLE_ID] = Dataset(
            SAMPLE_ID, "Instacart sample (bundled)", frame, builtin=True
        )
    results_path = ROOT / "data" / "processed" / "anomaly_results.csv"
    if not results_path.exists():
        return
    scored = pd.read_csv(results_path)
    cfg = _base_config()
    metrics_path = ROOT / "reports" / "evaluation_results.csv"
    metrics = pd.read_csv(metrics_path) if metrics_path.exists() else None
    summary_path = ROOT / "data" / "processed" / "pipeline_summary.json"
    runtime = 0.0
    if summary_path.exists():
        runtime = float(json.loads(summary_path.read_text(encoding="utf-8")).get("runtime_seconds", 0.0))
    sens_path = ROOT / "reports" / "dbscan_sensitivity.csv"
    sensitivity = pd.read_csv(sens_path).to_dict("records") if sens_path.exists() else None
    pipeline_params = _params_from_config(cfg)
    pipeline_params.update(sample_size=len(scored), review_fraction=0.05, inject_synthetic=True)
    run = Run(
        id="pipeline",
        dataset_id=SAMPLE_ID,
        dataset_name="Instacart sample (bundled)",
        scored=scored,
        X=_matrix(scored),
        metrics=metrics,
        params=pipeline_params,
        runtime_seconds=runtime,
        created_at=datetime.fromtimestamp(results_path.stat().st_mtime, tz=timezone.utc).isoformat(),
        labeled="is_anomaly" in scored.columns,
        sensitivity=[{k: clean(v) for k, v in row.items()} for row in sensitivity] if sensitivity else None,
    )
    STORE.runs[run.id] = run
    STORE.current = run.id


def _params_from_config(cfg: dict) -> dict:
    db = cfg.get("clustering", {}).get("dbscan", {})
    hb = cfg.get("clustering", {}).get("hdbscan", {})
    return {
        "dbscan_eps": float(db.get("eps", 0.7)),
        "dbscan_min_samples": int(db.get("min_samples", 10)),
        "hdbscan_min_cluster_size": int(hb.get("min_cluster_size", 20)),
        "hdbscan_min_samples": int(hb.get("min_samples", 10)),
        "contamination": float(cfg.get("synthetic", {}).get("contamination_rate", 0.02)),
    }


# ---------------------------------------------------------------- datasets
def validate_upload(raw: bytes, filename: str) -> dict:
    try:
        frame = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:  # noqa: BLE001 - surface any parse problem to the user
        return {"ok": False, "filename": filename, "error": f"Could not read the file as CSV: {exc}"}
    if len(frame) > MAX_UPLOAD_ROWS:
        return {"ok": False, "filename": filename, "error": f"File has {len(frame):,} rows; the limit is {MAX_UPLOAD_ROWS:,}."}
    missing = [c for c in REQUIRED_COLUMNS if c not in frame.columns]
    result = {
        "ok": not missing, "filename": filename, "rows": int(len(frame)),
        "missing_columns": missing, "required_columns": REQUIRED_COLUMNS,
        "labeled": "is_anomaly" in frame.columns, "dataset": None,
    }
    if missing:
        result["error"] = f"Missing {len(missing)} required column(s): {', '.join(missing)}."
        return result
    before = len(frame)
    for col in REQUIRED_COLUMNS:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame.dropna(subset=["order_id"]).drop_duplicates(subset=["order_id"]).reset_index(drop=True)
    result["rows_dropped"] = int(before - len(frame))
    result["null_counts"] = {c: int(frame[c].isna().sum()) for c in REQUIRED_COLUMNS if frame[c].isna().any()}
    if len(frame) < 500:
        result.update(ok=False, error="At least 500 valid baskets are needed for density-based clustering.")
        return result
    frame["order_id"] = frame["order_id"].astype("int64")
    dataset = Dataset(uuid.uuid4().hex[:8], filename, frame)
    STORE.datasets[dataset.id] = dataset
    result["rows"] = int(len(frame))
    result["dataset"] = dataset_info(dataset)
    result["preview"] = records(frame.head(8)[REQUIRED_COLUMNS])
    return result


def dataset_info(ds: Dataset) -> dict:
    return {"id": ds.id, "name": ds.name, "rows": int(len(ds.frame)), "labeled": ds.labeled, "builtin": ds.builtin}


def dataset_preview(ds: Dataset) -> list[dict]:
    return records(ds.frame.head(8)[[c for c in REQUIRED_COLUMNS if c in ds.frame.columns]])


# ---------------------------------------------------------------- analysis
def run_analysis(params: dict) -> Run:
    ds = STORE.datasets.get(params["dataset_id"])
    if ds is None:
        raise KeyError(f"Unknown dataset {params['dataset_id']!r}")
    frame = ds.frame.copy()
    n_rows = len(frame)
    sample_size = int(params.get("sample_size") or min(n_rows, 20_000))
    sample_size = min(sample_size, n_rows, MAX_ANALYSIS_ROWS)
    if sample_size < 500:
        raise ValueError("Sample size must be at least 500 baskets.")
    if sample_size < n_rows:
        frame = frame.sample(n=sample_size, random_state=42).sort_values("order_id").reset_index(drop=True)

    inject = params.get("inject_synthetic")
    if inject is None:
        inject = ds.builtin
    if inject:
        frame = inject_synthetic_anomalies(frame.drop(columns=["is_anomaly"], errors="ignore"),
                                           float(params["contamination"]), 42)
    elif "is_anomaly" not in frame.columns:
        frame["is_anomaly"] = 0
    labeled = bool(frame["is_anomaly"].sum() > 0)

    cfg = copy.deepcopy(_base_config())
    cfg["clustering"]["dbscan"].update(eps=params["dbscan_eps"], min_samples=params["dbscan_min_samples"])
    cfg["clustering"]["hdbscan"].update(min_cluster_size=params["hdbscan_min_cluster_size"],
                                        min_samples=params["hdbscan_min_samples"])
    if params["hdbscan_min_cluster_size"] >= sample_size:
        raise ValueError("HDBSCAN minimum cluster size must be smaller than the sample size.")

    started = time.time()
    scored, metrics, _kdist, _ = run_detectors(frame, cfg)
    runtime = round(time.time() - started, 2)

    fraction = float(params["review_fraction"])
    scored["review_status"] = np.where(scored["review_rank_pct"] >= 1 - fraction, "Needs Review", "Monitor")

    run = Run(
        id=uuid.uuid4().hex[:8], dataset_id=ds.id, dataset_name=ds.name, scored=scored,
        X=_matrix(scored), metrics=metrics if labeled else None,
        params={**params, "sample_size": sample_size, "inject_synthetic": bool(inject)},
        runtime_seconds=runtime, created_at=datetime.now(timezone.utc).isoformat(),
        labeled=labeled, review_fraction=fraction,
    )
    STORE.runs[run.id] = run
    STORE.current = run.id
    return run


def get_sensitivity(run: Run) -> list[dict]:
    with STORE._cache_lock:
        if run.sensitivity is None:
            mask = run.scored["is_anomaly"].to_numpy() == 0
            X_ref = run.X[mask]
            base_eps = float(run.params["dbscan_eps"])
            min_samples = int(run.params["dbscan_min_samples"])
            rows = []
            for mult in (0.7, 0.85, 1.0, 1.15, 1.3):
                labels = DBSCAN(eps=base_eps * mult, min_samples=min_samples, n_jobs=-1).fit_predict(X_ref)
                rows.append({"eps": base_eps * mult, "min_samples": min_samples,
                             "clusters": len(set(labels)) - int(-1 in labels),
                             "noise_rate": float((labels == -1).mean())})
            run.sensitivity = rows
        return run.sensitivity


def get_kdistance(run: Run, points: int = 250) -> list[float]:
    with STORE._cache_lock:
        if run.kdistance is None:
            curve = k_distance_curve(run.X, k=10)
            idx = np.linspace(0, len(curve) - 1, min(points, len(curve))).astype(int)
            run.kdistance = [round(float(curve[i]), 4) for i in idx]
        return run.kdistance


# ---------------------------------------------------------------- views
def summary(run: Run) -> dict:
    df = run.scored
    flagged = df["review_status"] == "Needs Review"
    out = {
        "run_id": run.id, "dataset_name": run.dataset_name, "created_at": run.created_at,
        "baskets": int(len(df)), "flagged": int(flagged.sum()), "flag_rate": float(flagged.mean()),
        "runtime_seconds": run.runtime_seconds, "labeled": run.labeled,
        "review_score_source": str(df["review_score_source"].iloc[0]) if len(df) else "",
        "params": run.params, "warning": WARNING,
        "mean_basket_size": float(df["item_count"].mean()),
        "synthetic_anomalies": None, "synthetic_caught": None,
    }
    if run.labeled:
        injected = df["is_anomaly"] == 1
        out["synthetic_anomalies"] = int(injected.sum())
        out["synthetic_caught"] = int((injected & flagged).sum())
    return out


def metrics_view(run: Run) -> dict:
    df = run.scored
    rows = []
    if run.metrics is not None:
        for rec in run.metrics.to_dict("records"):
            key = next(k for k, v in MODELS.items() if v == rec["model"])
            rows.append({**{k: clean(v) for k, v in rec.items()}, "key": key,
                         "flag_rate": float(df[f"{key}_label"].mean())})
    else:
        for key, name in MODELS.items():
            rows.append({"model": name, "key": key, "flag_rate": float(df[f"{key}_label"].mean())})
    return {"labeled": run.labeled, "models": rows, "params": run.params}


def _score_columns(model: str) -> tuple[str, str]:
    if model == "review":
        return "review_score", "review_status"
    if model not in MODELS:
        raise ValueError(f"Unknown model {model!r}")
    return f"{model}_score", f"{model}_label"


def list_baskets(run: Run, model: str, flagged_only: bool, min_score: float, query: str | None,
                 sort: str, descending: bool, limit: int, offset: int) -> dict:
    df = run.scored
    score_col, flag_col = _score_columns(model)
    if model == "review":
        flagged = df[flag_col] == "Needs Review"
    else:
        flagged = df[flag_col] == 1
    mask = pd.Series(True, index=df.index)
    if flagged_only:
        mask &= flagged
    mask &= df[score_col] >= min_score
    if query:
        digits = "".join(ch for ch in query if ch.isdigit())
        if digits:
            mask &= df["order_id"].astype(str).str.contains(digits) | df["user_id"].astype(str).eq(digits)
    sortable = {"score": score_col, "item_count": "item_count", "unique_departments": "unique_departments",
                "reorder_ratio": "reorder_ratio", "days_since_prior_order": "days_since_prior_order",
                "order_id": "order_id"}
    if sort not in sortable:
        raise ValueError(f"Cannot sort by {sort!r}")
    sub = df.loc[mask].assign(_flagged=flagged[mask])
    sub = sub.sort_values([sortable[sort], "order_id"], ascending=[not descending, True])
    total = int(len(sub))
    page = sub.iloc[offset: offset + limit]
    items = []
    for row in page.to_dict("records"):
        items.append({
            "order_id": int(row["order_id"]), "user_id": clean(row.get("user_id")),
            "item_count": clean(row["item_count"]), "unique_departments": clean(row["unique_departments"]),
            "unique_aisles": clean(row["unique_aisles"]), "reorder_ratio": clean(row["reorder_ratio"]),
            "order_dow": clean(row["order_dow"]), "order_hour_of_day": clean(row["order_hour_of_day"]),
            "days_since_prior_order": clean(row["days_since_prior_order"]),
            "score": clean(row[score_col]), "flagged": bool(row["_flagged"]),
            "review_status": row["review_status"],
            "reasons": split_reasons(row.get("review_reasons")),
            "is_anomaly": clean(row["is_anomaly"]) if run.labeled else None,
            "flags": {k: bool(row[f"{k}_label"]) for k in MODELS},
        })
    return {"total": total, "items": items, "model": model, "score_label": "Review priority" if model == "review" else MODELS[model]}


def basket_detail(run: Run, order_id: int) -> dict | None:
    df = run.scored
    hit = df.index[df["order_id"] == order_id]
    if len(hit) == 0:
        return None
    row = df.loc[hit[0]]
    deviations = []
    for col in DEVIATION_FEATURES:
        if col not in df.columns:
            continue
        series = df[col].astype(float)
        value = float(row[col])
        pct = float((series <= value).mean())
        deviations.append({"feature": col, "value": clean(value), "median": clean(series.median()),
                           "p05": clean(series.quantile(0.05)), "p95": clean(series.quantile(0.95)),
                           "percentile": pct, "extremity": abs(pct - 0.5) * 2})
    deviations.sort(key=lambda d: d["extremity"], reverse=True)
    return {
        "order_id": int(row["order_id"]), "user_id": clean(row.get("user_id")),
        "order_number": clean(row["order_number"]), "order_dow": clean(row["order_dow"]),
        "order_hour_of_day": clean(row["order_hour_of_day"]),
        "review_status": row["review_status"], "review_score": clean(row["review_score"]),
        "review_rank_pct": clean(row["review_rank_pct"]),
        "reasons": split_reasons(row.get("review_reasons")),
        "is_anomaly": clean(row["is_anomaly"]) if run.labeled else None,
        "models": [{"key": k, "name": v, "flagged": bool(row[f"{k}_label"]), "score": clean(row[f"{k}_score"])}
                   for k, v in MODELS.items()],
        "deviations": deviations,
        "features": {c: clean(row[c]) for c in FEATURE_COLUMNS if c in df.columns},
    }


BASKET_BINS = [(1, 5), (6, 10), (11, 15), (16, 20), (21, 30), (31, 50), (51, 10_000)]


def overview(run: Run) -> dict:
    df = run.scored
    flagged = df["review_status"] == "Needs Review"

    sizes = []
    for lo, hi in BASKET_BINS:
        m = (df["item_count"] >= lo) & (df["item_count"] <= hi)
        label = f"{lo}+" if hi >= 10_000 else (f"{lo}" if lo == hi else f"{lo}-{hi}")
        sizes.append({"bucket": label, "normal": int((m & ~flagged).sum()), "flagged": int((m & flagged).sum())})

    def by(col: str, values) -> list[dict]:
        out = []
        for v in values:
            m = df[col] == v
            total = int(m.sum())
            out.append({"key": int(v), "total": total, "flagged": int((m & flagged).sum()),
                        "flag_rate": float((m & flagged).sum() / total) if total else 0.0})
        return out

    reason_counts: dict[str, int] = {}
    for text in df.loc[flagged, "review_reasons"]:
        for reason in split_reasons(text):
            reason_counts[reason] = reason_counts.get(reason, 0) + 1
    reasons = [{"reason": k, "count": v} for k, v in sorted(reason_counts.items(), key=lambda kv: -kv[1])]

    rng = np.random.default_rng(7)
    flagged_idx = df.index[flagged].to_numpy()
    normal_idx = df.index[~flagged].to_numpy()
    keep_f = rng.choice(flagged_idx, size=min(len(flagged_idx), 500), replace=False)
    keep_n = rng.choice(normal_idx, size=min(len(normal_idx), 1500), replace=False)
    trace = df.loc[np.concatenate([keep_n, keep_f]), ["order_id", "item_count", "review_score", "review_status"]]
    trace_rows = [{"order_id": int(r.order_id), "item_count": clean(r.item_count), "score": clean(r.review_score),
                   "flagged": r.review_status == "Needs Review"} for r in trace.itertuples()]

    return {"sizes": sizes, "hours": by("order_hour_of_day", range(24)), "weekdays": by("order_dow", range(7)),
            "reasons": reasons, "trace": trace_rows}


def export_csv(run: Run, status: str | None) -> str:
    df = run.scored
    if status:
        df = df[df["review_status"] == status]
    cols = [c for c in ["order_id", "user_id", "item_count", "unique_products", "unique_aisles", "unique_departments",
                        "reorder_ratio", "order_dow", "order_hour_of_day", "days_since_prior_order", "review_score",
                        "review_rank_pct", "review_status", "review_reasons", "hdbscan_label", "dbscan_label",
                        "isolation_forest_label", "local_outlier_factor_label", "is_anomaly"] if c in df.columns]
    return df.sort_values("review_score", ascending=False)[cols].to_csv(index=False)
