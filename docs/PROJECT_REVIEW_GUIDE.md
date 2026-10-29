# Project Review & Demo Guide

## Final title
**Outlier and Anomaly Detection in Transactional Databases using Density-Based Clustering (DBSCAN/HDBSCAN) for Retail Market-Basket Analysis**

## One-minute problem statement
Retail transaction systems contain baskets that differ from common shopping patterns. Rule-based thresholds can miss unusual combinations or flag naturally large baskets. This project builds a reproducible basket-level pipeline that engineers behavioral and product-rarity features, compares DBSCAN and HDBSCAN with Isolation Forest and Local Outlier Factor, and presents high-scoring baskets for human review. Because the public dataset does not provide verified anomaly labels, controlled synthetic perturbations are used to test the evaluation pipeline. The system is a decision-support prototype, not a fraud verdict system.

## Objectives
1. Build one structured feature vector per grocery order.
2. Add basket size, product/aisle/department diversity, reorder behavior, order timing, and product-rarity features.
3. Compare DBSCAN and HDBSCAN with Isolation Forest and LOF.
4. Evaluate synthetic anomaly recovery with precision, recall, F1, average precision, ROC-AUC and Precision@K.
5. Inspect DBSCAN parameter sensitivity and k-distance diagnostics.
6. Surface review candidates and transparent reasons in Streamlit, with CSV export and optional PostgreSQL persistence.

## Methodology flow
1. **Ingest:** orders, order-product lines, products, aisles and departments.
2. **Sample:** deterministic sample of prior orders; product lines are read in chunks.
3. **Engineer:** one basket row per order, with diversity, reorder and rarity features.
4. **Create evaluation copy:** inject a controlled fraction of perturbations into a copy; retain a separate binary synthetic label.
5. **Prevent preprocessing leakage:** fit RobustScaler/PCA on non-perturbed reference baskets, then transform evaluation baskets.
6. **Detect:** DBSCAN noise labels, HDBSCAN outlier scores, Isolation Forest scores and LOF scores.
7. **Evaluate:** compare rankings and flags against synthetic labels; inspect the parameter-sensitivity report.
8. **Present:** Streamlit review queue, model metrics, score visualization, and downloadable CSV.

## Suggested PPT: 10 slides
1. Title, team and guide details.
2. Problem statement and motivation.
3. Existing challenges and project objectives.
4. Dataset and schema (include dataset limitations).
5. Proposed architecture and end-to-end workflow.
6. Feature engineering and market-basket context.
7. DBSCAN vs HDBSCAN (density assumptions, noise/outlier outputs).
8. Experimental design, baselines and metrics.
9. Actual results from your own run + dashboard screenshots.
10. Limitations, conclusion and future work.

**Important:** do not fill slide 9 with made-up scores. Generate `reports/evaluation_results.csv` from the downloaded dataset, then use those values. If DBSCAN/HDBSCAN perform worse than baselines on injected anomalies, report that honestly and discuss why.

## Live demo script (about 4 minutes)
1. Show the project folder and the required CSV names in `data/raw/`.
2. Run `python -m src.pipeline --config configs/config.yaml` and point out the deterministic sample count.
3. Open `reports/evaluation_results.csv`; explain that labels are synthetic and metrics do not establish real-world fraud accuracy.
4. Run `streamlit run dashboard/app.py`.
5. Show total baskets, model comparison, review-score slider, reasons, and CSV export.
6. Open `reports/dbscan_sensitivity.csv` and `reports/figures/k_distance.png` to show parameter diagnostics.
7. End with limitations and the human-review framing.

## Likely viva questions
**Q: Why DBSCAN?** It finds dense regions without requiring a preset cluster count and marks points outside dense regions as noise.

**Q: Why HDBSCAN as well?** It examines density structure across scales and can handle clusters with varying densities better than a single global `eps` choice in many datasets.

**Q: What does DBSCAN label -1 mean?** A point was classified as noise under the chosen `eps` and `min_samples`; it is not automatically a business anomaly or fraud.

**Q: Why use Isolation Forest and LOF?** They provide contrasting anomaly-detection baselines so the density-based methods are not evaluated in isolation.

**Q: Where do ground-truth labels come from?** The public dataset has no verified anomaly labels. This prototype injects controlled perturbations and evaluates whether methods recover them. This validates the experimental harness, not real-world fraud detection.

**Q: How do you avoid leakage?** Fit scaling and optional PCA on non-perturbed reference baskets only, then transform the evaluation frame.

**Q: Why sample rather than process all orders?** Density-based clustering can be expensive and DBSCAN has a worst-case quadratic memory complexity in scikit-learn. Start at 20k, benchmark, then scale carefully.

**Q: What are the dataset limitations?** Instacart does not supply transaction prices, store/branch IDs, or calendar dates/holiday labels. This project cannot truthfully claim price anomalies, store-wise analysis, or holiday-aware results from these files.

**Q: What happens after an anomaly is flagged?** It is placed in a “Needs Review” queue with a score and reason. A human reviews it; the model does not accuse a customer or claim fraud.

## Before each review
- [ ] Run pipeline from a clean environment.
- [ ] Save the exact config used and the actual generated metrics.
- [ ] Capture dashboard screenshots from your own run.
- [ ] Check model comparisons and explain poor or surprising results.
- [ ] Know what every feature means and how synthetic anomalies are injected.
- [ ] State limitations clearly; never claim synthetic labels are real fraud labels.
- [ ] Keep the raw dataset out of Git and include dataset source/attribution as required by its terms.
