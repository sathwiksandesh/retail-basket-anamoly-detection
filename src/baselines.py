"""Non-density baselines for a fair comparison."""
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor

def run_baselines(X, contamination=0.02, random_state=42):
    results = {}
    iso = IsolationForest(contamination=contamination, random_state=random_state, n_estimators=200, n_jobs=-1)
    iso.fit(X)
    results["Isolation Forest"] = {"labels": (iso.predict(X) == -1).astype(int), "scores": -iso.score_samples(X), "model": iso}
    lof = LocalOutlierFactor(n_neighbors=min(20, max(2, len(X)-1)), contamination=contamination, n_jobs=-1)
    labels = lof.fit_predict(X)
    results["Local Outlier Factor"] = {"labels": (labels == -1).astype(int), "scores": -lof.negative_outlier_factor_, "model": lof}
    return results
