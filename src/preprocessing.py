import pandas as pd

def clean_orders(orders: pd.DataFrame) -> pd.DataFrame:
    required = {"order_id", "user_id", "order_dow", "order_hour_of_day"}
    missing = required - set(orders.columns)
    if missing:
        raise ValueError(f"orders missing required columns: {sorted(missing)}")
    result = orders.drop_duplicates(subset=["order_id"]).copy()
    result = result.dropna(subset=["order_id", "user_id"])
    result["order_id"] = result["order_id"].astype("int64")
    result["user_id"] = result["user_id"].astype("int64")
    return result

def clean_order_products(items: pd.DataFrame) -> pd.DataFrame:
    required = {"order_id", "product_id", "add_to_cart_order", "reordered"}
    missing = required - set(items.columns)
    if missing:
        raise ValueError(f"order products missing required columns: {sorted(missing)}")
    result = items.drop_duplicates(subset=["order_id", "product_id"]).copy()
    result = result.dropna(subset=["order_id", "product_id"])
    result["order_id"] = result["order_id"].astype("int64")
    result["product_id"] = result["product_id"].astype("int64")
    return result
