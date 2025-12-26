// /api/utils/db.js
import { MongoClient } from "mongodb";

let client;
let cachedDb;

export async function connectToDB() {
  if (cachedDb) return cachedDb;

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing env var: MONGO_URI");

  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }

  // your DB name (you already confirmed this works locally)
  cachedDb = client.db("FinanceWebApp");
  return cachedDb;
}
