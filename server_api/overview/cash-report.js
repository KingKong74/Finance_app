// server_api/overview/cash-report.js
import { db }                  from "../utils/db.js";
import { cashReportSnapshots } from "../schema/index.js";
import { and, eq, desc }       from "drizzle-orm";
import { num, normUpper }      from "../utils/shared.js";

export default async function handler(req, res) {
  try {
    const broker  = normUpper(req.query.broker || "IBKR");
    const wanted  = ["AUD", "USD", "EUR"];

    // Pull recent snapshots for this broker, label = "Ending Cash"
    const rows = await db
      .select()
      .from(cashReportSnapshots)
      .where(
        and(
          eq(cashReportSnapshots.broker, broker),
          eq(cashReportSnapshots.label, "Ending Cash")
        )
      )
      .orderBy(desc(cashReportSnapshots.snapshotDate))
      .limit(200);

    if (!rows.length) {
      return res.status(404).json({ error: "No cash report found", broker });
    }

    // Latest row per currency
    const latestPerCcy = new Map();
    for (const r of rows) {
      const ccy = normUpper(r.currency || "");
      if (!wanted.includes(ccy)) continue;
      if (!latestPerCcy.has(ccy)) latestPerCcy.set(ccy, r);
      // rows are already sorted desc so first hit = latest
    }

    // asOf = max snapshotDate across all found currencies
    let asOf = "";
    for (const r of latestPerCcy.values()) {
      const d = r.snapshotDate ? new Date(r.snapshotDate).toISOString().slice(0, 10) : "";
      if (d > asOf) asOf = d;
    }

    const balances = {
      AUD: num(latestPerCcy.get("AUD")?.balance ?? 0),
      USD: num(latestPerCcy.get("USD")?.balance ?? 0),
      EUR: num(latestPerCcy.get("EUR")?.balance ?? 0),
    };

    return res.status(200).json({
      broker,
      asOf,
      base: "AUD",
      balances,
      source: "db:cash_report_snapshots",
    });
  } catch (e) {
    console.error("cash-report error:", e);
    return res.status(500).json({ error: "cash-report failed" });
  }
}