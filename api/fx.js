// api/fx.js
import { connectToDB } from "./utils/db.js"; // adjust path if needed

function clampInt(x, min, max, fallback) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export default async function handler(req, res) {
  try {
    // ✅ Always AUD base (ignore req.query.base)
    const base = "AUD";

    // ttl is seconds
    const ttl = clampInt(
      req.query.ttl ?? 6 * 60 * 60,
      60,
      7 * 24 * 60 * 60,
      6 * 60 * 60
    ); // default 6h

    const db = await connectToDB();
    const col = db.collection("fx_rates");

    // helpful indexes (safe to run repeatedly)
    await col.createIndex({ base: 1 }, { unique: true });
    await col.createIndex({ fetchedAt: -1 });

    // 1) Try cache first (fresh within ttl)
    const cached = await col.findOne({ base });

    if (cached?.rates && cached?.fetchedAt) {
      const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= ttl * 1000) {
        // ensure base is present + correct
        const rates = { ...(cached.rates || {}) };
        rates[base] = 1;

        return res.status(200).json({
          base,
          rates,
          fetchedAt: cached.fetchedAt,
          provider: cached.provider || "cache",
          source: "cache",
          ttl,
        });
      }
    }

    // 2) Fetch live (AUD base)
    const url = `https://open.er-api.com/v6/latest/${base}`;
    let liveJson = null;

    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`FX provider failed: ${r.status}`);
      liveJson = await r.json();
    } catch (e) {
      // 3) Provider failed -> fall back to ANY cached rates (even stale)
      if (cached?.rates) {
        const rates = { ...(cached.rates || {}) };
        rates[base] = 1;

        return res.status(200).json({
          base,
          rates,
          fetchedAt: cached.fetchedAt,
          provider: cached.provider || "cache",
          source: "stale-cache",
          ttl,
          warning: "Live FX failed; served cached rates.",
        });
      }

      // no cache either
      return res
        .status(502)
        .json({ error: "FX provider failed and no cache available" });
    }

    const rates = { ...(liveJson?.rates || {}) };
    rates[base] = 1; // ✅ guarantee base is present
    const fetchedAt = new Date().toISOString();

    // 4) Upsert cache (one doc per base)
    await col.updateOne(
      { base },
      {
        $set: {
          base,
          rates,
          fetchedAt,
          provider: "open.er-api.com",
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.status(200).json({
      base,
      rates,
      fetchedAt,
      provider: "open.er-api.com",
      source: "live",
      ttl,
    });
  } catch (e) {
    console.error("FX error:", e);
    return res.status(500).json({ error: "FX failed" });
  }
}
