from pathlib import Path
import pandas as pd

EXPECTED_COLUMNS = {
    "orders.csv": {"order_id", "user_id", "eval_set", "order_number", "order_dow",
                   "order_hour_of_day", "days_since_prior_order"},
    "order_products__prior.csv": {"order_id", "product_id", "add_to_cart_order", "reordered"},
    "products.csv": {"product_id", "product_name", "aisle_id", "department_id"},
    "aisles.csv": {"aisle_id", "aisle"},
    "departments.csv": {"department_id", "department"},
}

def validate_raw_dir(raw_dir: str | Path) -> dict[str, Path]:
    raw_dir = Path(raw_dir)
    missing = [name for name in EXPECTED_COLUMNS if not (raw_dir / name).exists()]
    if missing:
        raise FileNotFoundError(
            f"Missing Instacart CSV files in {raw_dir}: {', '.join(missing)}. "
            "Download and extract the dataset first."
        )
    return {name: raw_dir / name for name in EXPECTED_COLUMNS}

def load_reference_tables(raw_dir: str | Path) -> dict[str, pd.DataFrame]:
    """Load orders and small dimension tables; don't load the huge prior file yet."""
    paths = validate_raw_dir(raw_dir)
    selected = ["orders.csv", "products.csv", "aisles.csv", "departments.csv"]
    frames = {name.removesuffix(".csv"): pd.read_csv(paths[name]) for name in selected}
    for filename in selected:
        required = EXPECTED_COLUMNS[filename]
        missing_columns = required - set(frames[filename.removesuffix(".csv")].columns)
        if missing_columns:
            raise ValueError(f"{filename} is missing columns: {sorted(missing_columns)}")
    return frames

def load_order_products_for_orders(
    raw_dir: str | Path, order_ids: set[int], chunksize: int = 1_000_000
) -> pd.DataFrame:
    """Read the large prior-order CSV in chunks and retain only selected order IDs."""
    path = Path(raw_dir) / "order_products__prior.csv"
    if not path.exists():
        raise FileNotFoundError(f"Missing Instacart CSV file: {path}")
    pieces = []
    wanted = set(int(x) for x in order_ids)
    for chunk in pd.read_csv(path, chunksize=chunksize):
        missing = EXPECTED_COLUMNS["order_products__prior.csv"] - set(chunk.columns)
        if missing:
            raise ValueError(f"order_products__prior.csv is missing columns: {sorted(missing)}")
        filtered = chunk[chunk["order_id"].isin(wanted)]
        if not filtered.empty:
            pieces.append(filtered)
    if not pieces:
        return pd.DataFrame(columns=["order_id", "product_id", "add_to_cart_order", "reordered"] )
    return pd.concat(pieces, ignore_index=True)

def sample_orders(orders: pd.DataFrame, n_orders: int, seed: int = 42) -> pd.DataFrame:
    """Return a reproducible order sample without changing the input dataframe."""
    if n_orders <= 0:
        raise ValueError("n_orders must be positive")
    n = min(n_orders, len(orders))
    return orders.sample(n=n, random_state=seed).sort_values("order_id").reset_index(drop=True)
