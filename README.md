# Retail Basket Anomaly Mining with DBSCAN and HDBSCAN

**Academic project starter — reproducible pipeline, evaluation, review queue, Streamlit dashboard, optional PostgreSQL export.**

## Final project decision
- **Dataset:** Instacart Market Basket Analysis (grocery baskets, product/aisle/department taxonomy, order timing and reorder history).
- **Unit of analysis:** one order/basket.
- **Primary methods:** DBSCAN and HDBSCAN.
- **Baselines:** Isolation Forest and Local Outlier Factor (LOF).
- **Evaluation:** controlled synthetic anomaly labels plus precision, recall, F1, average precision, ROC-AUC and Precision@K.
- **Presentation:** Streamlit dashboard; PostgreSQL export is optional.

### Important limitation you should state in reviews
Instacart has no item prices, store/branch IDs, or real calendar dates/holiday labels. Therefore this project studies **unusual grocery baskets and ordering patterns**, not price fraud, store-wise comparison, or holiday anomalies. Synthetic anomaly metrics measure recovery of injected perturbations, not real-world fraud accuracy. Flagged records mean **Needs Review**, never proof of wrongdoing.

## 1. Download the dataset
Get the `Instacart Market Basket Analysis` files from the Kaggle competition: https://www.kaggle.com/competitions/instacart-market-basket-analysis
Place these extracted CSVs in `data/raw/`:
- `orders.csv`
- `order_products__prior.csv`
- `products.csv`
- `aisles.csv`
- `departments.csv`

`order_products__prior.csv` is large; the loader scans it in chunks and keeps lines for sampled prior orders. The `train` product file is not used by this pipeline.

## 2. Install and run (Windows PowerShell)
Use Python 3.11 or 3.12.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m src.pipeline --config configs/config.yaml
streamlit run dashboard/app.py
```

On macOS/Linux, activate with `source .venv/bin/activate` instead. If PowerShell blocks activation, run `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` and invoke that Python directly.

## 3. Runtime and sample size
The default is **20,000 baskets** to make first runs and demos more reliable on a student laptop. Once the pipeline works and you benchmark runtime/memory, edit `data.sample_orders` in `configs/config.yaml` to 50,000 or 100,000. DBSCAN can have quadratic worst-case memory behavior, so do not start at 100k without benchmarking.

## 4. Outputs
- `data/processed/basket_features.csv` — one feature row per sampled basket.
- `data/synthetic/labeled_basket_features.csv` — separate copy with injected anomaly labels.
- `data/processed/anomaly_results.csv` — detector scores, labels, review status and explanations.
- `reports/evaluation_results.csv` — comparable model metrics against synthetic labels.
- `reports/frequent_itemsets.csv` — compact frequent product combinations from sampled baskets.
- `reports/dbscan_sensitivity.csv` — cluster/noise-rate response to nearby `eps` values.
- `reports/figures/k_distance.png` — DBSCAN k-distance diagnostic.
- `models/preprocessing_artifacts.joblib` — fitted scaling/PCA metadata.
- `data/processed/pipeline_summary.json` — sample count and runtime summary.

## 5. What is being evaluated
- **Precision/Recall/F1:** thresholded flags compared with injected labels.
- **Average Precision / ROC-AUC:** ranking quality of detector scores against injected labels.
- **Precision@K:** fraction of injected anomalies among the highest-ranked K baskets.
- **DBSCAN k-distance plot:** supports manual `eps` sensitivity investigation.

DBSCAN has no native continuous outlier score in this implementation, so its score is explicitly binary (noise vs non-noise). HDBSCAN's outlier scores are normalized for ranking. Avoid claiming one model is superior until your own run's metrics and parameter sensitivity support it.

## 6. PostgreSQL (optional)
Start the included service:

```powershell
docker compose up -d db
```
Set a connection string and load outputs:

```powershell
$env:DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/retail_anomaly"
python -m database.load_data
```

If Docker is unavailable, the pipeline and Streamlit demo still work without PostgreSQL. The compose file provides a local development database, not a production deployment.

## 7. Tests
```powershell
pytest -q
```

## Suggested review narrative
1. Problem statement and why rare baskets merit human review.
2. Dataset schema, scope and limitations.
3. Basket feature engineering (including product rarity), frequent itemsets, and scaling.
4. DBSCAN vs HDBSCAN; explain global vs varying density assumptions.
5. Synthetic anomaly injection and why labels are not real fraud ground truth.
6. Baseline comparison and metrics.
7. Dashboard demo: select a review score threshold, inspect reasons, export a review queue.
8. Limitations and future work: a retail dataset with actual price/store/date fields, real analyst labels, temporal validation, parameter sensitivity, and larger-scale optimization.

## Review and presentation support
See `docs/PROJECT_REVIEW_GUIDE.md` for the 10-slide PPT outline, demo script, likely viva questions, methodology, and pre-review checklist.

## References
- Instacart competition dataset: https://www.kaggle.com/competitions/instacart-market-basket-analysis
- scikit-learn DBSCAN: https://scikit-learn.org/stable/modules/generated/sklearn.cluster.DBSCAN.html
- scikit-learn HDBSCAN: https://scikit-learn.org/stable/modules/generated/sklearn.cluster.HDBSCAN.html
- HDBSCAN outlier detection / GLOSH: https://hdbscan.readthedocs.io/en/latest/outlier_detection.html
