import React, { useMemo, useState } from "react";
import { parseIbkrActivityStatement } from "../utils/parseIbkrStatement.js";

export default function ImportModal({ onClose, onImported }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]); // { tab, date, ... }
  const [selected, setSelected] = useState({}); // id -> boolean
  const [filterTab, setFilterTab] = useState("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const counts = useMemo(() => {
    const c = { trades: 0, forex: 0, cash: 0 };
    rows.forEach((r) => {
      if (r.tab === "trades") c.trades++;
      if (r.tab === "forex") c.forex++;
      if (r.tab === "cash") c.cash++;
    });
    return c;
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (filterTab === "all") return rows;
    return rows.filter((r) => r.tab === filterTab);
  }, [rows, filterTab]);

  const toggleAllVisible = (val) => {
    setSelected((prev) => {
      const next = { ...prev };
      visibleRows.forEach((r) => (next[r._tempId] = val));
      return next;
    });
  };

  const onPickFile = async (f) => {
    setErr("");
    setRows([]);
    setSelected({});
    setFileName(f?.name || "");

    if (!f) return;

    try {
      const text = await f.text(); // IBKR file can be TSV
      const parsed = parseIbkrActivityStatement(text);

      // default select all
      const sel = {};
      parsed.forEach((r) => (sel[r._tempId] = true));

      setRows(parsed);
      setSelected(sel);
    } catch (e) {
      console.error(e);
      setErr("Could not parse the file. Make sure it's the IBKR Activity Statement export.");
    }
  };

  const finalImport = async () => {
    setErr("");
    setBusy(true);
    try {
      const chosen = rows.filter((r) => selected[r._tempId]);

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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
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

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <label>
              View:
              <select value={filterTab} onChange={(e) => setFilterTab(e.target.value)} style={{ marginLeft: 6 }}>
                <option value="all">All</option>
                <option value="trades">Trades</option>
                <option value="forex">Forex</option>
                <option value="cash">Cash (Dep/With)</option>
              </select>
            </label>

            <button onClick={() => toggleAllVisible(true)}>Select visible</button>
            <button onClick={() => toggleAllVisible(false)}>Deselect visible</button>

            <button disabled={!rows.length || busy} onClick={finalImport}>
              {busy ? "Importing..." : "Final Import"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 13 }}>
          Parsed: Trades {counts.trades} · Forex {counts.forex} · Cash {counts.cash}
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
                <th style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>Qty</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>Price</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>Fee</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>Amount</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Currency</th>
                <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r._tempId}>
                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                    <input
                      type="checkbox"
                      checked={!!selected[r._tempId]}
                      onChange={(e) => setSelected((p) => ({ ...p, [r._tempId]: e.target.checked }))}
                    />
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{r.tab}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{r.date}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{r.ticker || ""}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                    {r.quantity ?? ""}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                    {r.price ?? ""}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                    {r.fee ?? ""}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>
                    {r.amount ?? ""}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{r.currency}</td>
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
          Notes: Sells remain negative qty. Fees are stored as positive. Deposits/withdrawals become cash entries.
        </div>
      </div>
    </div>
  );
}
