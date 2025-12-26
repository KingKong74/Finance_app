// /api/trades.js
import { MongoClient } from "mongodb";

const uri = process.env.VITE_MONGO_URI;

if (!uri) {
  throw new Error("Missing VITE_MONGO_URI environment variable");
}

let cachedClient = null;
let cachedDb = null;

async function connectToDB() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB!");

    // Set your DB name explicitly here
    const db = client.db("FinanceApp"); 

    cachedClient = client;
    cachedDb = db;

    return { client, db };
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    throw err;
  }
}

export default async function handler(req, res) {
  const { db } = await connectToDB();

  try {
    if (req.method === "GET") {
      const trades = await db.collection("trades").find({}).toArray();
      res.status(200).json(trades);
    } else if (req.method === "POST") {
      console.log("Incoming POST body:", req.body);
      const result = await db.collection("trades").insertOne(req.body);
      console.log("Insert result:", result);
      res.status(200).json(result);
    } else {
      res.setHeader("Allow", ["GET", "POST"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (err) {
    console.error("DB operation error:", err);
    res.status(500).json({ error: err.message });
  }
}
