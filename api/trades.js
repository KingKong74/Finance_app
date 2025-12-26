import { connectToDB } from "./utils/db.js";
import { Trade } from "./models/Trade.js";

export default async function handler(req, res) {
  await connectToDB();

  if (req.method === "GET") {
    try {
      const trades = await Trade.find({});
      res.status(200).json(trades);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  } else if (req.method === "POST") {
    try {
      const newTrade = new Trade(req.body);
      await newTrade.save();
      res.status(201).json(newTrade);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to add trade" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
