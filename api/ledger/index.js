// /api/ledger/index.js
import { connectToDB } from "../utils/db.js";

function normaliseTab(tab) {
  const t = String(tab || "").toLowerCase();
  const allowed = ["trades", "crypto", "forex", "cash"];
  return allowed.includes(t) ? t : null;
}

// trades/crypto/forex go into "trades" collection with a `type` field
function collectionForTab(tab) {
  return tab === "cash" ? "cash" : "trades";
}

export default async function handler(req, res) {
  try {
    const tab = normaliseTab(req.query.tab);
    if (!tab) return res.status(400).json({ error: "Missing/invalid tab" });

    const db = await connectToDB();
    const collection = db.collection(collectionForTab(tab));

    if (req.method === "GET") {
      const query = tab === "cash" ? {} : { type: tab };
      const rows = await collection.find(query).sort({ date: -1 }).toArray();
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const payload = req.body || {};

      if (tab === "cash") {
        // cash: no ticker, uses amount + entryType
        if (!payload.date) return res.status(400).json({ error: "date is required" });
        if (payload.amount === undefined || payload.amount === null || payload.amount === "")
          return res.status(400).json({ error: "amount is required" });

        const doc = {
          date: payload.date,                 // keep as string "YYYY-MM-DD" to match your UI filters
          amount: Number(payload.amount || 0),
          currency: payload.currency || "AUD",
          entryType: payload.entryType || "deposit", // deposit/withdrawal
          note: payload.note || "",
          createdAt: new Date(),
        };

        const result = await collection.insertOne(doc);
        return res.status(201).json({ _id: result.insertedId });
      }

      // trades/crypto/forex:
      if (!payload.ticker) return res.status(400).json({ error: "ticker is required" });
      if (!payload.date) return res.status(400).json({ error: "date is required" });

      const doc = {
        ticker: String(payload.ticker).toUpperCase(),
        date: payload.date, // string "YYYY-MM-DD"
        quantity: Number(payload.quantity || 0),
        price: Number(payload.price || 0),
        fee: Number(payload.fee || 0),
        broker: payload.broker || "IBKR",
        currency: payload.currency || "USD",
        realisedPL: Number(payload.realisedPL || 0),
        type: tab, // "trades" | "crypto" | "forex"
        createdAt: new Date(),
      };

      const result = await collection.insertOne(doc);
      return res.status(201).json({ _id: result.insertedId });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error("Ledger API error:", err);
    return res.status(500).json({ error: "A server error has occurred" });
  }
}
