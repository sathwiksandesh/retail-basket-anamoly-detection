"""DBSCAN model wrapper and k-distance diagnostic."""
import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.neighbors import NearestNeighbors

def k_distance_curve(X, k=10, sample_size=5000, random_state=42):
    X = np.asarray(X)
    if len(X) == 0:
        return np.array([])
    if len(X) > sample_size:
        rng = np.random.default_rng(random_state)
        X = X[rng.choice(len(X), sample_size, replace=False)]
    k = max(1, min(int(k), len(X)))
    distances, _ = NearestNeighbors(n_neighbors=k).fit(X).kneighbors(X)
    return np.sort(distances[:, -1])

def fit_dbscan(X, eps=0.7, min_samples=10):
    model = DBSCAN(eps=float(eps), min_samples=int(min_samples), n_jobs=-1)
    labels = model.fit_predict(X)
    # DBSCAN has no continuous native score; noise is represented honestly as binary.
    scores = (labels == -1).astype(float)
    return model, labels, scores
