// server_api/ledger/importPreview.js
import { db } from "../utils/db.js";
import { trades, forexTrades, cashEntries, dividends, cashReportSnapshots } from "../schema/index.js";
import { inArray } from "drizzle-orm";

function tableForTab(tab) {
  const t = String(tab || "").toLowerCase();
  if (t === "cash")        return { table: cashEntries,         col: cashEntries.importKey };
  if (t === "dividends")   return { table: dividends,           col: dividends.importKey };
  if (t === "forex")       return { table: forexTrades,         col: forexTrades.importKey };
  if (t === "cash_report") return { table: cashReportSnapshots, col: cashReportSnapshots.importKey };
  return { table: trades, col: trades.importKey }; // trades | crypto
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { keys, tab } = req.body || {};
    if (!Array.isArray(keys) || !keys.length) {
      return res.status(400).json({ error: "keys[] required" });
    }

    const { table, col } = tableForTab(tab);

    const existing = await db
      .select({ importKey: col })
      .from(table)
      .where(inArray(col, keys));

    return res.status(200).json({
      ok:           true,
      existingKeys: existing.map((r) => r.importKey).filter(Boolean),
    });
  } catch (err) {
    console.error("importPreview error:", err);
    return res.status(500).json({ error: "Preview failed" });
  }
}