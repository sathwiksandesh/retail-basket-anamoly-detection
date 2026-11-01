import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis, ZAxis, Tooltip } from "recharts";
import { api } from "./api";
import { Loading, Notice, Section, chartTooltip } from "./components";
import { FLAG, GRAPHITE, RULE, dec, hour, int, pct, useApi, useRun } from "./lib";

function Stat({ label, value, sub, big, color }: { label: string; value: string; sub?: string; big?: boolean; color?: string }) {
  return (
    <div className="min-w-[9rem] flex-1 border-l border-rule px-4 first:border-l-0 first:pl-0">
      <div className="text-sm text-graphite">{label}</div>
      <div className={`font-cond font-semibold leading-none num ${big ? "text-[52px]" : "text-[30px]"}`} style={{ color }}>{value}</div>
      {sub && <div className="mt-1 text-[13px] text-graphite">{sub}</div>}
    </div>
  );
}

export function Overview() {
  const { runKey } = useRun();
  const s = useApi(api.summary, [runKey]);
  const o = useApi(api.overview, [runKey]);
  if (s.loading || o.loading) return <Loading />;
  if (s.error || o.error || !s.data || !o.data) return <Notice tone="error">{s.error ?? o.error}</Notice>;
  const sum = s.data, ov = o.data;
  const cutoff = Math.min(...ov.trace.filter((t) => t.flagged).map((t) => t.score));
  const normal = ov.trace.filter((t) => !t.flagged);
  const flagged = ov.trace.filter((t) => t.flagged);
  const sizeRate = ov.sizes.map((b) => ({ bucket: b.bucket, rate: b.flagged / Math.max(1, b.flagged + b.normal), flagged: b.flagged, total: b.flagged + b.normal }));
  const day = (k: number) => `Day ${k}`;

  return (
    <div className="space-y-8">
      <Notice tone="warn">{sum.warning}</Notice>

      <div className="flex flex-wrap items-end gap-y-4">
        <Stat big label="Flagged for review" value={int(sum.flagged)} sub={`${pct(sum.flag_rate)} of baskets`} color={FLAG} />
        <Stat label="Baskets analysed" value={int(sum.baskets)} sub={sum.dataset_name} />
        {sum.labeled && sum.synthetic_anomalies != null
          ? <Stat label="Injected anomalies caught" value={`${int(sum.synthetic_caught)} of ${int(sum.synthetic_anomalies)}`} sub={`${pct((sum.synthetic_caught ?? 0) / sum.synthetic_anomalies, 0)} recall in the review queue`} />
          : <Stat label="Injected anomalies" value="None" sub="This run has no labels" />}
        <Stat label="Average basket" value={dec(sum.mean_basket_size, 1)} sub="items per order" />
        <Stat label="Detection time" value={`${dec(sum.runtime_seconds, 1)} s`} sub="all four detectors" />
      </div>

      <Section title="Every basket by size and review priority"
        note={`Each dot is a basket (a sample of ${int(ov.trace.length)}). Red dots are in the review queue. Priority comes from: ${sum.review_score_source.toLowerCase()}.`}>
        <div className="h-[340px]" role="img" aria-label="Scatter plot of basket size against review priority, flagged baskets in red">
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid stroke={RULE} strokeDasharray="2 4" />
              <XAxis type="number" dataKey="item_count" scale="log" domain={[1, "dataMax"]} ticks={[1, 2, 5, 10, 20, 50, 100]} name="Items" stroke={GRAPHITE}
                label={{ value: "Items in basket (log scale)", position: "insideBottom", offset: -14, fill: GRAPHITE, fontSize: 13 }} />
              <YAxis type="number" dataKey="score" domain={[0, 1]} name="Priority" stroke={GRAPHITE}
                label={{ value: "Review priority", angle: -90, position: "insideLeft", fill: GRAPHITE, fontSize: 13 }} />
              <ZAxis range={[22, 22]} />
              <Tooltip {...chartTooltip} cursor={{ strokeDasharray: "3 3" }} formatter={(v: number, n: string) => [n === "Priority" ? dec(v, 3) : int(v), n]} />
              <ReferenceLine y={cutoff} stroke={FLAG} strokeDasharray="5 4" label={{ value: "review cut-off", position: "insideTopLeft", fill: FLAG, fontSize: 12 }} />
              <Scatter data={normal} fill={GRAPHITE} fillOpacity={0.35} isAnimationActive={false} />
              <Scatter data={flagged} fill={FLAG} fillOpacity={0.8} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Why baskets were flagged" note="A basket can have more than one reason. Reasons are simple rules on its features, not model output.">
          <div style={{ height: 40 * ov.reasons.length + 30 }}>
            <ResponsiveContainer>
              <BarChart data={ov.reasons} layout="vertical" margin={{ left: 8, right: 24 }}>
                <XAxis type="number" stroke={GRAPHITE} />
                <YAxis type="category" dataKey="reason" width={190} stroke={GRAPHITE} tick={{ fontSize: 13 }} />
                <Tooltip {...chartTooltip} formatter={(v: number) => [int(v), "Flagged baskets"]} />
                <Bar dataKey="count" fill={INKISH} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Share of baskets flagged, by basket size" note="Very small and very large baskets are flagged most often.">
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={sizeRate} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid stroke={RULE} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="bucket" stroke={GRAPHITE} label={{ value: "Items", position: "insideBottom", offset: -2, fill: GRAPHITE, fontSize: 13 }} height={36} />
                <YAxis tickFormatter={(v: number) => pct(v, 0)} stroke={GRAPHITE} />
                <Tooltip {...chartTooltip} formatter={(v: number, _n, p) => [`${pct(v)} (${int(p.payload.flagged)} of ${int(p.payload.total)})`, "Flagged"]} />
                <Bar dataKey="rate" fill={FLAG} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Share flagged by order hour">
          <div className="h-[220px]">
            <ResponsiveContainer>
              <BarChart data={ov.hours} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke={RULE} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="key" tickFormatter={(h: number) => (h % 3 === 0 ? String(h) : "")} interval={0} stroke={GRAPHITE} />
                <YAxis tickFormatter={(v: number) => pct(v, 0)} stroke={GRAPHITE} />
                <Tooltip {...chartTooltip} labelFormatter={(h: number) => hour(h)} formatter={(v: number, _n, p) => [`${pct(v)} (${int(p.payload.flagged)} of ${int(p.payload.total)})`, "Flagged"]} />
                <Bar dataKey="flag_rate" fill={INKISH} isAnimationActive={false}>
                  {ov.hours.map((h) => <Cell key={h.key} fill={h.key <= 5 ? FLAG : INKISH} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Share flagged by day of week" note="Instacart numbers days 0 to 6 without saying which is which, and has no calendar dates, so trends over time cannot be shown.">
          <div className="h-[220px]">
            <ResponsiveContainer>
              <BarChart data={ov.weekdays} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke={RULE} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="key" tickFormatter={day} stroke={GRAPHITE} />
                <YAxis tickFormatter={(v: number) => pct(v, 0)} stroke={GRAPHITE} />
                <Tooltip {...chartTooltip} labelFormatter={day} formatter={(v: number, _n, p) => [`${pct(v)} (${int(p.payload.flagged)} of ${int(p.payload.total)})`, "Flagged"]} />
                <Bar dataKey="flag_rate" fill={INKISH} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>
    </div>
  );
}
const INKISH = "#3d4a45";
