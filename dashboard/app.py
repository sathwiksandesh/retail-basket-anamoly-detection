from pathlib import Path
import pandas as pd
import streamlit as st
import plotly.express as px

st.set_page_config(page_title="Retail Basket Anomaly Mining", page_icon="🛒", layout="wide")
st.title("Retail Basket Anomaly Mining")
st.caption("DBSCAN vs HDBSCAN with Isolation Forest and LOF baselines • Basket-level review support")
project_root = Path(__file__).resolve().parents[1]
results_path = project_root / "data/processed/anomaly_results.csv"
metrics_path = project_root / "reports/evaluation_results.csv"
features_path = project_root / "data/processed/basket_features.csv"
if not results_path.exists():
    st.warning("Run the pipeline before opening the dashboard.")
    st.code("python -m src.pipeline --config configs/config.yaml\nstreamlit run dashboard/app.py")
    st.markdown("Download Instacart Market Basket Analysis and place the required CSVs in `data/raw/`.")
    st.stop()
df = pd.read_csv(results_path)
metrics = pd.read_csv(metrics_path) if metrics_path.exists() else pd.DataFrame()
review_col = "review_status" if "review_status" in df else None
needs = df[df[review_col] == "Needs Review"] if review_col else df.iloc[0:0]
c1,c2,c3,c4 = st.columns(4)
c1.metric("Baskets analysed", f"{len(df):,}")
c2.metric("Flagged for review", f"{len(needs):,}")
c3.metric("Synthetic anomalies", f"{int(df['is_anomaly'].sum()):,}" if "is_anomaly" in df else "N/A")
c4.metric("Mean basket items", f"{df['item_count'].mean():.1f}" if "item_count" in df else "N/A")
st.warning("A flagged basket is an analytical lead, not proof of fraud. Metrics use synthetic injected anomalies and must not be presented as validated real-world detection accuracy.")
if not metrics.empty:
    st.subheader("Model comparison on synthetic test labels")
    st.dataframe(metrics.round(4), use_container_width=True, hide_index=True)
    if "average_precision" in metrics:
        fig=px.bar(metrics, x="model", y="average_precision", title="Average precision (synthetic labels)")
        st.plotly_chart(fig, use_container_width=True)
if "review_score" in df:
    st.subheader("Review queue")
    st.caption("Review score is a prioritization score. If HDBSCAN only supplies binary noise labels, a clearly labelled percentile fallback combines available continuous baseline scores.")
    score_col = "review_score"
    max_rows=min(1000, len(df))
    default_threshold=float(df[score_col].quantile(0.95))
    threshold=st.slider("Minimum review-priority score", 0.0, 1.0, min(1.0, max(0.0, default_threshold)), 0.01)
    subset=df[df[score_col] >= threshold].sort_values(score_col, ascending=False)
    if "review_reasons" in subset:
        show=[c for c in ["order_id","user_id","item_count","unique_products","unique_aisles","unique_departments","reorder_ratio","order_dow","order_hour_of_day","review_score","review_score_source","hdbscan_score","dbscan_score","review_status","review_reasons","is_anomaly"] if c in subset.columns]
    else: show=subset.columns.tolist()
    st.dataframe(subset[show].head(max_rows), use_container_width=True, hide_index=True)
    st.download_button("Download review queue CSV", subset[show].to_csv(index=False).encode("utf-8"), "review_queue.csv", "text/csv")
if all(c in df for c in ["item_count","review_score"]):
    st.subheader("Basket size vs review-priority score")
    fig=px.scatter(df.sample(min(5000,len(df)), random_state=42), x="item_count", y="review_score", color="review_status" if "review_status" in df else None, hover_data=[c for c in ["order_id","unique_departments","reorder_ratio"] if c in df.columns], opacity=0.65)
    st.plotly_chart(fig, use_container_width=True)
project_root = Path(__file__).resolve().parents[1]
k_distance_path = project_root / "reports" / "figures" / "k_distance.png"
if k_distance_path.exists():
    st.subheader("DBSCAN parameter diagnostic")
    st.image(str(k_distance_path), caption="Sorted 10-nearest-neighbor distances; use as a diagnostic, not an automatic eps selector.")
else:
    st.info("DBSCAN k-distance plot not found. Run the pipeline again to generate reports/figures/k_distance.png.")
st.subheader("Feature preview")
st.dataframe(df.head(50), use_container_width=True)
