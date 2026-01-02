// /api/overview/cash-report.js
import { connectToDB } from "../utils/db.js";

function normUpper(x) {
  return String(x || "").trim().toUpperCase();
}

function normStr(x) {
  return String(x || "").trim();
}

function num(x) {
  if (typeof x === "string") x = x.replace(/,/g, "");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req, res) {
  try {
    const broker = normUpper(req.query.broker || "IBKR");
    const account = normStr(req.query.account || "");

    const db = await connectToDB();
    const col = db.collection("cash_reports");

    // Base query
    const baseQuery = { broker };
    if (account) baseQuery.account = account;

    // 1) Find the latest "Ending Cash" snapshot row (by ts/date/importedAt)
    const latest = await col
      .find({ ...baseQuery, label: "Ending Cash" })
      .sort({ ts: -1, date: -1, importedAt: -1 })
      .limit(1)
      .next();

    if (!latest) {
      // fallback: if label not stored for some reason, just pick latest row
      const any = await col
        .find(baseQuery)
        .sort({ ts: -1, date: -1, importedAt: -1 })
        .limit(1)
        .next();

      if (!any) {
        return res.status(404).json({
          error: "No cash report found",
          broker,
          account: account || null,
        });
      }

      // still try to aggregate for that date/ts
      const snapDate = any.date || (any.ts ? String(any.ts).slice(0, 10) : "");
      const snapTs = any.ts || (snapDate ? `${snapDate}T00:00:00` : "");

      const rows = await col
        .find({ ...baseQuery, date: snapDate })
        .toArray();

      const balances = {};
      for (const r of rows) {
        const ccy = normUpper(r.currency);
        if (!ccy) continue;
        if (ccy === "AUD" || ccy === "USD" || ccy === "EUR") {
          balances[ccy] = num(r.amount);
        }
      }

      return res.status(200).json({
        broker,
        account,
        asOf: snapDate,
        ts: snapTs,
        base: "AUD",
        balances,
        source: "db-fallback",
        importedAt: any.importedAt || null,
      });
    }

    // 2) Use latest snapshot date and gather all currencies for that date (Ending Cash only)
    const asOf = latest.date || (latest.ts ? String(latest.ts).slice(0, 10) : "");
    const ts = latest.ts || (asOf ? `${asOf}T00:00:00` : "");

    const rows = await col
      .find({ ...baseQuery, label: "Ending Cash", date: asOf })
      .toArray();

    const balances = { AUD: 0, USD: 0, EUR: 0 };
    for (const r of rows) {
      const ccy = normUpper(r.currency);
      if (ccy === "AUD" || ccy === "USD" || ccy === "EUR") {
        balances[ccy] = num(r.amount);
      }
    }

    return res.status(200).json({
      broker,
      account: latest.account || account || "",
      asOf,
      ts,
      base: "AUD",
      balances,
      source: "db",
      importedAt: latest.importedAt || null,
    });
  } catch (e) {
    console.error("cash-report error:", e);
    return res.status(500).json({ error: "cash-report failed" });
  }
}
