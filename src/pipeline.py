import argparse, json, time
import pandas as pd
from pathlib import Path
import joblib
from src.config import load_config
from src.data_ingestion import load_reference_tables, load_order_products_for_orders, sample_orders
from src.preprocessing import clean_orders, clean_order_products
from src.feature_engineering import build_basket_features
from src.synthetic_generator import inject_synthetic_anomalies
from src.anomaly_scoring import run_detectors
from src.basket_analysis import frequent_itemsets
from src.dbscan_model import k_distance_curve
from src.dimensionality import prepare_features
from sklearn.cluster import DBSCAN

def run_pipeline(config_path="configs/config.yaml"):
    config = load_config(config_path)
    raw_dir = Path(config["data"]["raw_dir"]); processed_dir = Path(config["data"]["processed_dir"])
    processed_dir.mkdir(parents=True, exist_ok=True); Path("data/synthetic").mkdir(parents=True, exist_ok=True)
    data = load_reference_tables(raw_dir)
    orders = clean_orders(data["orders"])
    orders = orders.loc[orders["eval_set"] == "prior"].copy()
    products = data["products"]
    orders = sample_orders(orders, int(config["data"]["sample_orders"]), int(config["project"]["random_seed"]))
    items = clean_order_products(load_order_products_for_orders(raw_dir, set(orders["order_id"].astype(int))))
    features = build_basket_features(orders, items, products)
    # Keep only actual baskets; empty orders can occur when files don't match the selected split.
    features = features.loc[features["item_count"] > 0].reset_index(drop=True)
    feature_path = processed_dir / "basket_features.csv"; features.to_csv(feature_path, index=False)
    synthetic_cfg = config["synthetic"]
    synthetic = inject_synthetic_anomalies(features, float(synthetic_cfg["contamination_rate"]), int(synthetic_cfg["random_seed"]))
    synthetic_path = Path("data/synthetic/labeled_basket_features.csv"); synthetic.to_csv(synthetic_path, index=False)
    started = time.time()
    scored, metrics, kdist, artifacts = run_detectors(synthetic, config)
    results_path = processed_dir / "anomaly_results.csv"; scored.to_csv(results_path, index=False)
    metrics_path = Path("reports/evaluation_results.csv"); metrics_path.parent.mkdir(parents=True, exist_ok=True); metrics.to_csv(metrics_path, index=False)
    # Compact, interpretable market-basket analysis on the sampled line items.
    try:
        itemsets = frequent_itemsets(items, products, min_support=0.01, max_items=3)
        itemsets.assign(itemsets=itemsets["itemsets"].map(lambda x: ", ".join(sorted(map(str, x))))).to_csv("reports/frequent_itemsets.csv", index=False)
    except (MemoryError, ValueError, ImportError) as exc:
        (Path("reports") / "basket_analysis_warning.txt").write_text(str(exc), encoding="utf-8")
    # Parameter sensitivity: measure DBSCAN cluster/noise changes across a small eps grid.
    reference = synthetic.loc[synthetic["is_anomaly"] == 0]
    X_ref, _, _, _ = prepare_features(reference, pca_components=int(config.get("dimensionality", {}).get("pca_components", 0)))
    sens_rows = []
    base_eps = float(config.get("clustering", {}).get("dbscan", {}).get("eps", 0.7))
    min_samples = int(config.get("clustering", {}).get("dbscan", {}).get("min_samples", 10))
    for multiplier in (0.7, 0.85, 1.0, 1.15, 1.3):
        eps = base_eps * multiplier
        labs = DBSCAN(eps=eps, min_samples=min_samples, n_jobs=-1).fit_predict(X_ref)
        sens_rows.append({"eps": eps, "min_samples": min_samples, "clusters": len(set(labs)) - int(-1 in labs), "noise_rate": float((labs == -1).mean())})
    pd.DataFrame(sens_rows).to_csv("reports/dbscan_sensitivity.csv", index=False)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(8, 4)); ax.plot(range(1, len(kdist)+1), kdist); ax.set_title("DBSCAN k-distance diagnostic (k=10)"); ax.set_xlabel("Sorted sample index"); ax.set_ylabel("10-nearest-neighbor distance"); fig.tight_layout()
    Path("reports/figures").mkdir(parents=True, exist_ok=True); fig.savefig("reports/figures/k_distance.png", dpi=150); plt.close(fig)
    joblib.dump(artifacts, "models/preprocessing_artifacts.joblib")
    summary = {"orders_sampled": int(len(features)), "synthetic_anomalies": int(synthetic["is_anomaly"].sum()), "synthetic_rate": float(synthetic["is_anomaly"].mean()), "features_file": str(feature_path), "results_file": str(results_path), "metrics_file": str(metrics_path), "runtime_seconds": round(time.time()-started, 2), "warning": "Metrics against injected synthetic labels assess the test harness only; real anomaly labels are unavailable. Instacart has no prices, store IDs, or calendar dates."}
    (processed_dir / "pipeline_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2)); print("\nEvaluation:\n", metrics.to_string(index=False))
    return scored, metrics

if __name__ == "__main__":
    parser=argparse.ArgumentParser(); parser.add_argument("--config", default="configs/config.yaml"); args=parser.parse_args(); run_pipeline(args.config)
