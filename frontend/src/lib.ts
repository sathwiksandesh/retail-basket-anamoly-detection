import { useEffect, useState, createContext, useContext } from "react";

export const MODEL_COLORS = { dbscan: "#2b6cb0", hdbscan: "#0f8b6e", isolation_forest: "#b7791f", local_outlier_factor: "#7b4fa3" } as const;
export const FLAG = "#c8321e";
export const INK = "#1c2421";
export const GRAPHITE = "#56625d";
export const RULE = "#bcc4bd";

export const int = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toLocaleString("en-US"));
export const dec = (n: number | null | undefined, d = 2) => (n == null ? "-" : n.toFixed(d));
export const pct = (n: number | null | undefined, d = 1) => (n == null ? "-" : `${(n * 100).toFixed(d)}%`);
export const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Bumped after every analysis so every page refetches. */
export const RunContext = createContext<{ runKey: number; bump: () => void }>({ runKey: 0, bump: () => {} });
export const useRun = () => useContext(RunContext);

export function useApi<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true); setError(null);
    load().then((d) => live && setData(d)).catch((e: Error) => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading };
}

export const FEATURE_LABELS: Record<string, string> = {
  item_count: "Items in basket", unique_departments: "Departments", unique_aisles: "Aisles",
  reorder_ratio: "Share reordered", rare_item_count: "Rare items", mean_item_rarity: "Average item rarity",
  days_since_prior_order: "Days since last order", order_hour_of_day: "Order hour", order_number: "Customer's order number",
};
export const DETECTOR_LABELS: Record<string, string> = {
  review: "Combined review priority", hdbscan: "HDBSCAN", dbscan: "DBSCAN", isolation_forest: "Isolation Forest", local_outlier_factor: "Local Outlier Factor",
};
