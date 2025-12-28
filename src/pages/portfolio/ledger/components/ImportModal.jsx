import React, { useMemo, useState } from "react";
import { parseIbkrActivityStatement } from "../utils/parseIbkrStatement.js";

/* =========================
   Helpers
========================= */

function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isIsoDateTime(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s);
}

function deriveDate(r) {
  if (isIsoDate(r.date)) return r.date;
  if (isIsoDateTime(r.ts)) return r.ts.slice(0, 10);
  return "";
}
function deriveTs(r) {
  if (isIsoDateTime(r.ts)) return r.ts;
  const d = deriveDate(r);
  return d ? `${d}T00:00:00` : "";
}

const normStr = (x) => String(x || "").trim();
const normUpper = (x) => normStr(x).toUpperCase();
const normNum = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

function makeImportKey(r) {
  const tab = normStr(r.tab).toLowerCase();
  const broker = normUpper(r.broker || "IBKR");
  const tsOrDate = deriveTs(r) || deriveDate(r);
  const currency = normStr(r.currency || "");

  if (tab === "cash") {
    const amount = normNum(r.amount);
    const entryType = normStr(
      r.entryType || (amount >= 0 ? "deposit" : "withdrawal")
    ).toLowerCase();
    const note = normStr(r.note || "");
    return [broker, tab, tsOrDate, currency, entryType, amount.toFixed(8), note].join("|");
  }

  if (tab === "dividends") {
    const amount = normNum(r.amount);
    const ticker = normUpper(r.ticker || "");
    const note = normStr(r.note || "");
    return [broker, tab, tsOrDate, currency, ticker, amount.toFixed(8), note].join("|");
  }

  const ticker = normUpper(r.ticker || "");
  const qty = normNum(r.quantity);
  const price = normNum(r.price);
  const fee = Math.abs(normNum(r.fee));
  return [broker, tab, tsOrDate, currency, ticker, qty.toFixed(8), price.toFixed(8), fee.toFixed(8)].join("|");
}

function isIncomplete(r) {
  const tab = normStr(r.tab).toLowerCase();
  if (!deriveDate(r)) return true;

  if (tab === "cash") {
    return r.amount === "" || r.amount === null || r.amount === undefined;
  }

  if (tab === "dividends") {
    if (r.amount === "" || r.amount === null || r.amount === undefined) return true;
    return !normStr(r.ticker);
  }

  if (!normStr(r.ticker)) return true;
  if (r.quantity === "" || r.quantity === null || r.quantity === undefined) return true;
  if (r.price === "" || r.price === null || r.price === undefined) return true;

  return false;
}

const money = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(2) : "";
};

/* =========================
   Component
========================= */

