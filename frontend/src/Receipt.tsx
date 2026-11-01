import { api } from "./api";
import { Loading, Notice } from "./components";
import { DETECTOR_LABELS, FEATURE_LABELS, FLAG, MODEL_COLORS, dec, int, pct, useApi } from "./lib";

const share = (p: number) => `${Math.max(0.1, (p >= 0.5 ? 1 - p : p) * 100).toFixed(1)}%`;

/** One basket, printed like a till receipt: why it was flagged, how unusual each feature is, and what each detector said. */
export function Receipt({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const { data: d, error, loading } = useApi(() => api.basket(orderId), [orderId]);
  if (loading) return <Loading label="Printing basket" />;
  if (error || !d) return <Notice tone="error">{error ?? "Basket not found."}</Notice>;
  const flagged = d.review_status === "Needs Review";
  return (
    <div className="receipt receipt-enter mb-3 px-5 pb-5 pt-4" key={d.order_id}>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">Basket #{d.order_id}</div>
          <div className="text-graphite">Customer {d.user_id ?? "-"} · order {d.order_number}</div>
          <div className="text-graphite">Day {d.order_dow}, {String(d.order_hour_of_day).padStart(2, "0")}:00</div>
        </div>
        <button onClick={onClose} className="px-1 text-graphite hover:text-ink" aria-label="Close receipt">Close</button>
      </div>
      <hr />
      <div className="flex justify-between">
        <span style={{ color: flagged ? FLAG : undefined }} className="font-medium">{flagged ? "Needs review" : "Monitor"}</span>
        <span className="num">priority {dec(d.review_score, 3)}</span>
      </div>
      <div className="text-graphite">Higher than {pct(d.review_rank_pct, 1)} of baskets in this run</div>
      {d.is_anomaly != null && (
        <div className="mt-1 text-graphite">{d.is_anomaly ? "Injected synthetic anomaly" : "Genuine basket, no injected change"}</div>
      )}
      <hr />
      <div className="mb-1 font-medium">Why</div>
      {d.reasons.map((r) => <div key={r}>- {r}</div>)}
      <hr />
      <div className="mb-2 font-medium">How unusual</div>
      {d.deviations.slice(0, 6).map((f) => (
        <div key={f.feature} className="mb-2.5">
          <div className="flex justify-between gap-2">
            <span>{FEATURE_LABELS[f.feature] ?? f.feature}</span>
            <span className="num">{Number.isInteger(f.value) ? int(f.value) : dec(f.value, 2)}</span>
          </div>
          <div className="relative my-1 h-2 bg-panel" role="img" aria-label={`${FEATURE_LABELS[f.feature]} is in the ${f.percentile >= 0.5 ? "top" : "bottom"} ${share(f.percentile)}`}>
            <span className="absolute left-1/2 top-0 h-2 w-px bg-graphite" />
            <span className="absolute top-[-2px] h-3 w-1.5 bg-ink" style={{ left: `calc(${f.percentile * 100}% - 3px)` }} />
          </div>
          <div className="text-[12px] text-graphite">typical {Number.isInteger(f.median) ? int(f.median) : dec(f.median, 2)} · {f.percentile >= 0.5 ? "top" : "bottom"} {share(f.percentile)}</div>
        </div>
      ))}
      <hr />
      <div className="mb-1 font-medium">Detectors</div>
      {d.models.map((m) => (
        <div key={m.key} className="flex items-center justify-between">
          <span className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5" style={{ background: MODEL_COLORS[m.key] }} />{DETECTOR_LABELS[m.key]}</span>
          <span className="num">{m.flagged ? "flagged" : "normal"} {dec(m.score, 2)}</span>
        </div>
      ))}
    </div>
  );
}
