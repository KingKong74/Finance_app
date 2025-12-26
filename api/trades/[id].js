import { MongoClient, ObjectId } from "mongodb";

let client;
let db;

const uri = process.env.MONGO_URI;

async function connectToDB() {
  if (db) return db;

  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }

  db = client.db("FinanceWebApp");
  return db;
}

export default async function handler(req, res) {
  const db = await connectToDB();
  const collection = db.collection("trades");
  const { id } = req.query;

  try {
    if (req.method === "DELETE") {
      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 1) res.status(200).json({ success: true });
      else res.status(404).json({ error: "Trade not found" });
    } else {
      res.setHeader("Allow", ["DELETE"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (err) {
    console.error("DB DELETE error:", err);
    res.status(500).json({ error: "Failed to delete trade" });
  }
}
