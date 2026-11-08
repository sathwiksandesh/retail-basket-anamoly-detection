import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Data } from "./Data";
import { Flagged } from "./Flagged";
import { Models } from "./Models";
import { Overview } from "./Overview";
import { Notice } from "./components";
import { RunContext, dec, int, useApi } from "./lib";

const PAGES = [
  { id: "overview", label: "Overview" },
  { id: "flagged", label: "Flagged baskets" },
  { id: "models", label: "Model comparison" },
  { id: "data", label: "Data and runs" },
] as const;

const fromHash = () => PAGES.find((p) => p.id === window.location.hash.replace(/^#\/?/, ""))?.id ?? "overview";

export default function App() {
  const [page, setPage] = useState<string>(fromHash());
  const [runKey, setRunKey] = useState(0);
  const [running, setRunning] = useState(false);
  const bump = useCallback(() => setRunKey((k) => k + 1), []);
  const ctx = useMemo(() => ({ runKey, bump, running, setRunning }), [runKey, bump, running]);
  const summary = useApi(api.summary, [runKey]);
  const goTo = (id: string) => { window.location.hash = `#/${id}`; };

  useEffect(() => {
    const on = () => setPage(fromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const s = summary.data;
  return (
    <RunContext.Provider value={ctx}>
      <div className="mx-auto max-w-[1280px] px-5 pb-16">
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pt-5">
          <h1 className="font-cond text-[26px] font-semibold leading-none">Basket review desk</h1>
          <p className="flex flex-wrap items-center gap-x-3 text-sm num" aria-live="polite">
            <span className="flex items-center gap-2 font-medium">
              <i className={`inline-block h-2.5 w-2.5 rounded-full ${running ? "animate-pulse bg-m-iso" : s ? "bg-m-hdbscan" : "bg-rule"}`} />
              {running ? "Analysing" : s ? "Completed" : summary.error ? "No run loaded" : "Loading"}
            </span>
            {s && <span className="text-graphite">{int(s.baskets)} baskets · {dec(s.runtime_seconds, 1)} s · last run {new Date(s.created_at).toLocaleString()}</span>}
          </p>
        </header>
        <nav aria-label="Pages" className="mt-3 flex overflow-x-auto border-b border-ink">
          {PAGES.map((p) => (
            <a key={p.id} href={`#/${p.id}`} aria-current={page === p.id ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-[3px] px-4 py-2 text-[15px] ${page === p.id ? "border-ink bg-panel font-semibold" : "border-transparent text-graphite hover:bg-panel/60 hover:text-ink"}`}>{p.label}</a>
          ))}
        </nav>
        <main className="mt-6">
          {summary.error && page !== "data"
            ? <div className="space-y-3"><Notice tone="error">{summary.error}</Notice>
                <p className="text-sm text-graphite">If the API is running but has no results yet, open <a className="underline" href="#/data">Data and runs</a> and press Analyze baskets.</p></div>
            : page === "overview" ? <Overview />
            : page === "flagged" ? <Flagged />
            : page === "models" ? <Models />
            : <Data goTo={goTo} />}
        </main>
      </div>
    </RunContext.Provider>
  );
}
