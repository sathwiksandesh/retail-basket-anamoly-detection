import { useEffect, useState } from "react";
import { api, type DetectorChoice, type Decision, type ModelKey } from "./api";
import { Receipt } from "./Receipt";
import { DecisionBadge, Loading, Notice, ScoreBar, Segmented, ghostBtn, inputCls } from "./components";
import { DETECTOR_LABELS, MODEL_COLORS, dec, int, useApi, useRun } from "./lib";

const PAGE = 25;
const MODELS: ModelKey[] = ["dbscan", "hdbscan", "isolation_forest", "local_outlier_factor"];

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function Flagged() {
  const { runKey } = useRun();
  const [model, setModel] = useState<DetectorChoice>("review");
  const [flaggedOnly, setFlaggedOnly] = useState(true);
  const [minScore, setMinScore] = useState(0);
  const [q, setQ] = useState("");
  const [decision, setDecision] = useState("any");
  const [sort, setSort] = useState("score");
  const [desc, setDesc] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [rowError, setRowError] = useState<string | null>(null);
  const query = useDebounced(q);

  useEffect(() => setOffset(0), [model, flaggedOnly, minScore, query, decision, sort, desc, runKey]);
  useEffect(() => setSelected(null), [runKey]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const { data, error, loading } = useApi(
    () => api.baskets({ model, flagged_only: flaggedOnly, min_score: minScore, q: query, sort, descending: desc, limit: PAGE, offset, decision }),
    [model, flaggedOnly, minScore, query, decision, sort, desc, offset, runKey, refresh],
  );

  async function quick(id: number, d: Decision) {
    setRowError(null);
    try { await api.review(id, d); setRefresh((r) => r + 1); } catch (e) { setRowError((e as Error).message); }
  }

  const head = (key: string, label: string, right = true) => (
    <th scope="col" className={`sticky top-0 z-10 bg-desk px-2 py-2 font-medium ${right ? "text-right" : "text-left"}`} aria-sort={sort === key ? (desc ? "descending" : "ascending") : "none"}>
      <button onClick={() => (sort === key ? setDesc(!desc) : (setSort(key), setDesc(true)))} className="hover:underline">
        {label}{sort === key ? (desc ? " (high first)" : " (low first)") : ""}
      </button>
    </th>
  );
  const plain = (label: string, right = false) => <th scope="col" className={`sticky top-0 z-10 bg-desk px-2 py-2 font-medium ${right ? "text-right" : "text-left"}`}>{label}</th>;
  const hasLabels = data?.items.some((r) => r.is_anomaly !== null);

  return (
    <div className={`grid gap-6 ${selected ? "xl:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <label className="text-sm"><span className="block font-medium">Detector</span>
            <select className={`${inputCls} !mt-1 w-56`} value={model} onChange={(e) => setModel(e.target.value as DetectorChoice)}>
              {Object.entries(DETECTOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <div className="text-sm"><span className="mb-1 block font-medium">Show</span>
            <Segmented label="Show" value={flaggedOnly ? "flagged" : "all"} onChange={(v) => setFlaggedOnly(v === "flagged")}
              options={[{ value: "flagged", label: "Flagged only" }, { value: "all", label: "All baskets" }]} /></div>
          <label className="text-sm"><span className="block font-medium">Review status</span>
            <select className={`${inputCls} !mt-1 w-44`} value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="any">Any</option><option value="pending">Awaiting review</option>
              <option value="confirmed">Confirmed anomaly</option><option value="dismissed">Dismissed as normal</option>
            </select></label>
          <label className="text-sm"><span className="block font-medium">Minimum score</span>
            <input type="number" step={0.05} min={0} value={minScore} onChange={(e) => setMinScore(Math.max(0, Number(e.target.value) || 0))} className={`${inputCls} !mt-1 w-28`} /></label>
          <label className="text-sm"><span className="block font-medium">Order or customer ID</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 3298833" className={`${inputCls} !mt-1 w-44`} /></label>
          <a href={api.exportUrl} className={`${ghostBtn} sm:ml-auto`} download>Download review queue (CSV)</a>
        </div>

        {(error || rowError) && <Notice tone="error">{error ?? rowError}</Notice>}
        {loading && !data ? <Loading /> : data && (
          <>
            <p className="mb-2 text-sm text-graphite" aria-live="polite">
              {data.total === 0 ? "No baskets match these filters." : `${int(offset + 1)}-${int(Math.min(offset + PAGE, data.total))} of ${int(data.total)} baskets. Score: ${data.score_label.toLowerCase()}.`}
              {model === "dbscan" && " DBSCAN gives only noise or not-noise, so its score is 0 or 1."}
              {hasLabels && " Rows marked Injected were planted by the pipeline for testing; unmarked rows are genuine baskets."}
            </p>
            <div className="max-h-[70vh] overflow-auto border-t border-ink">
              <table className="w-full min-w-[980px] text-sm num">
                <thead className="border-b border-rule text-graphite">
                  <tr>
                    {head("order_id", "Basket", false)}{head("item_count", "Items")}{head("unique_departments", "Depts")}
                    {head("reorder_ratio", "Reordered")}{head("days_since_prior_order", "Days since last")}{head("score", "Priority")}
                    {plain("Flagged by")}{plain("Main reason")}{plain("Review")}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.order_id} onClick={() => setSelected(r.order_id)}
                      className={`cursor-pointer border-b border-rule/70 hover:bg-panel ${selected === r.order_id ? "bg-panel" : ""}`}>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <button className="font-medium underline-offset-2 hover:underline" aria-label={`Open basket ${r.order_id}`} onClick={(e) => { e.stopPropagation(); setSelected(r.order_id); }}>#{r.order_id}</button>
                        {r.is_anomaly === 1 && <span title="Synthetic anomaly planted by the pipeline, not a real basket" className="ml-2 border border-graphite px-1 text-[11px] text-graphite">Injected</span>}
                        {r.has_note && <span className="ml-2 text-[12px] text-graphite">note</span>}
                      </td>
                      <td className="px-2 text-right">{int(r.item_count)}</td>
                      <td className="px-2 text-right">{int(r.unique_departments)}</td>
                      <td className="px-2 text-right">{dec(r.reorder_ratio, 2)}</td>
                      <td className="px-2 text-right">{int(r.days_since_prior_order)}</td>
                      <td className="px-2"><ScoreBar value={r.score} flagged={r.flagged} /></td>
                      <td className="px-2">
                        <span className="flex gap-1" aria-label={MODELS.filter((m) => r.flags[m]).map((m) => DETECTOR_LABELS[m]).join(", ") || "no detector"}>
                          {MODELS.map((m) => <i key={m} title={`${DETECTOR_LABELS[m]}: ${r.flags[m] ? "flagged" : "normal"}`} className="inline-block h-3 w-3 border"
                            style={{ background: r.flags[m] ? MODEL_COLORS[m] : "transparent", borderColor: MODEL_COLORS[m] }} />)}
                        </span>
                      </td>
                      <td className="px-2 text-graphite">{r.reasons[0] ?? "-"}{r.reasons.length > 1 ? ` +${r.reasons.length - 1}` : ""}</td>
                      <td className="whitespace-nowrap px-2" onClick={(e) => e.stopPropagation()}>
                        {r.decision === "pending" ? (
                          <span className="flex gap-1">
                            <button className="border border-ink px-2 py-0.5 text-[13px] hover:bg-paper" onClick={() => void quick(r.order_id, "confirmed")}>Confirm</button>
                            <button className="border border-rule px-2 py-0.5 text-[13px] hover:bg-paper" onClick={() => void quick(r.order_id, "dismissed")}>Dismiss</button>
                          </span>
                        ) : <span className="flex items-center gap-2"><DecisionBadge decision={r.decision} />
                          <button className="text-[13px] text-graphite underline" onClick={() => void quick(r.order_id, "pending")}>Undo</button></span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-2">
              <button className={ghostBtn} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous page</button>
              <button className={ghostBtn} disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Next page</button>
            </div>
          </>
        )}
      </div>

      {selected && (
        <>
          <div className="fixed inset-0 z-20 bg-ink/40 xl:hidden" onClick={() => setSelected(null)} aria-hidden />
          <aside aria-label="Basket detail"
            className="fixed inset-y-0 right-0 z-30 w-[min(400px,100%)] overflow-y-auto bg-desk p-4 shadow-xl xl:sticky xl:top-4 xl:z-auto xl:max-h-[calc(100vh-2rem)] xl:w-auto xl:self-start xl:p-0 xl:pr-1 xl:shadow-none">
            <Receipt orderId={selected} onClose={() => setSelected(null)} onChanged={() => setRefresh((r) => r + 1)} />
          </aside>
        </>
      )}
    </div>
  );
}
