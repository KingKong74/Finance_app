import React, { useMemo, useState } from "react";
import { parseIbkrActivityStatement } from "../utils/parseIbkrStatement.js";

/* -------------------------
   Helpers: key + validation
------------------------- */

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

function normUpper(x) {
  return String(x || "").trim().toUpperCase();
}
function normStr(x) {
  return String(x || "").trim();
}
function normNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Same idea as server-side importKey.
 * If you already attach importKey in parser, we’ll respect it.
 */
function makeImportKey(r) {
  const tab = normStr(r.tab).toLowerCase();
  const broker = normUpper(r.broker || "IBKR");
  const account = normStr(r.account || ""); // future
  const currency = normStr(r.currency || "");

  if (tab === "cash_report") {
    const asOf = normStr(r.asOf || "");
    const b = r.balances || {};
    const a = normNum(b.AUD);
    const u = normNum(b.USD);
    const e = normNum(b.EUR);
    return [broker, account, tab, asOf, `AUD:${a.toFixed(8)}`, `USD:${u.toFixed(8)}`, `EUR:${e.toFixed(8)}`].join("|");
  }

  const tsOrDate = deriveTs(r) || deriveDate(r);

  if (tab === "cash") {
    const amount = normNum(r.amount);
    const entryType = normStr(
      r.entryType || (amount >= 0 ? "deposit" : "withdrawal")
    ).toLowerCase();
    const note = normStr(r.note || "");
    return [broker, account, tab, tsOrDate, currency, entryType, amount.toFixed(8), note].join("|");
  }

  if (tab === "dividends") {
    const amount = normNum(r.amount);
    const ticker = normUpper(r.ticker || "");
    const note = normStr(r.note || "");
    return [broker, account, tab, tsOrDate, currency, ticker, amount.toFixed(8), note].join("|");
  }

  // trades/forex/crypto
  const ticker = normUpper(r.ticker || "");
  const qty = normNum(r.quantity);
  const price = normNum(r.price);
  const fee = Math.abs(normNum(r.fee));
  return [broker, account, tab, tsOrDate, currency, ticker, qty.toFixed(8), price.toFixed(8), fee.toFixed(8)].join("|");
}

function isIncomplete(r) {
  const tab = normStr(r.tab).toLowerCase();

  if (tab === "cash_report") {
    // needs asOf + balances object
    if (!normStr(r.asOf)) return true;
    const b = r.balances || {};
    // allow zeros, but must exist
    return b.AUD == null && b.USD == null && b.EUR == null;
  }

  const date = deriveDate(r);
  if (!date) return true;

  if (tab === "cash") {
    return r.amount === undefined || r.amount === null || r.amount === "";
  }

  if (tab === "dividends") {
    if (r.amount === undefined || r.amount === null || r.amount === "") return true;
    return !normStr(r.ticker);
  }

  if (!normStr(r.ticker)) return true;
  if (r.quantity === undefined || r.quantity === null || r.quantity === "") return true;
  if (r.price === undefined || r.price === null || r.price === "") return true;
  return false;
}

