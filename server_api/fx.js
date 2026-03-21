// server_api/fx.js
import { db }   from "./utils/db.js";
import { fxRates } from "./schema/index.js";
import { eq, and } from "drizzle-orm";

function clampInt(x, min, max, fallback) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export default async function handler(req, res) {
  try {
    const base = "AUD"; // always AUD base
    const ttl  = clampInt(req.query.ttl ?? 6 * 60 * 60, 60, 7 * 24 * 60 * 60, 6 * 60 * 60);

    // 1) Check cache — read all rows for this base, assemble rates object
    const cached = await db.select().from(fxRates).where(eq(fxRates.base, base));

    if (cached.length > 0) {
      const newest = cached.reduce((a, b) =>
        new Date(a.fetchedAt) > new Date(b.fetchedAt) ? a : b
      );
      const ageMs = Date.now() - new Date(newest.fetchedAt).getTime();

      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= ttl * 1000) {
        const rates = Object.fromEntries(cached.map((r) => [r.quote, Number(r.rate)]));
        rates[base] = 1;
        return res.status(200).json({
          base,
          rates,
          fetchedAt: newest.fetchedAt,
          provider:  newest.provider || "cache",
          source:    "cache",
          ttl,
        });
      }
    }

    // 2) Fetch live
    const url = `https://open.er-api.com/v6/latest/${base}`;
    let liveJson = null;

    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`FX provider failed: ${r.status}`);
      liveJson = await r.json();
    } catch (e) {
      // Fall back to stale cache if available
      if (cached.length > 0) {
        const newest = cached.reduce((a, b) =>
          new Date(a.fetchedAt) > new Date(b.fetchedAt) ? a : b
        );
        const rates = Object.fromEntries(cached.map((r) => [r.quote, Number(r.rate)]));
        rates[base] = 1;
        return res.status(200).json({
          base,
          rates,
          fetchedAt: newest.fetchedAt,
          provider:  newest.provider || "cache",
          source:    "stale-cache",
          ttl,
          warning:   "Live FX failed; served cached rates.",
        });
      }
      return res.status(502).json({ error: "FX provider failed and no cache available" });
    }

    const liveRates  = liveJson?.rates || {};
    const fetchedAt  = new Date();
    const provider   = "open.er-api.com";

    // 3) Upsert each quote into the fx_rates table
    const upserts = Object.entries(liveRates).map(([quote, rate]) =>
      db.insert(fxRates)
        .values({ base, quote, rate: String(rate), fetchedAt, provider })
        .onConflictDoUpdate({
          target: [fxRates.base, fxRates.quote],
          set: { rate: String(rate), fetchedAt, provider, updatedAt: new Date() },
        })
    );
    await Promise.all(upserts);

    const rates = { ...liveRates, [base]: 1 };

    return res.status(200).json({
      base,
      rates,
      fetchedAt: fetchedAt.toISOString(),
      provider,
      source: "live",
      ttl,
    });
  } catch (e) {
    console.error("FX error:", e);
    return res.status(500).json({ error: "FX failed" });
  }
}