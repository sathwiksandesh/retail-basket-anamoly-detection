export type ModelKey = "dbscan" | "hdbscan" | "isolation_forest" | "local_outlier_factor";
export type DetectorChoice = "review" | ModelKey;

export interface Params {
  dbscan_eps: number; dbscan_min_samples: number;
  hdbscan_min_cluster_size: number; hdbscan_min_samples: number;
  contamination: number; sample_size: number; review_fraction: number; inject_synthetic: boolean;
}
export interface Summary {
  run_id: string; dataset_name: string; created_at: string; baskets: number; flagged: number; flag_rate: number;
  runtime_seconds: number; labeled: boolean; review_score_source: string; params: Params; warning: string;
  mean_basket_size: number; synthetic_anomalies: number | null; synthetic_caught: number | null;
}
export interface Overview {
  sizes: { bucket: string; normal: number; flagged: number }[];
  hours: Bucket[]; weekdays: Bucket[];
  reasons: { reason: string; count: number }[];
  trace: { order_id: number; item_count: number; score: number; flagged: boolean }[];
}
interface Bucket { key: number; total: number; flagged: number; flag_rate: number }
export interface ModelRow {
  model: string; key: ModelKey; flag_rate: number;
  precision?: number; recall?: number; f1?: number; average_precision?: number; roc_auc?: number; precision_at_k?: number; top_k?: number;
}
export interface Metrics { labeled: boolean; models: ModelRow[]; params: Params }
export interface Sensitivity { rows: { eps: number; min_samples: number; clusters: number; noise_rate: number }[]; kdistance: number[]; eps: number }
export interface BasketRow {
  order_id: number; user_id: number | null; item_count: number; unique_departments: number; unique_aisles: number;
  reorder_ratio: number; order_dow: number; order_hour_of_day: number; days_since_prior_order: number;
  score: number; flagged: boolean; review_status: string; reasons: string[]; is_anomaly: number | null;
  flags: Record<ModelKey, boolean>;
}
export interface BasketPage { total: number; items: BasketRow[]; model: string; score_label: string }
export interface Deviation { feature: string; value: number; median: number; p05: number; p95: number; percentile: number; extremity: number }
export interface BasketDetail {
  order_id: number; user_id: number | null; order_number: number; order_dow: number; order_hour_of_day: number;
  review_status: string; review_score: number; review_rank_pct: number; reasons: string[]; is_anomaly: number | null;
  models: { key: ModelKey; name: string; flagged: boolean; score: number }[]; deviations: Deviation[];
}
export interface DatasetInfo { id: string; name: string; rows: number; labeled: boolean; builtin: boolean }
export interface Datasets { datasets: DatasetInfo[]; required_columns: string[]; preview: Record<string, Record<string, number>[]> }
export interface UploadResult {
  ok: boolean; filename: string; rows?: number; error?: string; missing_columns?: string[]; labeled?: boolean;
  rows_dropped?: number; null_counts?: Record<string, number>; dataset?: DatasetInfo; preview?: Record<string, number>[];
}
export interface AnalyzeRequest {
  dataset_id: string; sample_size: number; inject_synthetic: boolean; contamination: number;
  dbscan_eps: number; dbscan_min_samples: number; hdbscan_min_cluster_size: number; hdbscan_min_samples: number; review_fraction: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(path, init); }
  catch { throw new Error("Cannot reach the API. Start it with: uvicorn api.main:app --port 8000"); }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      const d = body.detail;
      if (typeof d === "string") message = d;
      else if (Array.isArray(d)) message = d.map((e: { loc: string[]; msg: string }) => `${e.loc.slice(1).join(".")}: ${e.msg}`).join("; ");
    } catch { /* keep default */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

const qs = (o: Record<string, string | number | boolean | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export const api = {
  summary: () => request<Summary>("/api/summary"),
  overview: () => request<Overview>("/api/overview"),
  metrics: () => request<Metrics>("/api/metrics"),
  sensitivity: () => request<Sensitivity>("/api/sensitivity"),
  datasets: () => request<Datasets>("/api/datasets"),
  basket: (id: number) => request<BasketDetail>(`/api/baskets/${id}`),
  baskets: (p: { model: DetectorChoice; flagged_only: boolean; min_score: number; q: string; sort: string; descending: boolean; limit: number; offset: number }) =>
    request<BasketPage>(`/api/baskets?${qs(p)}`),
  upload: (file: File) => { const f = new FormData(); f.append("file", file); return request<UploadResult>("/api/datasets", { method: "POST", body: f }); },
  analyze: (body: AnalyzeRequest) =>
    request<{ summary: Summary; metrics: Metrics }>("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  exportUrl: "/api/export?status=Needs%20Review",
};
