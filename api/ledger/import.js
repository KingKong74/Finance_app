import { connectToDB } from "../utils/db.js";

function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const body = req.body || {};
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!rows.length) return res.status(400).json({ error: "rows[] required" });

    const db = await connectToDB();
    const tradesCol = db.collection("trades");
    const cashCol = db.collection("cash");

    const tradeDocs = [];
    const cashDocs = [];

    for (const r of rows) {
      const tab = String(r.tab || "").toLowerCase();

      if (tab === "cash") {
        if (!isIsoDate(r.date)) continue;
        const amount = Number(r.amount || 0);
        cashDocs.push({
          date: r.date,
          amount,
          currency: r.currency || "AUD",
          entryType: r.entryType || (amount >= 0 ? "deposit" : "withdrawal"),
          note: r.note || "",
          broker: "IBKR",
          createdAt: new Date(),
          importedAt: new Date(),
        });
        continue;
      }

      if (tab === "trades" || tab === "forex" || tab === "crypto") {
        if (!isIsoDate(r.date)) continue;
        if (!r.ticker) continue;

        tradeDocs.push({
          ticker: String(r.ticker).toUpperCase(),
          date: r.date,
          quantity: Number(r.quantity || 0),
          price: Number(r.price || 0),
          fee: Math.abs(Number(r.fee || 0)),
          broker: r.broker || "IBKR",
          currency: r.currency || "USD",
          realisedPL: Number(r.realisedPL || 0),
          type: tab,
          createdAt: new Date(),
          importedAt: new Date(),
        });
      }
    }

    const results = { tradesInserted: 0, cashInserted: 0 };

    if (tradeDocs.length) {
      const r = await tradesCol.insertMany(tradeDocs);
      results.tradesInserted = r.insertedCount || tradeDocs.length;
    }
    if (cashDocs.length) {
      const r = await cashCol.insertMany(cashDocs);
      results.cashInserted = r.insertedCount || cashDocs.length;
    }

    return res.status(200).json({
      ok: true,
      ...results,
      received: rows.length,
      kept: tradeDocs.length + cashDocs.length,
      dropped: rows.length - (tradeDocs.length + cashDocs.length),
    });
  } catch (err) {
    console.error("Ledger import error:", err);
    return res.status(500).json({ error: "Import failed" });
  }
}
