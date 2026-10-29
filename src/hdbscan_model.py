"""HDBSCAN wrapper using scikit-learn's maintained implementation."""
import numpy as np
try:
    from sklearn.cluster import HDBSCAN
except ImportError as exc:  # pragma: no cover
    raise ImportError("HDBSCAN requires scikit-learn >= 1.3; upgrade scikit-learn") from exc

def fit_hdbscan(X, min_cluster_size=20, min_samples=10, cluster_selection_method="eom"):
    model = HDBSCAN(min_cluster_size=int(min_cluster_size), min_samples=int(min_samples),
                    cluster_selection_method=cluster_selection_method, n_jobs=-1, copy=True)
    labels = model.fit_predict(X)
    raw = getattr(model, "outlier_scores_", None)
    if raw is None:
        scores = (labels == -1).astype(float)
    else:
        scores = np.nan_to_num(np.asarray(raw, dtype=float), nan=0.0, posinf=1.0, neginf=0.0)
        if scores.max(initial=0) > 0:
            scores = scores / scores.max()
    return model, labels, scores
