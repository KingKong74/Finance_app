// /api/prices/refresh.js
import { connectToDB } from "../utils/db.js";
import { fetchLivePrices } from "../utils/twelveData.js";
import { fetchEodhdLivePrices } from "../utils/eodhd.js";

const TRADES_COLLECTION = "trades";
const PRICES_COLLECTION = "prices";

export default async function handler(req, res) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.query.secret !== secret) {
      return res.status(401).json({ error: "Unauthorised" });
    }

    const db = await connectToDB();
    const tradesCol = db.collection(TRADES_COLLECTION);
    const pricesCol = db.collection(PRICES_COLLECTION);

    // 1) Get all tickers with non-zero net quantity (held positions)
    const pipeline = [
      { $match: { type: { $in: ["trades", "crypto", "forex"] } } },
      {
        $group: {
          _id: { ticker: "$ticker" },
          netQty: { $sum: "$quantity" },
        },
      },
      { $match: { netQty: { $ne: 0 } } },
    ];

    const held = await tradesCol.aggregate(pipeline).toArray();
    const symbols = held.map((x) => String(x._id?.ticker || "").toUpperCase()).filter(Boolean);

    if (!symbols.length) {
      return res.status(200).json({ ok: true, refreshed: 0, symbols: [] });
    }

    const now = new Date();

    // 2) Try Twelve Data first
    let live = {};
    try {
      const td = await fetchLivePrices(symbols);
      for (const [sym, item] of Object.entries(td || {})) {
        if (item?.price != null) live[sym] = item;
      }
    } catch (e) {
      console.error("Twelve Data failed (refresh):", e?.message || e);
    }

    // 3) EODHD fallback for missing
    try {
      const missing = symbols.filter((s) => !live[s]?.price);
      if (missing.length) {
        const eod = await fetchEodhdLivePrices(missing, "AU");
        for (const [sym, item] of Object.entries(eod || {})) {
          if (item?.price != null) live[sym] = item;
        }
      }
    } catch (e) {
      console.error("EODHD failed (refresh):", e?.message || e);
    }

    // 4) Upsert cache
    const ops = Object.entries(live).map(([sym, item]) => ({
      updateOne: {
        filter: { symbol: sym },
        update: {
          $set: {
            symbol: sym,
            currency: item.currency || "USD",
            price: Number(item.price),
            source: item.source || "live",
            asOf: item.asOf || now.toISOString(),
            updatedAt: now,
          },
        },
        upsert: true,
      },
    }));

    if (ops.length) await pricesCol.bulkWrite(ops);

    return res.status(200).json({
      ok: true,
      refreshed: ops.length,
      symbolsCount: symbols.length,
      missingAfter: symbols.filter((s) => !live[s]?.price),
    });
  } catch (err) {
    console.error("Prices refresh error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