function money(x) {
  const n = Number(x || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

export default function ImportModal({ onClose, onImported }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]); // extended rows with flags
  const [selected, setSelected] = useState({}); // _tempId -> boolean
  const [filterTab, setFilterTab] = useState("all");
  const [hideDup, setHideDup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const counts = useMemo(() => {
    const c = { trades: 0, forex: 0, cash: 0, dividends: 0, cash_report: 0 };
    rows.forEach((r) => {
      if (r.tab === "trades") c.trades++;
      if (r.tab === "forex") c.forex++;
      if (r.tab === "cash") c.cash++;
      if (r.tab === "dividends") c.dividends++;
      if (r.tab === "cash_report") c.cash_report++;
    });
    return c;
  }, [rows]);

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

      const da = String(a.date || a.asOf || "");
      const db = String(b.date || b.asOf || "");
      if (da < db) return 1;
      if (da > db) return -1;

      return String(a._tempId).localeCompare(String(b._tempId));
    });
  }, [rows, filterTab, selected, hideDup]);

  const toggleAllVisible = (val) => {
    setSelected((prev) => {
      const next = { ...prev };
      visibleRows.forEach((r) => {
        if (r.dup || r.needsReview) return;
        next[r._tempId] = val;
      });
      return next;
    });
  };

  async function runDedupePreview(withKeys) {
    try {
      const byTab = withKeys.reduce((acc, r) => {
        (acc[r.tab] ||= []).push(r.importKey);
        return acc;
      }, {});

      const dupKeys = new Set();

      for (const [tab, keys] of Object.entries(byTab)) {
        const resp = await fetch("/api/ledger/importPreview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab, keys }),
        });
        if (!resp.ok) continue;
        const json = await resp.json();
        (json.existingKeys || []).forEach((k) => dupKeys.add(k));
      }

      setRows((prev) => prev.map((r) => ({ ...r, dup: dupKeys.has(r.importKey) })));

      setSelected((prev) => {
        const next = { ...prev };
        withKeys.forEach((r) => {
          if (dupKeys.has(r.importKey)) next[r._tempId] = false;
        });
        return next;
      });
    } catch (e) {
      console.warn("Import preview (dedupe) failed:", e);
    }
  }

  const onPickFile = async (f) => {
    setErr("");
    setRows([]);
    setSelected({});
    setFileName(f?.name || "");

    if (!f) return;

    try {
      const text = await f.text();
      const parsed = parseIbkrActivityStatement(text);

      const withKeys = parsed.map((r) => {
        const date = deriveDate(r);
        const ts = deriveTs(r);
        const importKey = r.importKey || makeImportKey({ ...r, date, ts });
        const needsReview = isIncomplete({ ...r, date, ts });
        return {
          ...r,
          date,
          ts,
          importKey,
          needsReview,
          dup: false,
        };
      });

      const sel = {};
      withKeys.forEach((r) => {
        sel[r._tempId] = !r.needsReview;
      });

      setRows(withKeys);
      setSelected(sel);

      await runDedupePreview(withKeys);
    } catch (e) {
      console.error(e);
      setErr("Could not parse the file. Make sure it's the IBKR Activity Statement export.");
    }
  };

  const editRow = (tempId, patch) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r._tempId !== tempId) return r;

        const next = { ...r, ...patch };

        // only these use date/ts inputs
        if (next.tab !== "cash_report") {
          next.date = deriveDate(next);
          next.ts = deriveTs(next);
        }

        next.importKey = makeImportKey(next);
        next.needsReview = isIncomplete(next);

        return next;
      })
    );
  };

  const finalImport = async () => {
    setErr("");
    setBusy(true);

    try {
      const chosen = rows.filter((r) => selected[r._tempId]);
      if (!chosen.length) {
        setErr("Nothing selected to import. Select at least one row.");
        setBusy(false);
        return;
      }

      const stillBad = chosen.filter((r) => r.needsReview);
      if (stillBad.length) {
        setErr(`You have ${stillBad.length} selected row(s) that need fixing (FIX).`);
        setBusy(false);
        return;
      }

      const res = await fetch("/api/ledger/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: chosen }),
      });

      if (!res.ok) throw new Error(`Import failed: ${res.status}`);
      await res.json();

      onImported?.();
    } catch (e) {
      console.error(e);
      setErr("Import failed (server error). Check Vercel logs.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 9999 }}>
      <div style={{ background: "#fff", borderRadius: 10, width: "min(1100px, 100%)", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Import IBKR Activity Statement</h3>
          <button onClick={onClose}>Close</button>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input type="file" accept=".csv,.txt" onChange={(e) => onPickFile(e.target.files?.[0])} />
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {fileName ? `File: ${fileName}` : "Pick your IBKR Activity Statement export"}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <label>
              View:
              <select value={filterTab} onChange={(e) => setFilterTab(e.target.value)} style={{ marginLeft: 6 }}>
                <option value="all">All</option>
                <option value="trades">Trades</option>
                <option value="forex">Forex</option>
                <option value="cash">Cash (Dep/With)</option>
                <option value="dividends">Dividends</option>
                <option value="cash_report">Cash Report (Ending Cash)</option>
              </select>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={hideDup} onChange={(e) => setHideDup(e.target.checked)} />
              Hide DUP
            </label>

            <button onClick={() => toggleAllVisible(true)}>Select visible</button>
            <button onClick={() => toggleAllVisible(false)}>Deselect visible</button>

            <button disabled={!rows.length || busy} onClick={finalImport}>
              {busy ? "Importing..." : "Final Import"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 13 }}>
          Parsed: Trades {counts.trades} · Forex {counts.forex} · Cash {counts.cash} · Dividends {counts.dividends} · Cash Report {counts.cash_report}
        </div>

        {err && <div style={{ marginTop: 10, color: "crimson" }}>{err}</div>}

        <div style={{ marginTop: 12, maxHeight: 520, overflow: "auto", border: "1px solid #eee" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "#fafafa" }}>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}></th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Tab</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Date</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Ticker</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>Qty/Amount</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>Price</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>Fee</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>Amount</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Currency</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Note</th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((r) => (
                <tr key={r._tempId} style={r.dup ? { opacity: 0.55 } : undefined}>
                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" }}>
                    <input
                      type="checkbox"
                      checked={!!selected[r._tempId]}
                      disabled={r.dup || r.needsReview}
                      onChange={(e) => setSelected((p) => ({ ...p, [r._tempId]: e.target.checked }))}
                    />
                    {r.dup && <span style={{ color: "crimson", marginLeft: 6, fontWeight: 700 }}>DUP</span>}
                    {r.needsReview && <span style={{ color: "orange", marginLeft: 6, fontWeight: 700 }}>FIX</span>}
                  </td>

                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{r.tab}</td>

                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                    {r.tab === "cash_report" ? (
                      <input
                        value={r.asOf || ""}
                        placeholder="YYYY-MM-DD"
                        onChange={(e) => editRow(r._tempId, { asOf: e.target.value })}
                        style={{ width: 140 }}
                      />
                    ) : (
                      <input
                        type="date"
                        value={r.date || ""}
                        onChange={(e) => editRow(r._tempId, { date: e.target.value })}
                        style={{ width: 140 }}
                      />
                    )}
                  </td>

                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                    {r.tab === "dividends" ? (
                      <input
                        value={r.ticker || ""}
                        placeholder="Ticker"
                        onChange={(e) => editRow(r._tempId, { ticker: e.target.value.toUpperCase() })}
                        style={{ width: 90 }}
                      />
                    ) : (
                      r.ticker || ""
                    )}
                  </td>

                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                    {r.tab === "cash_report"
                      ? ""
                      : r.tab === "dividends"
                      ? money(r.amount)
                      : r.quantity ?? ""}
                  </td>

                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                    {r.tab === "dividends" || r.tab === "cash" || r.tab === "cash_report" ? "" : r.price ?? ""}
                  </td>

                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                    {r.tab === "dividends" || r.tab === "cash" || r.tab === "cash_report" ? "" : r.fee ?? ""}
                  </td>

                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                    {r.tab === "cash_report" ? (
                      <span style={{ fontFamily: "monospace" }}>
                        AUD {money(r.balances?.AUD)} · USD {money(r.balances?.USD)} · EUR {money(r.balances?.EUR)}
                      </span>
                    ) : (
                      r.amount ?? ""
                    )}
                  </td>

                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{r.currency || ""}</td>

                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{r.note || ""}</td>
                </tr>
              ))}

              {!visibleRows.length && (
                <tr>
                  <td colSpan={10} style={{ padding: 12, textAlign: "center", opacity: 0.7 }}>
                    No rows to show
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Notes: “Cash Report” imports a snapshot of Ending Cash (AUD/USD/EUR) so you don’t have to reconstruct cash from trades.
        </div>
      </div>
    </div>
  );
}
