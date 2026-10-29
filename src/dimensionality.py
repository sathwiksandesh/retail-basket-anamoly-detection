"""Leakage-aware scaling and optional PCA projection."""
import numpy as np
from sklearn.decomposition import PCA
from sklearn.preprocessing import RobustScaler

FEATURE_COLUMNS = [
    "item_count", "unique_products", "unique_aisles", "unique_departments",
    "reordered_items", "reorder_ratio", "log_item_count", "rare_item_count",
    "mean_item_rarity", "basket_rarity_score", "order_dow",
    "order_hour_of_day", "order_number", "days_since_prior_order",
]

def prepare_features(frame, feature_columns=None, fit=True, scaler=None, pca=None, pca_components=0):
    cols = feature_columns or [c for c in FEATURE_COLUMNS if c in frame.columns]
    if not cols:
        raise ValueError("No usable numeric feature columns found")
    X = frame[cols].replace([np.inf, -np.inf], np.nan).copy()
    for col in cols:
        X[col] = X[col].fillna(X[col].median() if X[col].notna().any() else 0)
    if fit:
        scaler = RobustScaler()
        Xs = scaler.fit_transform(X)
        if pca_components and pca_components > 0:
            pca = PCA(n_components=min(pca_components, Xs.shape[1]), random_state=42)
            Xout = pca.fit_transform(Xs)
        else:
            pca, Xout = None, Xs
    else:
        if scaler is None:
            raise ValueError("scaler is required when fit=False")
        Xs = scaler.transform(X)
        Xout = pca.transform(Xs) if pca is not None else Xs
    return Xout, scaler, pca, cols
