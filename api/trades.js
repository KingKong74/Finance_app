// /api/ledger.js
import { MongoClient, ObjectId } from "mongodb";

let client;
let db;

const uri = process.env.MONGO_URI; // Ensure your env var is set in Vercel

async function connectToDB() {
  if (db) return db;

  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }

  db = client.db("FinanceWebApp"); // Your DB name
  return db;
}

export default async function handler(req, res) {
  const db = await connectToDB();

  // Get tab from query: trades, crypto, forex, cash
  const tab = req.query.tab;
  if (!tab) return res.status(400).json({ error: "Missing tab parameter" });

  // Map tabs to collection names (you can use same collection for trades/crypto/forex if you like)
  const collectionName = tab === "cash" ? "cash" : "trades";
  const collection = db.collection(collectionName);

  try {
    if (req.method === "GET") {
      let query = {};
      // Optionally, filter by type for trades/crypto/forex
      if (tab !== "cash") query.type = tab === "crypto" ? "crypto" : tab;
      const items = await collection.find(query).toArray();
      res.status(200).json(items);

    } else if (req.method === "POST") {
      const payload = req.body;

      // Basic validation
      if (tab !== "cash") {
        if (!payload.ticker || !payload.date) {
          return res.status(400).json({ error: "Ticker and date are required" });
        }
        payload.quantity = Number(payload.quantity || 0);
        payload.price = Number(payload.price || 0);
        payload.fee = Number(payload.fee || 0);
        payload.type = tab === "crypto" ? "crypto" : tab;
        payload.realisedPL = Number(payload.realisedPL || 0);
      } else {
        if (!payload.date || !payload.amount) {
          return res.status(400).json({ error: "Date and amount are required" });
        }
        payload.amount = Number(payload.amount);
        payload.entryType = payload.entryType || "deposit";
      }

      const result = await collection.insertOne(payload);
      res.status(201).json({ _id: result.insertedId });

    } else if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "Missing id parameter" });

      await collection.deleteOne({ _id: new ObjectId(id) });
      res.status(200).json({ success: true });

    } else {
      res.setHeader("Allow", ["GET", "POST", "DELETE"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (err) {
    console.error("Ledger API error:", err);
    res.status(500).json({ error: "A server error occurred" });
  }
}
