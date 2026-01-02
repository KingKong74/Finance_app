// /api/overview/cash-report.js
import { connectToDB } from "./utils/db.js";

function normUpper(x) {
  return String(x || "").trim().toUpperCase();
}

export default async function handler(req, res) {
  try {
    const broker = normUpper(req.query.broker || "IBKR");
    const account = String(req.query.account || "").trim();

    const db = await connectToDB();
    const col = db.collection("cash_reports");

    const query = { broker };
    if (account) query.account = account;

    // latest by asOf (string date works if YYYY-MM-DD)
    const doc = await col.find(query).sort({ asOf: -1, importedAt: -1 }).limit(1).next();

    if (!doc) {
      return res.status(404).json({
        error: "No cash report found",
        broker,
        account: account || null,
      });
    }

    return res.status(200).json({
      broker: doc.broker,
      account: doc.account || "",
      asOf: doc.asOf || "",
      base: doc.base || "AUD",
      balances: doc.balances || {},
      source: "db",
      importedAt: doc.importedAt || null,
    });
  } catch (e) {
    console.error("cash-report error:", e);
    return res.status(500).json({ error: "cash-report failed" });
  }
}
