// api/trades.js
import { MongoClient } from "mongodb";

let cachedClient = null;

async function connectToDB() {
  if (cachedClient) return cachedClient;

  if (!process.env.MONGO_URI) {
    throw new Error("Missing MONGO_URI environment variable");
  }

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  cachedClient = client;
  return cachedClient;
}

export default async function handler(req, res) {
  try {
    const client = await connectToDB();
    const db = client.db("FinanceWebApp"); // your DB name
    const tradesCollection = db.collection("trades");

    if (req.method === "GET") {
      const trades = await tradesCollection.find({}).toArray();
      return res.status(200).json(trades);
    }

    if (req.method === "POST") {
      const trade = req.body;

      if (!trade || !trade.symbol) {
        return res.status(400).json({ error: "Invalid trade data" });
      }

      const result = await tradesCollection.insertOne(trade);
      return res.status(201).json({ insertedId: result.insertedId });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("DB API error:", err);
    return res.status(500).json({ error: "A server error has occurred" });
  }
}
