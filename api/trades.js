import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.VITE_MONGO_URI);

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      await client.connect();
      const db = client.db("FinanceWebApp"); // use your DB name
      const collection = db.collection("trades");
      const result = await collection.insertOne(req.body);
      res.status(200).json(result);
    } else {
      res.status(200).json({ message: "POST a trade to test" });
    }
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).send("A server error has occurred");
  } finally {
    await client.close();
  }
}
