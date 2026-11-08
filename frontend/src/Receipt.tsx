import { useEffect, useState } from "react";
import { api, type BasketDetail, type Decision } from "./api";
import { DecisionBadge, Loading, Notice, ghostBtn } from "./components";
import { DECISION_LABELS, DETECTOR_LABELS, FEATURE_LABELS, FLAG, MODEL_COLORS, dec, int, pct, useApi } from "./lib";

const share = (p: number) => `${Math.max(0.1, (p >= 0.5 ? 1 - p : p) * 100).toFixed(1)}%`;

/** One basket, printed like a till receipt: why it was flagged, how unusual each feature is, and what each detector said. */
export function Receipt({ orderId, onClose, onChanged }: { orderId: number; onClose: () => void; onChanged: () => void }) {
  const [version, setVersion] = useState(0);
  const { data: d, error, loading } = useApi(() => api.basket(orderId), [orderId, version]);
  if (loading && !d) return <Loading label="Printing basket" />;
  if (error || !d) return <Notice tone="error">{error ?? "Basket not found."}</Notice>;
  const flagged = d.review_status === "Needs Review";
  return (
    <>
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
    <ReviewPanel detail={d} onSaved={() => { setVersion((v) => v + 1); onChanged(); }} />
    </>
  );
}

/** Reviewer workflow: decision plus an optional note, saved on the server. */
function ReviewPanel({ detail, onSaved }: { detail: BasketDetail; onSaved: () => void }) {
  const [note, setNote] = useState(detail.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setNote(detail.note); setError(null); }, [detail.order_id, detail.note]);

  async function save(decision: Decision) {
    setBusy(true); setError(null);
    try { await api.review(detail.order_id, decision, note); onSaved(); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  const dirty = note.trim() !== detail.note.trim();
  return (
    <div className="mt-6 border-t border-ink pt-3 text-sm">
      <h3 className="font-cond text-[17px] font-semibold">Review</h3>
      <p className="mt-1 flex items-center gap-2">Decision: <DecisionBadge decision={detail.decision} /></p>
      {detail.decided_at && <p className="text-[13px] text-graphite">Saved {new Date(detail.decided_at).toLocaleString()}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={ghostBtn} disabled={busy || detail.decision === "confirmed"} onClick={() => void save("confirmed")}>{DECISION_LABELS.confirmed}</button>
        <button className={ghostBtn} disabled={busy || detail.decision === "dismissed"} onClick={() => void save("dismissed")}>{DECISION_LABELS.dismissed}</button>
        {detail.decision !== "pending" && <button className={ghostBtn} disabled={busy} onClick={() => void save("pending")}>Undo decision</button>}
      </div>
      <label className="mt-3 block">
        <span className="font-medium">Note</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3}
          className="mt-1 w-full border border-rule bg-paper px-2 py-1.5" placeholder="What did you check, and what did you find?" />
      </label>
      <div className="mt-1 flex items-center gap-3">
        <button className={ghostBtn} disabled={busy || !dirty} onClick={() => void save(detail.decision)}>Save note</button>
        <span className="text-[13px] text-graphite num">{note.length}/500</span>
      </div>
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
    </div>
  );
}
