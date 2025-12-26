import { MongoClient } from "mongodb";

let cachedClient = null;
let cachedDb = null;

async function connectToDB() {
  if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db("FinanceApp"); // your DB name
  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

export default async function handler(req, res) {
  try {
    const { db } = await connectToDB();

    if (req.method === "POST") {
      const trade = req.body;
      const result = await db.collection("trades").insertOne(trade);
      return res.status(201).json({ insertedId: result.insertedId });
    }

    if (req.method === "GET") {
      const trades = await db.collection("trades").find({}).toArray();
      return res.status(200).json(trades);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error("DB API error:", err);
    return res.status(500).send("A server error has occurred");
  }
}
