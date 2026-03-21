// server_api/ledger/[id].js
import { db }         from "../utils/db.js";
import { trades, forexTrades, cashEntries, dividends } from "../schema/index.js";
import { eq } from "drizzle-orm";

const ALLOWED_TABS = ["trades", "crypto", "forex", "cash", "dividends"];

function tableForTab(tab) {
  if (tab === "cash")      return cashEntries;
  if (tab === "dividends") return dividends;
  if (tab === "forex")     return forexTrades;
  return trades;
}

export default async function handler(req, res) {
  try {
    const tab = String(req.query.tab || "").toLowerCase();
    if (!ALLOWED_TABS.includes(tab)) return res.status(400).json({ error: "Missing/invalid tab" });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing id" });

    if (req.method !== "DELETE") {
      res.setHeader("Allow", ["DELETE"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const table = tableForTab(tab);
    const result = await db.delete(table).where(eq(table.id, id)).returning({ id: table.id });

    if (result.length === 0) return res.status(404).json({ error: "Item not found" });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Ledger DELETE error:", err);
    return res.status(500).json({ error: "Failed to delete entry" });
  }
}