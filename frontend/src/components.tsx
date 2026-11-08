import type { ReactNode } from "react";
import { DECISION_LABELS } from "./lib";
import type { Decision } from "./api";

export function Section({ title, note, children, className = "" }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border-t border-rule pt-4 ${className}`}>
      <h2 className="font-cond text-[19px] font-semibold leading-tight">{title}</h2>
      {note && <p className="mt-1 max-w-[68ch] text-sm text-graphite">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "error" }) {
  const bar = tone === "error" ? "border-flag" : tone === "warn" ? "border-m-iso" : "border-graphite";
  return <p role={tone === "error" ? "alert" : undefined} className={`border-l-4 ${bar} bg-panel px-3 py-2 text-sm max-w-[80ch]`}>{children}</p>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return <p className="py-8 text-sm text-graphite" aria-live="polite">{label}…</p>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex border border-rule">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-sm ${value === o.value ? "bg-ink text-paper" : "bg-paper hover:bg-panel"}`}>{o.label}</button>
      ))}
    </div>
  );
}

export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {help && <span className="mt-1 block max-w-[40ch] text-[13px] leading-snug text-graphite">{help}</span>}
    </label>
  );
}

export const inputCls = "mt-1 w-full border border-rule bg-paper px-2 py-1.5 num";
export const buttonCls = "bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-graphite disabled:opacity-50 disabled:hover:bg-ink";
export const ghostBtn = "border border-ink px-3 py-1.5 text-sm hover:bg-panel disabled:opacity-40";

export const chartTooltip = { contentStyle: { background: "#fbfbf8", border: "1px solid #bcc4bd", borderRadius: 0, fontSize: 13 }, cursor: { fill: "rgba(28,36,33,.06)" } };

/** Bar showing a 0-1 score. The number is always printed, colour only adds a tier. */
export function ScoreBar({ value, flagged }: { value: number; flagged?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  const color = !flagged ? "#56625d" : v >= 0.9 ? "#c8321e" : v >= 0.7 ? "#b7791f" : "#3b6f94";
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="h-1.5 w-16 bg-rule/70" aria-hidden><span className="block h-full" style={{ width: `${v * 100}%`, background: color }} /></span>
      <span className="w-12 text-right font-medium num">{v.toFixed(3)}</span>
    </span>
  );
}

export function DecisionBadge({ decision }: { decision: Decision }) {
  if (decision === "pending") return <span className="text-[13px] text-graphite">Awaiting</span>;
  const confirmed = decision === "confirmed";
  return <span className={`inline-block border px-1.5 text-[12px] font-medium ${confirmed ? "border-flag text-flag" : "border-graphite text-graphite"}`}>{DECISION_LABELS[decision]}</span>;
}

export function Card({ label, value, sub, delta, tone }: { label: string; value: string; sub?: string; delta?: string; tone?: "flag" }) {
  return (
    <div className={`flex min-h-[150px] flex-col rounded-md border p-4 ${tone === "flag" ? "border-flag/40 bg-[#f6e3df]" : "border-rule bg-panel"}`}>
      <div className="text-sm font-medium text-graphite">{label}</div>
      <div className="mt-1 font-cond text-[44px] font-semibold leading-none num" style={{ color: tone === "flag" ? "#c8321e" : undefined }}>{value}</div>
      {sub && <div className="mt-2 text-[13px] text-graphite">{sub}</div>}
      {delta && <div className="mt-auto pt-2 text-[13px] text-ink num">{delta}</div>}
    </div>
  );
}
