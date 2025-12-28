export default async function handler(req, res) {
  try {
    const base = String(req.query.base || "AUD").toUpperCase();

    const url = `https://open.er-api.com/v6/latest/${base}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: "FX provider failed" });

    const json = await r.json();
    const rates = json?.rates || {};

    return res.status(200).json({
      base,
      rates,
      fetchedAt: new Date().toISOString(),
      provider: "open.er-api.com",
    });
  } catch (e) {
    console.error("FX error:", e);
    return res.status(500).json({ error: "FX failed" });
  }
}
