import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type ModelRow } from "./api";
import { Loading, Notice, Section, chartTooltip } from "./components";
import { FLAG, GRAPHITE, MODEL_COLORS, RULE, dec, int, pct, useApi, useRun } from "./lib";

const METRICS: { key: keyof ModelRow; label: string }[] = [
  { key: "precision", label: "Precision" }, { key: "recall", label: "Recall" }, { key: "f1", label: "F1" },
  { key: "average_precision", label: "Average precision" }, { key: "roc_auc", label: "ROC-AUC" }, { key: "precision_at_k", label: "Precision@100" },
];

export function Models() {
  const { runKey } = useRun();
  const m = useApi(api.metrics, [runKey]);
  const s = useApi(api.sensitivity, [runKey]);
  if (m.loading) return <Loading />;
  if (m.error || !m.data) return <Notice tone="error">{m.error}</Notice>;
  const { models, labeled, params } = m.data;
  const chart = METRICS.map((x) => ({ metric: x.label, ...Object.fromEntries(models.map((r) => [r.key, r[x.key] ?? 0])) }));
  const best = (k: keyof ModelRow) => Math.max(...models.map((r) => Number(r[k] ?? -1)));
  const noisy = models.find((r) => r.flag_rate > 0.3);
  const lastSens = s.data?.rows[s.data.rows.length - 1];

  return (
    <div className="space-y-8">
      {!labeled && <Notice tone="warn">This run has no labels, so accuracy metrics are unavailable. Flag rates are still shown. Re-run with synthetic anomalies enabled to compare detectors.</Notice>}
      {noisy && labeled && (
        <Notice tone="warn">
          {noisy.model} labels {pct(noisy.flag_rate)} of baskets as noise at eps {params.dbscan_eps}. That gives it recall of {dec(noisy.recall, 2)} but precision of only {pct(noisy.precision)}: it is flagging nearly everything.
          {lastSens && ` Raising eps to ${dec(lastSens.eps, 2)} brings the noise rate down to ${pct(lastSens.noise_rate)}.`} Tune eps before drawing conclusions.
        </Notice>
      )}

      {labeled && (
        <Section title="Detector accuracy on injected anomalies" note="Scores are measured against synthetic labels. They show whether each detector can recover the planted changes, not how well it finds real fraud.">
          <div className="h-[320px]" role="img" aria-label="Grouped bar chart comparing precision, recall, F1, average precision, ROC-AUC and precision at 100 for each detector">
            <ResponsiveContainer>
              <BarChart data={chart} margin={{ top: 8, right: 8, left: 0 }}>
                <CartesianGrid stroke={RULE} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="metric" stroke={GRAPHITE} /><YAxis domain={[0, 1]} stroke={GRAPHITE} />
                <Tooltip {...chartTooltip} formatter={(v: number) => dec(v, 3)} />
                <Legend />
                {models.map((r) => <Bar key={r.key} dataKey={r.key} name={r.model} fill={MODEL_COLORS[r.key]} isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      <Section title="Detector comparison" note="Best value in each column is bold. Flag rate is the share of all baskets the detector labelled anomalous.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm num">
            <thead className="border-b border-ink text-left text-graphite"><tr>
              <th className="py-2 pr-3 font-medium">Detector</th><th className="px-2 text-right font-medium">Flag rate</th>
              {labeled && METRICS.map((x) => <th key={x.key} className="px-2 text-right font-medium">{x.label}</th>)}
            </tr></thead>
            <tbody>
              {models.map((r) => (
                <tr key={r.key} className="border-b border-rule/70">
                  <td className="py-2 pr-3"><span className="flex items-center gap-2"><i className="inline-block h-3 w-3" style={{ background: MODEL_COLORS[r.key] }} />{r.model}</span></td>
                  <td className="px-2 text-right" style={{ color: r.flag_rate > 0.3 ? FLAG : undefined }}>{pct(r.flag_rate)}</td>
                  {labeled && METRICS.map((x) => <td key={x.key} className={`px-2 text-right ${Number(r[x.key]) === best(x.key) ? "font-semibold" : ""}`}>{dec(r[x.key] as number, 3)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[13px] text-graphite">Per-detector run time is not recorded by the pipeline; the whole detection step is timed once and shown on the overview.</p>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="DBSCAN sensitivity to eps" note="Noise rate as eps changes around the value used in this run. A steep drop means results depend heavily on this one setting.">
          {s.loading ? <Loading label="Refitting DBSCAN at five eps values" /> : s.error || !s.data ? <Notice tone="error">{s.error}</Notice> : (
            <div className="h-[260px]">
              <ResponsiveContainer>
                <LineChart data={s.data.rows} margin={{ top: 8, right: 16 }}>
                  <CartesianGrid stroke={RULE} strokeDasharray="2 4" />
                  <XAxis dataKey="eps" tickFormatter={(v: number) => dec(v, 2)} stroke={GRAPHITE} />
                  <YAxis domain={[0, 1]} tickFormatter={(v: number) => pct(v, 0)} stroke={GRAPHITE} />
                  <Tooltip {...chartTooltip} labelFormatter={(v: number) => `eps ${dec(v, 3)}`} formatter={(v: number, _n, p) => [`${pct(v)} noise, ${int(p.payload.clusters)} clusters`, "DBSCAN"]} />
                  <Line dataKey="noise_rate" stroke={MODEL_COLORS.dbscan} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
        <Section title="Distance to the 10th nearest neighbour" note="A common guide for choosing eps: look for where the curve bends upward. The dashed line is the eps used in this run.">
          {s.loading ? <Loading /> : s.data && (
            <div className="h-[260px]">
              <ResponsiveContainer>
                <LineChart data={s.data.kdistance.map((d, i) => ({ i, d }))} margin={{ top: 8, right: 16 }}>
                  <CartesianGrid stroke={RULE} strokeDasharray="2 4" />
                  <XAxis dataKey="i" hide /><YAxis stroke={GRAPHITE} />
                  <Tooltip {...chartTooltip} formatter={(v: number) => [dec(v, 3), "Distance"]} labelFormatter={() => ""} />
                  <ReferenceLine y={s.data.eps} stroke={FLAG} strokeDasharray="5 4" label={{ value: `eps ${dec(s.data.eps, 2)}`, fill: FLAG, fontSize: 12, position: "insideTopLeft" }} />
                  <Line dataKey="d" stroke={GRAPHITE} dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      </div>

      <Section title="Settings used in this run">
        <dl className="grid max-w-3xl grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-8 gap-y-3 text-sm num">
          {([["DBSCAN eps", params.dbscan_eps], ["DBSCAN min samples", params.dbscan_min_samples], ["HDBSCAN min cluster size", params.hdbscan_min_cluster_size],
            ["HDBSCAN min samples", params.hdbscan_min_samples], ["Baskets analysed", params.sample_size], ["Share sent to review", pct(params.review_fraction, 0)]] as [string, string | number][])
            .map(([k, v]) => <div key={k}><dt className="text-graphite">{k}</dt><dd className="font-medium">{v}</dd></div>)}
        </dl>
      </Section>
    </div>
  );
}
