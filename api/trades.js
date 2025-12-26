// api/trades.js
import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI;
const dbName = "FinanceApp";
let cachedClient = null;

async function connectToDB() {
  if (cachedClient) return cachedClient;

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  cachedClient = { client, db };
  return cachedClient;
}

export default async function handler(req, res) {
  try {
    const { db } = await connectToDB();
    const collection = db.collection("trades");

    if (req.method === "GET") {
      const trades = await collection.find({}).toArray();
      return res.status(200).json(trades);
    }

    if (req.method === "POST") {
      const trade = req.body;

      if (!trade || Object.keys(trade).length === 0) {
        return res.status(400).json({ error: "Trade data is required" });
      }

      const result = await collection.insertOne(trade);
      return res.status(201).json({ insertedId: result.insertedId });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error("API insert error:", err);
    return res.status(500).json({ error: "A server error has occurred" });
  }
}
