import connectToDB from "../../../utils/db";
import Trade from "../../../models/Trade";

export default async function handler(req, res) {
  await connectToDB();

  if (req.method === "GET") {
    const trades = await Trade.find({}).sort({ date: -1 });
    return res.status(200).json(trades);
  }

  if (req.method === "POST") {
    try {
      const trade = new Trade(req.body);
      await trade.save();
      return res.status(201).json(trade);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
