"""Run density-based detectors and baselines on labeled synthetic data."""
import numpy as np
import pandas as pd
from src.dimensionality import prepare_features
from src.dbscan_model import fit_dbscan, k_distance_curve
from src.hdbscan_model import fit_hdbscan
from src.baselines import run_baselines
from src.evaluation import evaluate_scores
from src.explain import explain_row

def run_detectors(frame, config):
    label_col = config.get("evaluation", {}).get("anomaly_label_column", "is_anomaly")
    if label_col not in frame:
        raise ValueError(f"Expected synthetic label column {label_col!r}. Run the pipeline first.")
    # Fit preprocessing only on unmodified reference baskets to avoid allowing injected
    # anomalies to influence scaling/PCA. Transform the full evaluation frame afterward.
    reference = frame.loc[frame[label_col].astype(int) == 0]
    if reference.empty:
        raise ValueError("Synthetic evaluation set has no reference (non-anomaly) baskets")
    _, scaler, pca, feature_cols = prepare_features(reference, pca_components=int(config.get("dimensionality", {}).get("pca_components", 0)))
    X, _, _, _ = prepare_features(frame, feature_columns=feature_cols, fit=False, scaler=scaler, pca=pca)
    contamination = float(frame[label_col].mean())
    rows, scores_by_model = [], {}
    db_cfg = config.get("clustering", {}).get("dbscan", {})
    _, labels, scores = fit_dbscan(X, db_cfg.get("eps", 0.7), db_cfg.get("min_samples", 10))
    scores_by_model["DBSCAN"] = scores
    rows.append({"model": "DBSCAN", "labels": labels, "scores": scores})
    hb_cfg = config.get("clustering", {}).get("hdbscan", {})
    _, labels, scores = fit_hdbscan(X, hb_cfg.get("min_cluster_size", 20), hb_cfg.get("min_samples", 10), hb_cfg.get("cluster_selection_method", "eom"))
    scores_by_model["HDBSCAN"] = scores
    rows.append({"model": "HDBSCAN", "labels": labels, "scores": scores})
    for name, result in run_baselines(X, contamination=max(0.001, contamination), random_state=int(config.get("project", {}).get("random_seed", 42))).items():
        scores_by_model[name] = result["scores"]
        rows.append({"model": name, "labels": result["labels"], "scores": result["scores"]})
    y = frame[label_col].astype(int).to_numpy()
    metrics = []
    scored = frame.copy()
    scored["is_anomaly"] = y
    for item in rows:
        predicted_anomaly = (np.asarray(item["labels"]) == -1).astype(int) if item["model"] in ("DBSCAN", "HDBSCAN") else np.asarray(item["labels"]).astype(int)
        met = evaluate_scores(y, item["scores"], predicted_anomaly, int(config.get("evaluation", {}).get("top_k", 100)))
        metrics.append({"model": item["model"], **met})
        scored[f"{item['model'].lower().replace(' ', '_')}_label"] = (np.asarray(item["labels"]) == -1).astype(int) if item["model"] in ("DBSCAN", "HDBSCAN") else np.asarray(item["labels"]).astype(int)
        scored[f"{item['model'].lower().replace(' ', '_')}_score"] = np.asarray(item["scores"], dtype=float)
    # HDBSCAN's scikit-learn implementation may expose only binary noise labels
    # rather than continuous GLOSH scores. If so, use continuous baseline rankings
    # as a review-prioritization fallback, while preserving each model's own output.
    hdb = scored["hdbscan_score"].astype(float)
    if hdb.nunique(dropna=True) > 2:
        scored["review_score"] = hdb.rank(method="average", pct=True)
        scored["review_score_source"] = "HDBSCAN score percentile"
    else:
        rank_columns = []
        for col in ("hdbscan_score", "isolation_forest_score", "local_outlier_factor_score"):
            if col in scored and scored[col].nunique(dropna=True) > 1:
                rank_columns.append(scored[col].rank(method="average", pct=True))
        if rank_columns:
            scored["review_score"] = pd.concat(rank_columns, axis=1).mean(axis=1)
            scored["review_score_source"] = "Ensemble percentile fallback (HDBSCAN + available baselines)"
        else:
            scored["review_score"] = hdb.rank(method="first", pct=True)
            scored["review_score_source"] = "Tie-broken HDBSCAN rank; investigate score variation"
    # Select a controlled review fraction using ranks, not >= a quantile value:
    # a zero/one-valued score distribution can otherwise flag every row.
    scored["review_rank_pct"] = scored["review_score"].rank(method="first", pct=True)
    scored["review_status"] = np.where(scored["review_rank_pct"] >= 0.95, "Needs Review", "Monitor")
    scored["review_reasons"] = ["; ".join(explain_row(row, feature_cols)) for _, row in scored.iterrows()]
    return scored, pd.DataFrame(metrics), k_distance_curve(X, k=10), {"scaler": scaler, "pca": pca, "feature_columns": feature_cols}
