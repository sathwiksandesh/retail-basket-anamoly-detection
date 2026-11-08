import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis, ZAxis, Tooltip } from "recharts";
import { api } from "./api";
import { Card, Loading, Notice, Section, chartTooltip } from "./components";
import { FLAG, GRAPHITE, INK, RULE, dec, hour, int, pct, useApi, useRun } from "./lib";

const signed = (n: number, fmt: (x: number) => string = int) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${fmt(Math.abs(n))}`;

function TraceTooltip({ active, payload }: { active?: boolean; payload?: { payload: { order_id: number; item_count: number; score: number; flagged: boolean } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="border border-rule bg-paper px-3 py-2 text-[13px] num">
      <div className="font-medium">Basket #{p.order_id}</div>
      <div>{int(p.item_count)} items · priority {dec(p.score, 3)}</div>
      <div style={{ color: p.flagged ? FLAG : GRAPHITE }}>{p.flagged ? "In the review queue" : "Not flagged"}</div>
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
    <div className="space-y-10">
      <Notice tone="warn">{sum.warning}</Notice>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Key figures">
        <Card tone="flag" label="Flagged for review" value={int(sum.flagged)} sub={`${pct(sum.flag_rate)} of baskets`}
          delta={sum.previous ? `${signed(sum.flagged - sum.previous.flagged)} vs previous run` : undefined} />
        <Card label="Baskets analysed" value={int(sum.baskets)} sub={sum.dataset_name}
          delta={sum.previous ? `${signed(sum.baskets - sum.previous.baskets)} vs previous run` : undefined} />
        {sum.labeled && sum.synthetic_anomalies != null
          ? <Card label="Injected anomalies caught" value={`${int(sum.synthetic_caught)}/${int(sum.synthetic_anomalies)}`}
              sub={`${pct((sum.synthetic_caught ?? 0) / sum.synthetic_anomalies)} recall in the review queue`}
              delta={sum.previous?.recall != null ? `${signed((sum.synthetic_caught ?? 0) / sum.synthetic_anomalies - sum.previous.recall, (x) => `${(x * 100).toFixed(1)} pts`)} recall vs previous run` : undefined} />
          : <Card label="Injected anomalies" value="None" sub="This run has no labels, so recall cannot be measured" />}
        <Card label="Detection time" value={`${dec(sum.runtime_seconds, 1)} s`} sub="All four detectors"
          delta={sum.previous ? `${signed(sum.runtime_seconds - sum.previous.runtime_seconds, (x) => `${x.toFixed(1)} s`)} vs previous run` : undefined} />
      </div>
      {!sum.previous && <p className="-mt-4 text-[13px] text-graphite">Run another analysis from Data and runs to see changes against this one.</p>}

      <Section title="What the counts mean" note="Flagged is not the same as anomalous. Only the last two rows come from a person looking at a basket.">
        <table className="w-full max-w-4xl text-sm num">
          <tbody className="[&_td]:border-b [&_td]:border-rule/70 [&_td]:py-2 [&_td:first-child]:pr-4 [&_td:first-child]:font-medium [&_td:nth-child(2)]:pr-6 [&_td:nth-child(2)]:text-right">
            <tr><td>Baskets analysed</td><td>{int(sum.baskets)}</td><td className="text-graphite">Every basket in this run.</td></tr>
            {sum.labeled && <tr><td>Injected anomalies</td><td>{int(sum.synthetic_anomalies)}</td><td className="text-graphite">Planted by the pipeline so accuracy can be measured. Not real events.</td></tr>}
            <tr><td>Flagged for review</td><td>{int(sum.flagged)}</td>
              <td className="text-graphite">{sum.labeled && sum.flagged_genuine != null ? `${int(sum.synthetic_caught)} are injected and ${int(sum.flagged_genuine)} are genuine baskets that look unusual. Nothing here is a confirmed problem.` : "Highest review priority. Unusual does not mean wrong."}</td></tr>
            <tr><td>Confirmed after review</td><td style={{ color: sum.decisions.confirmed ? FLAG : undefined }}>{int(sum.decisions.confirmed)}</td><td className="text-graphite">A reviewer judged the basket to be anomalous.</td></tr>
            <tr><td>Dismissed as normal</td><td>{int(sum.decisions.dismissed)}</td>
              <td className="text-graphite">{sum.decisions.confirmed + sum.decisions.dismissed > 0
                ? `${int(sum.decisions.pending)} still awaiting review. Of ${int(sum.decisions.confirmed + sum.decisions.dismissed)} reviewed, ${pct(sum.decisions.confirmed / (sum.decisions.confirmed + sum.decisions.dismissed), 0)} were confirmed.`
                : `${int(sum.decisions.pending)} flagged baskets are awaiting review. Decisions are made on the Flagged baskets page.`}</td></tr>
          </tbody>
        </table>
      </Section>

      <Section title="Every basket by size and review priority"
        note={`Each dot is a basket (a sample of ${int(ov.trace.length)}). Priority comes from: ${sum.review_score_source.toLowerCase()}.`}>
        <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-hidden>
          <span className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FLAG }} />In the review queue</span>
          <span className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full opacity-50" style={{ background: GRAPHITE }} />Not flagged</span>
          <span className="flex items-center gap-2"><i className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: FLAG }} />Review cut-off</span>
        </div>
        <div className="h-[340px]" role="img" aria-label="Scatter plot of basket size against review priority, flagged baskets in red">
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid stroke={RULE} strokeDasharray="2 4" />
              <XAxis type="number" dataKey="item_count" scale="log" domain={[1, "dataMax"]} ticks={[1, 2, 5, 10, 20, 50, 100]} name="Items" stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }}
                label={{ value: "Items in basket (log scale)", position: "insideBottom", offset: -14, fill: GRAPHITE, fontSize: 13 }} />
              <YAxis type="number" dataKey="score" domain={[0, 1]} name="Priority" stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }}
                label={{ value: "Review priority", angle: -90, position: "insideLeft", fill: GRAPHITE, fontSize: 13 }} />
              <ZAxis range={[22, 22]} />
              <Tooltip content={<TraceTooltip />} cursor={{ strokeDasharray: "3 3" }} />
              <ReferenceLine y={cutoff} stroke={FLAG} strokeDasharray="5 4" label={{ value: "review cut-off", position: "insideTopLeft", fill: FLAG, fontSize: 12 }} />
              <Scatter data={normal} fill={GRAPHITE} fillOpacity={0.28} isAnimationActive={false} />
              <Scatter data={flagged} fill={FLAG} fillOpacity={0.8} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Why baskets were flagged" note="A basket can have more than one reason. Reasons are simple rules on its features, not model output.">
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={ov.reasons} layout="vertical" margin={{ left: 8, right: 24 }}>
                <XAxis type="number" stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} />
                <YAxis type="category" dataKey="reason" width={150} stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} />
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
                <XAxis dataKey="bucket" stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} label={{ value: "Items", position: "insideBottom", offset: -2, fill: GRAPHITE, fontSize: 13 }} height={36} />
                <YAxis tickFormatter={(v: number) => pct(v, 0)} stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} />
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
                <XAxis dataKey="key" tickFormatter={(h: number) => (h % 3 === 0 ? String(h) : "")} interval={0} stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} />
                <YAxis tickFormatter={(v: number) => pct(v, 0)} stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} />
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
                <XAxis dataKey="key" tickFormatter={day} stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} />
                <YAxis tickFormatter={(v: number) => pct(v, 0)} stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} />
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
void INK;
