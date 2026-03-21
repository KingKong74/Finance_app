// server_api/ledger/import.js
import { db } from "../utils/db.js";
import { trades, forexTrades, cashEntries, dividends, cashReportSnapshots } from "../schema/index.js";
import { num, normUpper, normStr, makeImportKey, deriveDate, deriveTs } from "../utils/shared.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: "rows[] required" });

    const tradeDocs        = [];
    const forexDocs        = [];
    const cashDocs         = [];
    const dividendDocs     = [];
    const cashReportDocs   = [];

    for (const r of rows) {
      const tab    = normStr(r.tab).toLowerCase();
      const broker = normUpper(r.broker || "IBKR");
      const now    = new Date();

      // ── cash_report ────────────────────────────────────────────────────
      if (tab === "cash_report") {
        const date = deriveDate(r);
        if (!date) continue;
        const amount      = num(r.amount);
        const currency    = normUpper(r.currency || "AUD");
        const label       = normStr(r.label || "Ending Cash");
        const importKey   = makeImportKey("cash_report", { ...r, broker, currency, date });
        const snapshotDate = new Date(`${date}T00:00:00`);

        cashReportDocs.push({
          broker,
          currency,
          balance:      String(amount),
          snapshotDate,
          label,
          importKey,
          importedAt:   now,
        });
        continue;
      }

      const date = deriveDate(r);
      const ts   = deriveTs(r);
      if (!date) continue;

      const currency = normUpper(r.currency || (tab === "cash" ? "AUD" : "USD"));

      // ── cash ────────────────────────────────────────────────────────────
      if (tab === "cash") {
        const amount    = num(r.amount);
        const entryType = normStr(r.entryType || (amount >= 0 ? "deposit" : "withdrawal")).toLowerCase();
        const importKey = makeImportKey("cash", { ...r, broker, currency, date, ts, amount, entryType });

        cashDocs.push({
          broker,
          currency,
          entryType,
          settledAt:  new Date(ts || `${date}T00:00:00`),
          amount:     String(amount),
          note:       normStr(r.note || ""),
          importKey,
          createdAt:  now,
          importedAt: now,
        });
        continue;
      }

      // ── dividends ───────────────────────────────────────────────────────
      if (tab === "dividends") {
        const amount = num(r.amount);
        if (!amount) continue;
        const importKey = makeImportKey("dividends", { ...r, broker, currency, date, ts });

        dividendDocs.push({
          broker,
          currency,
          ticker:     normUpper(r.ticker || ""),
          paidAt:     new Date(ts || `${date}T00:00:00`),
          amount:     String(amount),
          note:       normStr(r.note || ""),
          importKey,
          createdAt:  now,
          importedAt: now,
        });
        continue;
      }

      // ── trades | crypto | forex ─────────────────────────────────────────
      if (!["trades", "crypto", "forex"].includes(tab)) continue;

      const ticker    = normUpper(r.ticker || "");
      if (!ticker) continue;

      const quantity  = num(r.quantity);
      const price     = num(r.price);
      const proceeds  = r.proceeds != null ? num(r.proceeds) : -(quantity * price);
      const fee       = Math.abs(num(r.fee));
      const feeCurrency = normUpper(r.feeCurrency || "AUD");
      const realisedPl  = num(r.realisedPL || 0);
      const tradedAt    = new Date(ts || `${date}T00:00:00`);
      const importKey   = makeImportKey(tab, { ...r, broker, currency, date, ts, ticker, quantity, price, fee });

      const doc = {
        broker,
        ticker,
        currency,
        feeCurrency,
        tradedAt,
        quantity:    String(quantity),
        price:       String(price),
        proceeds:    String(proceeds),
        fee:         String(fee),
        realisedPl:  String(realisedPl),
        importKey,
        createdAt:   now,
        importedAt:  now,
      };

      if (tab === "forex") {
        forexDocs.push(doc);
      } else {
        tradeDocs.push({ ...doc, type: tab });
      }
    }

    const out = {
      ok:       true,
      received: rows.length,
      kept:     tradeDocs.length + forexDocs.length + cashDocs.length + dividendDocs.length + cashReportDocs.length,
      dropped:  rows.length - (tradeDocs.length + forexDocs.length + cashDocs.length + dividendDocs.length + cashReportDocs.length),
      trades:       { attempted: tradeDocs.length,      inserted: 0, duplicates: 0 },
      forex:        { attempted: forexDocs.length,      inserted: 0, duplicates: 0 },
      cash:         { attempted: cashDocs.length,        inserted: 0, duplicates: 0 },
      dividends:    { attempted: dividendDocs.length,   inserted: 0, duplicates: 0 },
      cash_report:  { attempted: cashReportDocs.length, inserted: 0, duplicates: 0 },
    };

    // Helper: bulk insert with ON CONFLICT DO NOTHING, count actual inserts
    async function bulkInsert(table, docs, outKey) {
      if (!docs.length) return;
      try {
        const result = await db.insert(table)
          .values(docs)
          .onConflictDoNothing()  // import_key unique constraint handles dedup
          .returning({ id: table.id });
        out[outKey].inserted   = result.length;
        out[outKey].duplicates = docs.length - result.length;
      } catch (err) {
        console.error(`Bulk insert error for ${outKey}:`, err);
      }
    }

    await bulkInsert(trades,               tradeDocs,      "trades");
    await bulkInsert(forexTrades,          forexDocs,      "forex");
    await bulkInsert(cashEntries,          cashDocs,       "cash");
    await bulkInsert(dividends,            dividendDocs,   "dividends");
    await bulkInsert(cashReportSnapshots,  cashReportDocs, "cash_report");

    return res.status(200).json(out);
  } catch (err) {
    console.error("Ledger import error:", err);
    return res.status(500).json({ error: "Import failed" });
  }
}