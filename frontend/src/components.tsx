import type { ReactNode } from "react";

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
