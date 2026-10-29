"""Optional PostgreSQL loader for processed basket features and anomaly results."""
import os
from pathlib import Path
import pandas as pd
from sqlalchemy import create_engine, text

def main():
    url=os.getenv("DATABASE_URL")
    if not url: raise SystemExit("Set DATABASE_URL, e.g. postgresql+psycopg://postgres:postgres@localhost:5432/retail_anomaly")
    engine=create_engine(url)
    schema=Path("database/schema.sql").read_text(encoding="utf-8")
    with engine.begin() as conn:
        for statement in schema.split(";"):
            if statement.strip(): conn.execute(text(statement))
    for path, table in [(Path("data/processed/basket_features.csv"), "basket_features"), (Path("data/processed/anomaly_results.csv"), "anomaly_results_export")]:
        if path.exists():
            df=pd.read_csv(path)
            df.to_sql(table, engine, if_exists="replace", index=False, chunksize=5000, method="multi")
            print(f"Loaded {len(df):,} rows into {table}")
        else: print(f"Skipping missing file: {path}")
if __name__ == "__main__": main()