export default function ImportModal({ onClose, onImported }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState({});
  const [filterTab, setFilterTab] = useState("all");
  const [hideDup, setHideDup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /* ---------- counts ---------- */
  const counts = useMemo(() => {
    const c = { trades: 0, forex: 0, cash: 0, dividends: 0 };
    rows.forEach((r) => {
      if (c[r.tab] !== undefined) c[r.tab]++;
    });
    return c;
  }, [rows]);

  /* ---------- visible + sorted ---------- */
  const visibleRows = useMemo(() => {
    let base = filterTab === "all" ? rows : rows.filter((r) => r.tab === filterTab);
    if (hideDup) base = base.filter((r) => !r.dup);

    const rank = (r) => {
      if (r.needsReview) return 0;
      if (r.dup) return 1;
      if (selected[r._tempId]) return 2;
      return 3;
    };

    return [...base].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (a.date < b.date) return 1;
      if (a.date > b.date) return -1;
      return a._tempId.localeCompare(b._tempId);
    });
  }, [rows, filterTab, hideDup, selected]);

  /* ---------- file ingest ---------- */
  const onPickFile = async (f) => {
    setErr("");
    setRows([]);
    setSelected({});
    setFileName(f?.name || "");
    if (!f) return;

    try {
      const text = await f.text();
      const parsed = parseIbkrActivityStatement(text);

      const enriched = parsed.map((r) => {
        const date = deriveDate(r);
        const ts = deriveTs(r);
        const importKey = makeImportKey({ ...r, date, ts });
        const needsReview = isIncomplete({ ...r, date, ts });
        return { ...r, date, ts, importKey, needsReview, dup: false };
      });

      const sel = {};
      enriched.forEach((r) => (sel[r._tempId] = !r.needsReview));

      setRows(enriched);
      setSelected(sel);

      // dedupe preview
      const byTab = enriched.reduce((a, r) => {
        (a[r.tab] ||= []).push(r.importKey);
        return a;
      }, {});
      const dupKeys = new Set();

      for (const [tab, keys] of Object.entries(byTab)) {
        const res = await fetch("/api/ledger/importPreview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab, keys }),
        });
        if (!res.ok) continue;
        const json = await res.json();
        (json.existingKeys || []).forEach((k) => dupKeys.add(k));
      }

      setRows((prev) => prev.map((r) => ({ ...r, dup: dupKeys.has(r.importKey) })));
      setSelected((prev) => {
        const n = { ...prev };
        enriched.forEach((r) => {
          if (dupKeys.has(r.importKey)) n[r._tempId] = false;
        });
        return n;
      });
    } catch (e) {
      console.error(e);
      setErr("Failed to parse IBKR statement.");
    }
  };

  /* ---------- inline edit ---------- */
  const editRow = (id, patch) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r._tempId !== id) return r;
        const next = { ...r, ...patch };
        next.date = deriveDate(next);
        next.ts = deriveTs(next);
        next.importKey = makeImportKey(next);
        next.needsReview = isIncomplete(next);
        return next;
      })
    );
  };

  /* ---------- import ---------- */
  const finalImport = async () => {
    setErr("");
    setBusy(true);

    try {
      const chosen = rows.filter((r) => selected[r._tempId]);
      if (!chosen.length) {
        setErr("Nothing selected to import.");
        setBusy(false);
        return;
      }

      const stillBad = chosen.filter((r) => r.needsReview);
      if (stillBad.length) {
        setErr(`Fix ${stillBad.length} row(s) before importing.`);
        setBusy(false);
        return;
      }

      const res = await fetch("/api/ledger/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: chosen }),
      });

      if (!res.ok) throw new Error();
      onImported?.();
    } catch {
      setErr("Import failed. Check server logs.");
    } finally {
      setBusy(false);
    }
  };

  /* =========================
     Render
  ========================= */

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Import IBKR Activity Statement</h3>

        <input type="file" accept=".csv,.txt" onChange={(e) => onPickFile(e.target.files?.[0])} />

        <div className="toolbar">
          <select value={filterTab} onChange={(e) => setFilterTab(e.target.value)}>
            <option value="all">All</option>
            <option value="trades">Trades</option>
            <option value="forex">Forex</option>
            <option value="cash">Cash</option>
            <option value="dividends">Dividends</option>
          </select>

          <label>
            <input type="checkbox" checked={hideDup} onChange={(e) => setHideDup(e.target.checked)} /> Hide DUP
          </label>

          <button disabled={busy} onClick={finalImport}>
            {busy ? "Importing…" : "Final Import"}
          </button>
        </div>

        <div className="counts">
          Trades {counts.trades} · Forex {counts.forex} · Cash {counts.cash} · Dividends {counts.dividends}
        </div>

        {err && <div className="error">{err}</div>}

        <table className="import-table">
          <thead>
            <tr>
              <th></th>
              <th>Tab</th>
              <th>Date</th>
              <th>Ticker</th>
              <th>Qty / Amt</th>
              <th>Price</th>
              <th>Fee</th>
              <th>Amount</th>
              <th>CCY</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r._tempId} style={r.dup ? { opacity: 0.55 } : undefined}>
                <td>
                  <input
                    type="checkbox"
                    disabled={r.dup || r.needsReview}
                    checked={!!selected[r._tempId]}
                    onChange={(e) => setSelected((p) => ({ ...p, [r._tempId]: e.target.checked }))}
                  />
                  {r.dup && <span className="tag dup">DUP</span>}
                  {r.needsReview && <span className="tag fix">FIX</span>}
                </td>
                <td>{r.tab}</td>
                <td>
                  <input type="date" value={r.date || ""} onChange={(e) => editRow(r._tempId, { date: e.target.value })} />
                </td>
                <td>
                  {r.tab === "dividends" ? (
                    <input
                      value={r.ticker || ""}
                      onChange={(e) => editRow(r._tempId, { ticker: e.target.value.toUpperCase() })}
                    />
                  ) : (
                    r.ticker || ""
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  {r.tab === "dividends" ? money(r.amount) : r.quantity ?? ""}
                </td>
                <td style={{ textAlign: "right" }}>{r.price ?? ""}</td>
                <td style={{ textAlign: "right" }}>{r.fee ?? ""}</td>
                <td style={{ textAlign: "right" }}>{r.amount ?? ""}</td>
                <td>{r.currency}</td>
                <td>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
