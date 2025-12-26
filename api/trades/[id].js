import connectToDB from "../utils/db";
import Trade from "../models/Trade";

export default async function handler(req, res) {
  await connectToDB();
  const { id } = req.query;

  if (req.method === "DELETE") {
    try {
      await Trade.findByIdAndDelete(id);
      return res.status(200).json({ message: "Trade deleted" });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  if (req.method === "PUT") {
    try {
      const updatedTrade = await Trade.findByIdAndUpdate(id, req.body, { new: true });
      return res.status(200).json(updatedTrade);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
