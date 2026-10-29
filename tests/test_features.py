import numpy as np
import pandas as pd
from src.feature_engineering import build_basket_features
from src.synthetic_generator import inject_synthetic_anomalies
from src.evaluation import evaluate_scores
from src.dbscan_model import k_distance_curve

def test_feature_engineering_one_row_per_order():
    orders = pd.DataFrame({"order_id":[1,2], "user_id":[10,11], "order_dow":[1,2], "order_hour_of_day":[9,10], "order_number":[1,2], "days_since_prior_order":[np.nan,7]})
    items = pd.DataFrame({"order_id":[1,1,2], "product_id":[101,102,103], "reordered":[0,1,0]})
    products = pd.DataFrame({"product_id":[101,102,103], "aisle_id":[1,2,1], "department_id":[1,1,2]})
    result = build_basket_features(orders, items, products)
    assert len(result) == 2
    assert result.loc[result.order_id == 1, "item_count"].iloc[0] == 2
    assert result.loc[result.order_id == 1, "reorder_ratio"].iloc[0] == 0.5

def test_synthetic_generator_does_not_mutate_input():
    df = pd.DataFrame({"item_count":[3,4,5,6,7,8,9,10,11,12], "unique_products":[3,4,5,6,7,8,9,10,11,12], "unique_aisles":[2]*10, "unique_departments":[1]*10, "reordered_items":[1]*10, "reorder_ratio":[.3]*10, "log_item_count":np.log1p(np.arange(3,13))})
    before = df.copy(deep=True)
    out = inject_synthetic_anomalies(df, 0.2, 7)
    pd.testing.assert_frame_equal(df, before)
    assert int(out.is_anomaly.sum()) == 2

def test_metrics_are_bounded():
    m = evaluate_scores([0,0,1,1], [0.1,0.2,0.8,0.9], [0,0,1,1], 2)
    assert m["f1"] == 1.0 and m["average_precision"] == 1.0
    assert 0 <= m["precision_at_k"] <= 1

def test_k_distance_returns_sorted_values():
    values = k_distance_curve(np.array([[0.0],[1.0],[2.0],[3.0]]), k=2)
    assert len(values) == 4
    assert np.all(np.diff(values) >= 0)
