import { MongoClient, ObjectId } from "mongodb";

let client;
let db;

const uri = process.env.MONGO_URI; // Make sure Vercel env var matches

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
  const collection = db.collection("trades");

  try {
    if (req.method === "GET") {
      const trades = await collection.find({}).toArray();
      res.status(200).json(trades);
    } else if (req.method === "POST") {
      const payload = req.body;

      // Basic validation
      if (!payload.ticker || !payload.date) {
        return res.status(400).json({ error: "Ticker and date are required" });
      }

      const result = await collection.insertOne(payload);
      res.status(201).json({ _id: result.insertedId });
    } else {
      res.setHeader("Allow", ["GET", "POST"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (err) {
    console.error("DB API error:", err);
    res.status(500).json({ error: "A server error has occurred" });
  }
}
