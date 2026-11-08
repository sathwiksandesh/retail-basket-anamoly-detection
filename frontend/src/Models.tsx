import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type ModelRow } from "./api";
import { Loading, Notice, Section, chartTooltip } from "./components";
import { FLAG, GRAPHITE, INK, MODEL_COLORS, RULE, dec, int, pct, useApi, useRun } from "./lib";

type MetricKey = "precision" | "recall" | "f1" | "average_precision" | "roc_auc" | "precision_at_k";

export function Models() {
  const { runKey } = useRun();
  const m = useApi(api.metrics, [runKey]);
  const s = useApi(api.sensitivity, [runKey]);
  const [off, setOff] = useState<MetricKey[]>([]);
  if (m.loading) return <Loading />;
  if (m.error || !m.data) return <Notice tone="error">{m.error}</Notice>;
  const { models, labeled, params, recommended, recommendation } = m.data;
  const k = models[0]?.top_k ?? 100;
  const METRICS: { key: MetricKey; label: string; help: string }[] = [
    { key: "precision", label: "Precision", help: "Of the baskets a detector flags, the share that are injected anomalies. Low precision means reviewers waste time on false alarms." },
    { key: "recall", label: "Recall", help: "Of all injected anomalies, the share the detector flags. Low recall means real problems are missed." },
    { key: "f1", label: "F1", help: "One number that balances precision and recall. It is low if either one is low." },
    { key: "average_precision", label: "Average precision", help: "How well the true anomalies are ranked near the top, across every possible cut-off." },
    { key: "roc_auc", label: "ROC-AUC", help: "The chance a random anomaly scores higher than a random normal basket. It ignores how many baskets you would have to review, so it can look good for a queue nobody can work through." },
    { key: "precision_at_k", label: `Precision@${k}`, help: `Share of injected anomalies among the ${k} highest-scored baskets: the quality of the very top of the queue.` },
  ];
  const shown = METRICS.filter((x) => !off.includes(x.key));
  const toggle = (key: MetricKey) => setOff((o) => (o.includes(key) ? o.filter((x) => x !== key) : [...o, key]));
  const chart = shown.map((x) => ({ metric: x.label, ...Object.fromEntries(models.map((r) => [r.key, r[x.key as keyof ModelRow] ?? 0])) }));
  const best = (key: MetricKey) => Math.max(...models.map((r) => Number(r[key] ?? -1)));
  const noisy = models.find((r) => r.flag_rate > 0.3);
  const lastSens = s.data?.rows[s.data.rows.length - 1];
  const rec = models.find((r) => r.key === recommended);

  return (
    <div className="space-y-10">
      {!labeled && <Notice tone="warn">This run has no labels, so accuracy metrics are unavailable. Flag rates are still shown. Re-run with synthetic anomalies enabled to compare detectors.</Notice>}
      {noisy && labeled && (
        <Notice tone="warn">
          {noisy.model} labels {pct(noisy.flag_rate)} of baskets as noise at eps {params.dbscan_eps}. That gives it recall of {dec(noisy.recall, 2)} but precision of only {pct(noisy.precision)}: it is flagging nearly everything.
          {lastSens && ` Raising eps to ${dec(lastSens.eps, 2)} brings the noise rate down to ${pct(lastSens.noise_rate)}.`} Tune eps before drawing conclusions.
        </Notice>
      )}
      {rec && recommendation && (
        <section className="border-l-4 border-m-hdbscan bg-panel p-4" aria-label="Recommended detector">
          <h2 className="font-cond text-[19px] font-semibold">Recommended detector: {rec.model}</h2>
          <p className="mt-1 max-w-[80ch] text-sm">{recommendation}</p>
          <p className="mt-2 max-w-[80ch] text-[13px] text-graphite">Picked by F1 so that precision and recall both count, and only from detectors that flag 30% of baskets or fewer. For a review team, every false alarm costs time, so check precision before trusting a high recall.</p>
        </section>
      )}

      {labeled && (
        <Section title="Detector accuracy on injected anomalies" note="Scores are measured against synthetic labels. They show whether each detector can recover the planted changes, not how well it finds real fraud.">
          <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Metrics to show">
            <span className="mr-1 text-sm font-medium">Show metrics</span>
            {METRICS.map((x) => (
              <button key={x.key} type="button" aria-pressed={!off.includes(x.key)} title={x.help} onClick={() => toggle(x.key)}
                className={`border px-2.5 py-1 text-sm ${off.includes(x.key) ? "border-rule text-graphite" : "border-ink bg-ink text-paper"}`}>{x.label}</button>
            ))}
          </div>
          {shown.length === 0 ? <Notice>Choose at least one metric.</Notice> : (
            <div className="h-[320px]" role="img" aria-label="Grouped bar chart comparing the selected metrics for each detector">
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ top: 8, right: 8, left: 0 }}>
                  <CartesianGrid stroke={RULE} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="metric" stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} />
                  <YAxis domain={[0, 1]} stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} />
                  <Tooltip {...chartTooltip} formatter={(v: number) => dec(v, 3)} />
                  <Legend />
                  {models.map((r) => <Bar key={r.key} dataKey={r.key} name={r.model + (r.key === recommended ? " (recommended)" : "")} fill={MODEL_COLORS[r.key]} isAnimationActive={false} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      )}

      <Section title="Detector comparison" note="Best value in each column is bold. Hover a column heading for its meaning.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm num">
            <thead className="border-b border-ink text-left text-graphite"><tr>
              <th className="py-2 pr-3 font-medium">Detector</th>
              <th className="px-2 text-right font-medium" title="Share of all baskets the detector labelled anomalous">Flag rate</th>
              {labeled && <th className="px-2 text-right font-medium" title="Injected anomalies the detector flagged, out of all injected">Injected caught</th>}
              {labeled && shown.map((x) => <th key={x.key} className="px-2 text-right font-medium" title={x.help}>{x.label}</th>)}
            </tr></thead>
            <tbody>
              {models.map((r) => (
                <tr key={r.key} className={`border-b border-rule/70 ${r.key === recommended ? "bg-panel" : ""}`}>
                  <td className="py-2 pr-3"><span className="flex items-center gap-2"><i className="inline-block h-3 w-3" style={{ background: MODEL_COLORS[r.key] }} />{r.model}
                    {r.key === recommended && <span className="border border-m-hdbscan px-1.5 text-[12px] font-medium text-m-hdbscan">Recommended</span>}</span></td>
                  <td className="px-2 text-right" style={{ color: r.flag_rate > 0.3 ? FLAG : undefined }}>{pct(r.flag_rate)} <span className="text-graphite">({int(r.flagged)})</span></td>
                  {labeled && <td className="px-2 text-right">{int(r.caught)}</td>}
                  {labeled && shown.map((x) => <td key={x.key} className={`px-2 text-right ${Number(r[x.key]) === best(x.key) ? "font-semibold" : ""}`}>{dec(r[x.key] as number, 3)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {labeled && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer">What each metric means</summary>
            <dl className="mt-2 grid max-w-3xl gap-2">
              {METRICS.map((x) => <div key={x.key}><dt className="font-medium">{x.label}</dt><dd className="text-graphite">{x.help}</dd></div>)}
            </dl>
          </details>
        )}
        <p className="mt-2 text-[13px] text-graphite">Per-detector run time is not recorded by the pipeline; the whole detection step is timed once and shown on the overview.</p>
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="DBSCAN sensitivity to eps" note="Noise rate as eps changes around the value used in this run. A steep drop means results depend heavily on this one setting.">
          {s.loading ? <Loading label="Refitting DBSCAN at five eps values" /> : s.error || !s.data ? <Notice tone="error">{s.error}</Notice> : (
            <div className="h-[260px]">
              <ResponsiveContainer>
                <LineChart data={s.data.rows} margin={{ top: 8, right: 16 }}>
                  <CartesianGrid stroke={RULE} strokeDasharray="2 4" />
                  <XAxis dataKey="eps" tickFormatter={(v: number) => dec(v, 2)} stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} />
                  <YAxis domain={[0, 1]} tickFormatter={(v: number) => pct(v, 0)} stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} />
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
                  <XAxis dataKey="i" hide /><YAxis stroke={GRAPHITE} tick={{ fill: INK, fontSize: 13 }} />
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
            .map(([key, v]) => <div key={key}><dt className="text-graphite">{key}</dt><dd className="font-medium">{v}</dd></div>)}
        </dl>
      </Section>
    </div>
  );
}
