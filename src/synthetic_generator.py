"""Create a controlled, clearly labeled evaluation set without mutating source data."""
import numpy as np
import pandas as pd

def inject_synthetic_anomalies(features: pd.DataFrame, contamination_rate: float = 0.02, random_seed: int = 42) -> pd.DataFrame:
    if not 0 <= contamination_rate < 1:
        raise ValueError("contamination_rate must be in [0, 1)")
    out = features.copy(deep=True)
    out["is_anomaly"] = 0
    n = len(out)
    n_anom = int(round(n * contamination_rate))
    if n_anom == 0 or n == 0:
        return out
    rng = np.random.default_rng(random_seed)
    idx = rng.choice(out.index.to_numpy(), size=min(n_anom, n), replace=False)
    # Multiple perturbation types prevent every synthetic case from having one identical pattern.
    for j, row_idx in enumerate(idx):
        out.at[row_idx, "is_anomaly"] = 1
        if j % 4 == 0:
            out.at[row_idx, "item_count"] = max(30, float(out.at[row_idx, "item_count"]) * 4)
            out.at[row_idx, "unique_products"] = max(25, float(out.at[row_idx, "unique_products"]) * 3)
            out.at[row_idx, "unique_aisles"] = max(18, float(out.at[row_idx, "unique_aisles"]) * 2)
        elif j % 4 == 1:
            out.at[row_idx, "unique_departments"] = max(10, float(out.at[row_idx, "unique_departments"]) + 6)
            out.at[row_idx, "unique_aisles"] = max(20, float(out.at[row_idx, "unique_aisles"]) + 10)
        elif j % 4 == 2:
            out.at[row_idx, "reorder_ratio"] = 0.0
            out.at[row_idx, "reordered_items"] = 0
            out.at[row_idx, "item_count"] = max(20, float(out.at[row_idx, "item_count"]) * 3)
        else:
            out.at[row_idx, "order_hour_of_day"] = int(rng.choice([0, 1, 2, 3, 22, 23]))
            out.at[row_idx, "days_since_prior_order"] = float(rng.choice([28, 29, 30]))
        if "log_item_count" in out:
            out.at[row_idx, "log_item_count"] = np.log1p(float(out.at[row_idx, "item_count"]))
    return out
