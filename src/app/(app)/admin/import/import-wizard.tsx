"use client";

import { FileUp } from "lucide-react";
import Papa from "papaparse";
import { useState, useTransition } from "react";
import { guessMapping, IMPORT_FIELDS, type ImportFieldKey, type ImportRow } from "@/lib/import-fields";
import { checkImport, runImport, type Assignment, type ImportReport } from "./actions";

type Csv = { fileName: string; headers: string[]; rows: Record<string, string>[] };
type Step = "upload" | "map" | "checked" | "done";

// Upload a CSV, map its columns, preview, check duplicates, then import.
export function ImportWizard({ members }: { members: { id: string; name: string }[] }) {
  const [step, setStep] = useState<Step>("upload");
  const [csv, setCsv] = useState<Csv | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportFieldKey, string>>>({});
  const [mode, setMode] = useState<"round_robin" | "single">("round_robin");
  const [ownerId, setOwnerId] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function onFile(file: File | undefined) {
    setError("");
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        const headers = (result.meta.fields ?? []).filter(Boolean);
        if (headers.length === 0 || result.data.length === 0) {
          setError("That file has no rows. Export the sheet as CSV (File → Download → .csv) and try again.");
          return;
        }
        setCsv({ fileName: file.name, headers, rows: result.data });
        setMapping(guessMapping(headers));
        setStep("map");
      },
      error: (e) => setError(`Couldn't read that file: ${e.message}`),
    });
  }

  // CSV rows -> { business_name: "...", phone: "...", ... } using the mapping.
  function mappedRows(): ImportRow[] {
    if (!csv) return [];
    return csv.rows.map((r) => {
      const out: ImportRow = {};
      for (const [field, header] of Object.entries(mapping)) {
        if (header) out[field as ImportFieldKey] = r[header] ?? "";
      }
      return out;
    });
  }

  function check() {
    if (!mapping.business_name) return setError("Choose which column has the business name.");
    setError("");
    startTransition(async () => {
      const res = await checkImport(mappedRows());
      if (res.error) return setError(res.error);
      setReport(res);
      setStep("checked");
    });
  }

  function importNow() {
    if (mode === "single" && !ownerId) return setError("Choose who should own the leads.");
    setError("");
    const assignment: Assignment = mode === "single" ? { mode, ownerId } : { mode };
    startTransition(async () => {
      const res = await runImport(mappedRows(), assignment);
      if (res.error) return setError(res.error);
      setReport(res);
      setStep("done");
    });
  }

  function reset() {
    setStep("upload");
    setCsv(null);
    setReport(null);
    setError("");
  }

  const preview = mappedRows().slice(0, 5);
  const mappedFields = IMPORT_FIELDS.filter((f) => mapping[f.key]);

  return (
    <div className="space-y-6">
      {step === "upload" && (
        <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-line-strong bg-surface p-6 text-center sm:p-8">
          <FileUp aria-hidden="true" className="size-6 text-faint" strokeWidth={1.75} />
          <p className="mx-auto max-w-prose text-muted">
            In Google Sheets, choose <span className="text-fg">File → Download → Comma-separated values (.csv)</span>, then pick that file here.
            The first row should be column headers.
          </p>
          <label className="btn btn-primary w-full cursor-pointer sm:w-auto">
            Choose CSV file
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
      )}

      {csv && step !== "upload" && (
        <p className="text-label text-muted">
          {csv.fileName} · {csv.rows.length} row{csv.rows.length === 1 ? "" : "s"}
          {step !== "done" && (
            <button type="button" onClick={reset} className="ml-3 rounded-[4px] font-medium text-fg underline underline-offset-4 hover:text-accent">
              Choose a different file
            </button>
          )}
        </p>
      )}

      {step === "map" && csv && (
        <>
          <section className="card space-y-4">
            <h2 className="section-title">1. Match your columns</h2>
            <p className="text-sm text-muted">We guessed from your headers. Fix anything that&apos;s wrong; leave a field blank to skip it.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {IMPORT_FIELDS.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`map-${f.key}`} className="label">{f.label}</label>
                  <select
                    id={`map-${f.key}`}
                    className="input"
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
                  >
                    <option value="">— Skip —</option>
                    {csv.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="card space-y-4">
            <h2 className="section-title">2. Preview</h2>
            {mappedFields.length === 0 ? (
              <p className="text-sm text-muted">Match at least the business name to see a preview.</p>
            ) : (
              <div className="table-wrap sm:-mx-0">
                <table className="data-table">
                  <thead>
                    <tr>{mappedFields.map((f) => <th key={f.key} className="text-left">{f.label.replace(" (required)", "")}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i}>{mappedFields.map((f) => <td key={f.key} className="max-w-56 truncate" title={r[f.key]}>{r[f.key]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {csv.rows.length > 5 && <p className="text-xs text-muted">First 5 of {csv.rows.length} rows.</p>}
            <p className="text-xs text-muted">
              Phone numbers must be 10-digit US numbers. Won rows need a deal value; without a won date they count as won today.
            </p>
          </section>

          <button type="button" onClick={check} disabled={isPending} className="btn btn-primary w-full sm:w-auto">
            {isPending ? "Checking…" : "3. Check for duplicates"}
          </button>
        </>
      )}

      {step === "checked" && report && (
        <>
          <section className="card space-y-4">
            <h2 className="section-title">Ready to import</h2>
            <p>
              <span className="text-lg font-semibold">{report.ready}</span> new lead{report.ready === 1 ? "" : "s"} will be imported.
              {report.skipped.length > 0 && <> {report.skipped.length} row{report.skipped.length === 1 ? "" : "s"} will be skipped (listed below).</>}
            </p>
            <fieldset className="space-y-3">
              <legend className="label">Who gets them?</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line px-3 transition-colors duration-150 hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent/[0.08] sm:min-h-10">
                <input type="radio" name="mode" checked={mode === "round_robin"} onChange={() => setMode("round_robin")} className="size-4" />
                Share evenly between active reps (round robin)
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line px-3 transition-colors duration-150 hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent/[0.08] sm:min-h-10">
                <input type="radio" name="mode" checked={mode === "single"} onChange={() => setMode("single")} className="size-4" />
                Give them all to one person
              </label>
              {mode === "single" && (
                <select aria-label="Owner" className="input sm:w-64" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                  <option value="">Choose…</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
            </fieldset>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={importNow} disabled={isPending || !report.ready} className="btn btn-primary">
                {isPending ? "Importing…" : `Import ${report.ready} lead${report.ready === 1 ? "" : "s"}`}
              </button>
              <button type="button" onClick={() => setStep("map")} disabled={isPending} className="btn btn-secondary">Back to mapping</button>
            </div>
          </section>
          <SkippedList skipped={report.skipped} title="Will be skipped" />
        </>
      )}

      {step === "done" && report && (
        <>
          <section className="card space-y-3" role="status">
            <h2 className="section-title">Import finished</h2>
            <p>
              <span className="text-lg font-semibold text-success">{report.imported}</span> imported ·{" "}
              <span className="text-lg font-semibold">{report.skipped.length}</span> skipped
            </p>
            <button type="button" onClick={reset} className="btn btn-secondary">Import another file</button>
          </section>
          <SkippedList skipped={report.skipped} title="Skipped rows" />
        </>
      )}

      {error && <p role="alert" className="rounded-control bg-danger/[0.1] px-3 py-2.5 text-sm text-danger">{error}</p>}
    </div>
  );
}

function SkippedList({ skipped, title }: { skipped: ImportReport["skipped"]; title: string }) {
  if (skipped.length === 0) return null;
  return (
    <section className="card space-y-3">
      <h2 className="section-title">{title} ({skipped.length})</h2>
      <ul className="divide-y divide-line text-sm">
        {skipped.map((s) => (
          <li key={s.row} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5">
            <span><span className="text-muted">Row {s.row}:</span> {s.business_name}</span>
            <span className="text-danger">{s.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
