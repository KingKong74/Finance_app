import { connectToDB } from "../utils/db.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { keys, tab } = req.body || {};
    if (!Array.isArray(keys) || !keys.length) {
      return res.status(400).json({ error: "keys[] required" });
    }

    const db = await connectToDB();

    // Decide collection based on tab
    const t = String(tab || "").toLowerCase();
    const collectionName =
      t === "cash" ? "cash" :
      t === "dividends" ? "dividends" :
      "trades";

    const col = db.collection(collectionName);

    const existing = await col
      .find({ importKey: { $in: keys } }, { projection: { importKey: 1 } })
      .toArray();

    return res.status(200).json({
      ok: true,
      existingKeys: existing.map((d) => d.importKey),
    });
  } catch (err) {
    console.error("importPreview error:", err);
    return res.status(500).json({ error: "Preview failed" });
  }
}
