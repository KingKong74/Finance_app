// /api/ledger/[id].js
import { ObjectId } from "mongodb";
import { connectToDB } from "../utils/db";

function normaliseTab(tab) {
  const t = String(tab || "").toLowerCase();
  const allowed = ["trades", "crypto", "forex", "cash"];
  return allowed.includes(t) ? t : null;
}

function collectionForTab(tab) {
  return tab === "cash" ? "cash" : "trades";
}

export default async function handler(req, res) {
  try {
    const tab = normaliseTab(req.query.tab);
    if (!tab) return res.status(400).json({ error: "Missing/invalid tab" });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing id" });

    const db = await connectToDB();
    const collection = db.collection(collectionForTab(tab));

    if (req.method === "DELETE") {
      const result = await collection.deleteOne({ _id: new ObjectId(String(id)) });
      if (result.deletedCount === 1) return res.status(200).json({ success: true });
      return res.status(404).json({ error: "Item not found" });
    }

    res.setHeader("Allow", ["DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error("Ledger DELETE error:", err);
    return res.status(500).json({ error: "Failed to delete entry" });
  }
}
