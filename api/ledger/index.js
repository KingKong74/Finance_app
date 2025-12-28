import { connectToDB } from "../utils/db.js";

function normaliseTab(tab) {
  const t = String(tab || "").toLowerCase();
  const allowed = ["trades", "crypto", "forex", "cash", "dividends"];
  return allowed.includes(t) ? t : null;
}

function collectionForTab(tab) {
  if (tab === "cash") return "cash";
  if (tab === "dividends") return "dividends";
  return "trades"; // trades/crypto/forex live in "trades" collection with type
}

function queryForTab(tab) {
  if (tab === "cash") return {};
  if (tab === "dividends") return {};
  return { type: tab };
}

function deriveTs(payload) {
  // prefer ts, else fall back to date midnight
  const ts = payload?.ts;
  if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(ts)) return ts;
  const date = payload?.date;
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T00:00:00`;
  return "";
}

export default async function handler(req, res) {
  try {
    const tab = normaliseTab(req.query.tab);
    if (!tab) return res.status(400).json({ error: "Missing/invalid tab" });

    const db = await connectToDB();
    const collection = db.collection(collectionForTab(tab));

    if (req.method === "GET") {
      const query = queryForTab(tab);
      const rows = await collection.find(query).sort({ date: -1, ts: -1 }).toArray();
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const payload = req.body || {};

      // ───────────── CASH ─────────────
      if (tab === "cash") {
        if (!payload.date) return res.status(400).json({ error: "date is required" });
        if (payload.amount === undefined || payload.amount === null || payload.amount === "")
          return res.status(400).json({ error: "amount is required" });

        const amountNum = Number(payload.amount || 0);

        const doc = {
          date: payload.date, // "YYYY-MM-DD"
          ts: deriveTs(payload), // "YYYY-MM-DDT.."
          amount: amountNum,
          currency: payload.currency || "AUD",
          broker: payload.broker || "",
          entryType: payload.entryType || (amountNum >= 0 ? "deposit" : "withdrawal"),
          note: payload.note || "",
          createdAt: new Date(),
        };

        const result = await collection.insertOne(doc);
        return res.status(201).json({ _id: result.insertedId });
      }

      // ───────────── DIVIDENDS (Option B) ─────────────
      if (tab === "dividends") {
        if (!payload.date) return res.status(400).json({ error: "date is required" });
        if (payload.amount === undefined || payload.amount === null || payload.amount === "")
          return res.status(400).json({ error: "amount is required" });

        const amountNum = Number(payload.amount || 0);

        const doc = {
          date: payload.date,
          ts: deriveTs(payload),
          amount: amountNum,
          currency: payload.currency || "USD",
          ticker: payload.ticker ? String(payload.ticker).toUpperCase() : "",
          broker: payload.broker || "IBKR",
          note: payload.note || "",
          createdAt: new Date(),
        };

        const result = await collection.insertOne(doc);
        return res.status(201).json({ _id: result.insertedId });
      }

      // ───────────── TRADES / CRYPTO / FOREX ─────────────
      if (!payload.ticker) return res.status(400).json({ error: "ticker is required" });
      if (!payload.date) return res.status(400).json({ error: "date is required" });

      const doc = {
        ticker: String(payload.ticker).toUpperCase(),
        date: payload.date, // "YYYY-MM-DD"
        ts: deriveTs(payload),
        quantity: Number(payload.quantity || 0), // negative sells stay negative ✅
        price: Number(payload.price || 0),
        fee: Math.abs(Number(payload.fee || 0)),
        broker: payload.broker || "IBKR",
        currency: payload.currency || "USD",
        realisedPL: Number(payload.realisedPL || 0),
        type: tab,
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
