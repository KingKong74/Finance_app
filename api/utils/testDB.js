import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI; 
const client = new MongoClient(uri);

async function testConnection() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB!");
    const db = client.db("finance_app"); // change to your DB name
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));
  } catch (err) {
    console.error("❌ Failed to connect:", err);
  } finally {
    await client.close();
  }
}

testConnection();
