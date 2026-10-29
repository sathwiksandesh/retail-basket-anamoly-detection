CREATE TABLE IF NOT EXISTS basket_features (
 order_id BIGINT PRIMARY KEY, user_id BIGINT NOT NULL, order_dow SMALLINT, order_hour_of_day SMALLINT,
 order_number INTEGER, days_since_prior_order DOUBLE PRECISION, item_count INTEGER, unique_products INTEGER,
 unique_aisles INTEGER, unique_departments INTEGER, reordered_items INTEGER, reorder_ratio DOUBLE PRECISION, log_item_count DOUBLE PRECISION
);
CREATE TABLE IF NOT EXISTS anomaly_results (
 order_id BIGINT NOT NULL, model_name TEXT NOT NULL, cluster_label INTEGER, anomaly_score DOUBLE PRECISION,
 severity TEXT, review_status TEXT NOT NULL DEFAULT 'Needs Review', reasons JSONB, model_version TEXT, detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_anomaly_results_score ON anomaly_results(anomaly_score DESC);
