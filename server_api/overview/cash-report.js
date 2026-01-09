// /api/overview/cash-report.js
import { connectToDB } from "../utils/db.js";

function normUpper(x) {
  return String(x || "").trim().toUpperCase();
}

function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isIsoDateTime(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s);
}
function keyOf(r) {
  const d = String(r?.date || "");
  const ts = String(r?.ts || "");
  if (isIsoDate(d)) return d;
  if (isIsoDateTime(ts)) return ts.slice(0, 10);
  return "";
}
function num(x) {
  if (typeof x === "string") x = x.replace(/,/g, "");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req, res) {
  try {
    const broker = normUpper(req.query.broker || "IBKR");
    const account = String(req.query.account || "").trim();

    const db = await connectToDB();
    const col = db.collection("cash_reports");

    const query = {
      broker,
      label: "Ending Cash",
    };
    if (account) query.account = account;

    // Pull recent-ish rows; we'll pick latest per currency in JS
    const rows = await col
      .find(query)
      .sort({ date: -1, ts: -1, importedAt: -1 })
      .limit(200)
      .toArray();

    if (!rows.length) {
      return res.status(404).json({
        error: "No cash report found",
        broker,
        account: account || null,
      });
    }

    // Latest per currency (AUD/USD/EUR)
    const wanted = ["AUD", "USD", "EUR"];
    const latestPerCcy = new Map(); // ccy -> row

    for (const r of rows) {
      const ccy = normUpper(r?.currency || "");
      if (!wanted.includes(ccy)) continue;

      const prev = latestPerCcy.get(ccy);
      const k = keyOf(r);
      const pk = prev ? keyOf(prev) : "";

      if (!prev || (k && k > pk)) latestPerCcy.set(ccy, r);
    }

    // Determine "asOf" as the max date across currencies we found
    let asOf = "";
    for (const r of latestPerCcy.values()) {
      const k = keyOf(r);
      if (k && k > asOf) asOf = k;
    }

    const balances = {
      AUD: num(latestPerCcy.get("AUD")?.amount || 0),
      USD: num(latestPerCcy.get("USD")?.amount || 0),
      EUR: num(latestPerCcy.get("EUR")?.amount || 0),
    };

    return res.status(200).json({
      broker,
      account: account || "",
      asOf,
      base: "AUD",
      balances,
      source: "db:cash_reports(label=Ending Cash)",
    });
  } catch (e) {
    console.error("cash-report error:", e);
    return res.status(500).json({ error: "cash-report failed" });
  }
}
