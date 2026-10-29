import numpy as np
import pandas as pd

def build_basket_features(
    orders: pd.DataFrame,
    order_products: pd.DataFrame,
    products: pd.DataFrame,
) -> pd.DataFrame:
    """Build one row per order from Instacart fields that actually exist."""
    # Product rarity is computed within the sampled reference baskets. This is a
    # descriptive market-basket feature, not a claim about product price or fraud.
    product_counts = order_products.groupby("product_id")["order_id"].nunique()
    n_baskets = max(1, int(order_products["order_id"].nunique()))
    rarity = (-np.log((product_counts / n_baskets).clip(lower=1 / n_baskets))).rename("product_rarity")
    items = order_products.merge(
        products[["product_id", "aisle_id", "department_id"]],
        on="product_id", how="left", validate="many_to_one"
    ).merge(rarity, left_on="product_id", right_index=True, how="left")
    agg = items.groupby("order_id").agg(
        item_count=("product_id", "size"),
        unique_products=("product_id", "nunique"),
        unique_aisles=("aisle_id", "nunique"),
        unique_departments=("department_id", "nunique"),
        reordered_items=("reordered", "sum"),
        rare_item_count=("product_rarity", lambda s: int((s >= np.log(10)).sum())),
        mean_item_rarity=("product_rarity", "mean"),
    ).reset_index()
    result = orders.merge(agg, on="order_id", how="left", validate="one_to_one")
    numeric_cols = ["item_count", "unique_products", "unique_aisles",
                    "unique_departments", "reordered_items", "rare_item_count", "mean_item_rarity"]
    result[numeric_cols] = result[numeric_cols].fillna(0)
    result["reorder_ratio"] = np.divide(
        result["reordered_items"],
        result["item_count"],
        out=np.zeros(len(result), dtype=float),
        where=result["item_count"].to_numpy() > 0,
    )
    if "order_number" not in result: result["order_number"] = 1
    if "days_since_prior_order" not in result: result["days_since_prior_order"] = 0.0
    result["days_since_prior_order"] = result["days_since_prior_order"].fillna(0.0)
    result["order_number"] = result["order_number"].fillna(1).astype(int)
    result["order_dow"] = result["order_dow"].astype(int)
    result["order_hour_of_day"] = result["order_hour_of_day"].astype(int)
    result["log_item_count"] = np.log1p(result["item_count"])
    result["basket_rarity_score"] = result["mean_item_rarity"].fillna(0) * np.log1p(result["item_count"])
    return result
