import { MongoClient } from "mongodb";

let cached = global._mongoCached;

if (!cached) {
  cached = global._mongoCached = { client: null, db: null };
}

export async function connectToDB() {
  if (cached.db) return cached.db;

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI env var");

  if (!cached.client) {
    cached.client = new MongoClient(uri);
    await cached.client.connect();
  }

  cached.db = cached.client.db("FinanceWebApp");
  return cached.db;
}
