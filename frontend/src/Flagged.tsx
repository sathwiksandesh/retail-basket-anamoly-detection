import { useEffect, useState } from "react";
import { api, type DetectorChoice, type ModelKey } from "./api";
import { Receipt } from "./Receipt";
import { Loading, Notice, Segmented, ghostBtn, inputCls } from "./components";
import { DETECTOR_LABELS, FLAG, MODEL_COLORS, dec, int, useApi, useRun } from "./lib";

const PAGE = 25;
const MODELS: ModelKey[] = ["dbscan", "hdbscan", "isolation_forest", "local_outlier_factor"];

export function Flagged() {
  const { runKey } = useRun();
  const [model, setModel] = useState<DetectorChoice>("review");
  const [flaggedOnly, setFlaggedOnly] = useState(true);
  const [minScore, setMinScore] = useState(0);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("score");
  const [desc, setDesc] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => setOffset(0), [model, flaggedOnly, minScore, q, sort, desc, runKey]);
  useEffect(() => setSelected(null), [runKey]);

  const { data, error, loading } = useApi(
    () => api.baskets({ model, flagged_only: flaggedOnly, min_score: minScore, q, sort, descending: desc, limit: PAGE, offset }),
    [model, flaggedOnly, minScore, q, sort, desc, offset, runKey],
  );

  const head = (key: string, label: string, right = true) => (
    <th scope="col" className={`px-2 py-2 font-medium ${right ? "text-right" : "text-left"}`} aria-sort={sort === key ? (desc ? "descending" : "ascending") : "none"}>
      <button onClick={() => (sort === key ? setDesc(!desc) : (setSort(key), setDesc(true)))} className="hover:underline">
        {label}{sort === key ? (desc ? " (high first)" : " (low first)") : ""}
      </button>
    </th>
  );

  return (
    <div className={`grid gap-6 ${selected ? "xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <label className="text-sm">
            <span className="block font-medium">Detector</span>
            <select className={`${inputCls} !mt-1 w-56`} value={model} onChange={(e) => setModel(e.target.value as DetectorChoice)}>
              {Object.entries(DETECTOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div className="text-sm"><span className="mb-1 block font-medium">Show</span>
            <Segmented label="Show" value={flaggedOnly ? "flagged" : "all"} onChange={(v) => setFlaggedOnly(v === "flagged")}
              options={[{ value: "flagged", label: "Flagged only" }, { value: "all", label: "All baskets" }]} />
          </div>
          <label className="text-sm">
            <span className="block font-medium">Minimum score</span>
            <input type="number" step={0.05} min={0} value={minScore} onChange={(e) => setMinScore(Math.max(0, Number(e.target.value) || 0))} className={`${inputCls} !mt-1 w-28`} />
          </label>
          <label className="text-sm">
            <span className="block font-medium">Find order or customer ID</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 3298833" className={`${inputCls} !mt-1 w-48`} />
          </label>
          <a href={api.exportUrl} className={`${ghostBtn} ml-auto`} download>Download review queue (CSV)</a>
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        {loading && !data ? <Loading /> : data && (
          <>
            <p className="mb-2 text-sm text-graphite" aria-live="polite">
              {data.total === 0 ? "No baskets match these filters." : `${int(offset + 1)}-${int(Math.min(offset + PAGE, data.total))} of ${int(data.total)} baskets. Score: ${data.score_label.toLowerCase()}.`}
              {model === "dbscan" && " DBSCAN gives only noise or not-noise, so its score is 0 or 1."}
            </p>
            <div className="overflow-x-auto border-t border-ink">
              <table className="w-full min-w-[820px] text-sm num">
                <thead className="border-b border-rule text-graphite">
                  <tr>
                    {head("order_id", "Basket", false)}
                    {head("item_count", "Items")}
                    {head("unique_departments", "Depts")}
                    {head("reorder_ratio", "Reordered")}
                    {head("days_since_prior_order", "Days since last")}
                    {head("score", "Score")}
                    <th scope="col" className="px-2 py-2 text-left font-medium">Detectors that flagged it</th>
                    <th scope="col" className="px-2 py-2 text-left font-medium">Main reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.order_id} onClick={() => setSelected(r.order_id)}
                      className={`cursor-pointer border-b border-rule/70 hover:bg-panel ${selected === r.order_id ? "bg-panel" : ""}`}>
                      <td className="px-2 py-1.5">
                        <button className="font-medium underline-offset-2 hover:underline" onClick={(e) => { e.stopPropagation(); setSelected(r.order_id); }}>#{r.order_id}</button>
                        {r.is_anomaly === 1 && <span className="ml-2 text-[12px] text-graphite">injected</span>}
                      </td>
                      <td className="px-2 text-right">{int(r.item_count)}</td>
                      <td className="px-2 text-right">{int(r.unique_departments)}</td>
                      <td className="px-2 text-right">{dec(r.reorder_ratio, 2)}</td>
                      <td className="px-2 text-right">{int(r.days_since_prior_order)}</td>
                      <td className="px-2 text-right font-medium" style={{ color: r.flagged ? FLAG : undefined }}>{dec(r.score, 3)}</td>
                      <td className="px-2">
                        <span className="flex gap-1" aria-label={MODELS.filter((m) => r.flags[m]).map((m) => DETECTOR_LABELS[m]).join(", ") || "none"}>
                          {MODELS.map((m) => <i key={m} title={`${DETECTOR_LABELS[m]}: ${r.flags[m] ? "flagged" : "normal"}`} className="inline-block h-3 w-3 border"
                            style={{ background: r.flags[m] ? MODEL_COLORS[m] : "transparent", borderColor: MODEL_COLORS[m] }} />)}
                        </span>
                      </td>
                      <td className="px-2 text-graphite">{r.reasons[0] ?? "-"}{r.reasons.length > 1 ? ` +${r.reasons.length - 1}` : ""}</td>
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
      {selected && <aside className="xl:sticky xl:top-4 xl:self-start" aria-label="Basket detail"><Receipt orderId={selected} onClose={() => setSelected(null)} /></aside>}
    </div>
  );
}
