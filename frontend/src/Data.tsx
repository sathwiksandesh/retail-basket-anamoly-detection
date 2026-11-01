import { useEffect, useRef, useState } from "react";
import { api, type AnalyzeRequest, type UploadResult } from "./api";
import { Field, Loading, Notice, Section, buttonCls, ghostBtn, inputCls } from "./components";
import { dec, int, pct, useApi, useRun } from "./lib";

const PREVIEW_COLS = ["order_id", "item_count", "unique_departments", "unique_aisles", "reorder_ratio", "order_hour_of_day", "days_since_prior_order"];

export function Data({ goTo }: { goTo: (page: string) => void }) {
  const { runKey, bump } = useRun();
  const [dsKey, setDsKey] = useState(0);
  const datasets = useApi(api.datasets, [dsKey]);
  const summary = useApi(api.summary, [runKey]);
  const [datasetId, setDatasetId] = useState("sample");
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<AnalyzeRequest | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = summary.data?.params;
    if (p && !form) setForm({ dataset_id: "sample", sample_size: p.sample_size, inject_synthetic: true, contamination: p.contamination,
      dbscan_eps: p.dbscan_eps, dbscan_min_samples: p.dbscan_min_samples, hdbscan_min_cluster_size: p.hdbscan_min_cluster_size,
      hdbscan_min_samples: p.hdbscan_min_samples, review_fraction: p.review_fraction });
  }, [summary.data, form]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const ds = datasets.data?.datasets.find((d) => d.id === datasetId);
  const set = <K extends keyof AnalyzeRequest>(k: K, v: AnalyzeRequest[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const num = (v: string, fallback: number) => (v === "" || Number.isNaN(Number(v)) ? fallback : Number(v));

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true); setUpload(null); setError(null);
    try {
      const r = await api.upload(file);
      setUpload(r);
      if (r.ok && r.dataset) {
        setDsKey((k) => k + 1); setDatasetId(r.dataset.id);
        setForm((f) => f && { ...f, dataset_id: r.dataset!.id, sample_size: Math.min(r.dataset!.rows, 20000), inject_synthetic: !r.dataset!.labeled });
      }
    } catch (e) { setError((e as Error).message); }
    setUploading(false);
  }

  function choose(id: string) {
    setDatasetId(id);
    const d = datasets.data?.datasets.find((x) => x.id === id);
    if (d && form) setForm({ ...form, dataset_id: id, sample_size: Math.min(d.rows, 20000), inject_synthetic: d.builtin || !d.labeled });
  }

  async function run() {
    if (!form) return;
    setRunning(true); setElapsed(0); setError(null); setDone(null);
    try {
      const r = await api.analyze({ ...form, dataset_id: datasetId });
      setDone(`${int(r.summary.baskets)} baskets analysed in ${dec(r.summary.runtime_seconds, 1)} s. ${int(r.summary.flagged)} flagged for review (${pct(r.summary.flag_rate)}).`);
      bump();
    } catch (e) { setError((e as Error).message); }
    setRunning(false);
  }

  if (datasets.loading || !form) return datasets.error ? <Notice tone="error">{datasets.error}</Notice> : <Loading />;
  const preview = upload?.ok ? upload.preview : datasets.data?.preview[datasetId];

  return (
    <div className="space-y-8">
      <Section title="Dataset" note="Use the bundled Instacart sample or upload a CSV with one row per basket. Uploads must contain the columns listed below.">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <fieldset className="min-w-[260px]">
            <legend className="mb-1 text-sm font-medium">Analyse</legend>
            {datasets.data?.datasets.map((d) => (
              <label key={d.id} className="mb-1 flex items-start gap-2 text-sm">
                <input type="radio" name="dataset" className="mt-1" checked={datasetId === d.id} onChange={() => choose(d.id)} />
                <span>{d.name}<span className="block text-[13px] text-graphite">{int(d.rows)} baskets{d.labeled ? ", has is_anomaly labels" : ""}</span></span>
              </label>
            ))}
          </fieldset>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files[0]); }}
            className="flex w-full max-w-md flex-col items-start gap-2 border border-dashed border-graphite bg-panel p-4 text-sm">
            <span>Drop a CSV here, or choose a file. Up to 200,000 rows.</span>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" id="upload" onChange={(e) => void onFile(e.target.files?.[0])} />
            <button type="button" className={ghostBtn} disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Checking file…" : "Choose CSV file"}</button>
          </div>
        </div>

        {upload && !upload.ok && (
          <div className="mt-4 space-y-2">
            <Notice tone="error">{upload.filename}: {upload.error}</Notice>
            {upload.missing_columns && upload.missing_columns.length > 0 && <p className="max-w-[80ch] text-sm text-graphite">Missing: {upload.missing_columns.join(", ")}</p>}
          </div>
        )}
        {upload?.ok && (
          <div className="mt-4"><Notice>{upload.filename} is valid: {int(upload.rows)} baskets
            {upload.rows_dropped ? `, ${int(upload.rows_dropped)} duplicate or ID-less rows removed` : ""}
            {upload.null_counts && Object.keys(upload.null_counts).length ? `. Empty values will be filled with the column median (${Object.entries(upload.null_counts).map(([k, v]) => `${k}: ${v}`).join(", ")}).` : "."}</Notice></div>
        )}
        {preview && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[640px] text-sm num">
              <caption className="pb-1 text-left text-[13px] text-graphite">First rows of the selected dataset</caption>
              <thead className="border-y border-ink text-graphite"><tr>{PREVIEW_COLS.map((c) => <th key={c} className="px-2 py-1 text-right font-medium">{c}</th>)}</tr></thead>
              <tbody>{preview.map((r, i) => <tr key={i} className="border-b border-rule/70">{PREVIEW_COLS.map((c) => <td key={c} className="px-2 py-1 text-right">{typeof r[c] === "number" && !Number.isInteger(r[c]) ? dec(r[c], 2) : r[c]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer">Required columns ({datasets.data?.required_columns.length})</summary>
          <p className="mt-1 max-w-[80ch] text-graphite">{datasets.data?.required_columns.join(", ")}. An optional is_anomaly column (0 or 1) is used for accuracy metrics.</p>
        </details>
      </Section>

      <Section title="Settings" note="The defaults are the values in configs/config.yaml. Running replaces the current results in every page.">
        <div className="grid max-w-4xl grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-8 gap-y-5">
          <Field label="Baskets to analyse" help={`500 to 50,000. ${ds ? `This dataset has ${int(ds.rows)}.` : ""} DBSCAN memory grows quickly with size.`}>
            <input className={inputCls} type="number" min={500} max={50000} step={500} value={form.sample_size} onChange={(e) => set("sample_size", num(e.target.value, 500))} />
          </Field>
          <Field label="DBSCAN eps" help="Neighbourhood radius. Smaller values flag more baskets as noise.">
            <input className={inputCls} type="number" min={0.1} step={0.05} value={form.dbscan_eps} onChange={(e) => set("dbscan_eps", num(e.target.value, 0.7))} />
          </Field>
          <Field label="DBSCAN min samples" help="Neighbours needed to form a dense region.">
            <input className={inputCls} type="number" min={2} value={form.dbscan_min_samples} onChange={(e) => set("dbscan_min_samples", num(e.target.value, 10))} />
          </Field>
          <Field label="HDBSCAN min cluster size" help="Smallest group that counts as a cluster.">
            <input className={inputCls} type="number" min={2} value={form.hdbscan_min_cluster_size} onChange={(e) => set("hdbscan_min_cluster_size", num(e.target.value, 20))} />
          </Field>
          <Field label="HDBSCAN min samples" help="Higher values make HDBSCAN more conservative.">
            <input className={inputCls} type="number" min={1} value={form.hdbscan_min_samples} onChange={(e) => set("hdbscan_min_samples", num(e.target.value, 10))} />
          </Field>
          <Field label="Share sent to review" help="Top fraction of baskets by review priority marked Needs Review.">
            <input className={inputCls} type="number" min={0.01} max={0.2} step={0.01} value={form.review_fraction} onChange={(e) => set("review_fraction", num(e.target.value, 0.05))} />
          </Field>
          <div>
            <label className="flex items-start gap-2 text-sm font-medium">
              <input type="checkbox" className="mt-1" checked={form.inject_synthetic} onChange={(e) => set("inject_synthetic", e.target.checked)} />
              Inject synthetic anomalies
            </label>
            <p className="mt-1 max-w-[40ch] text-[13px] leading-snug text-graphite">Plants labelled unusual baskets so accuracy can be measured. Without it (and without an is_anomaly column) the accuracy metrics are unavailable.</p>
            {form.inject_synthetic && (
              <Field label="Share injected"><input className={inputCls} type="number" min={0.005} max={0.1} step={0.005} value={form.contamination} onChange={(e) => set("contamination", num(e.target.value, 0.02))} /></Field>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button className={buttonCls} onClick={() => void run()} disabled={running}>{running ? `Analysing… ${elapsed} s` : "Analyze baskets"}</button>
          <span className="text-sm text-graphite">About 20 seconds for 20,000 baskets.</span>
        </div>
        <div className="mt-4 space-y-2" aria-live="polite">
          {error && <Notice tone="error">{error}</Notice>}
          {done && <Notice>{done} <button className="underline" onClick={() => goTo("flagged")}>Open flagged baskets</button></Notice>}
        </div>
      </Section>
    </div>
  );
}
