// /api/prices/refresh.js
import { connectToDB } from "../utils/db.js";

const TRADES_COLLECTION = "trades";
const PRICES_COLLECTION = "prices";

//Twelve Data live fetch (batch)
async function fetchLivePrices(symbols) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("Missing TWELVE_DATA_API_KEY");

  const qs = new URLSearchParams({
    symbol: symbols.join(","),
    apikey: apiKey,
  });

async function fetchLivePricesChunked(symbols, chunkSize = 8) {
  const allResults = {};

  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);

    const partial = await fetchLivePrices(chunk);
    Object.assign(allResults, partial);

    // If more chunks remain, wait 60s to avoid rate limit
    if (i + chunkSize < symbols.length) {
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }

  return allResults;
}

  const url = `https://api.twelvedata.com/quote?${qs.toString()}`;

  const r = await fetch(url, { headers: { accept: "application/json" } });
  const data = await r.json().catch(() => null);

  if (!r.ok || !data) throw new Error(`Twelve Data HTTP error: ${r.status}`);
  if (data.status === "error") throw new Error(data.message || "Twelve Data error");

  const out = {};

  const normaliseOne = (obj) => {
    if (!obj || obj.status === "error") return null;

    const rawPrice = obj.price ?? obj.close ?? obj.last ?? null;
    const priceNum = rawPrice == null ? null : Number(rawPrice);
    if (priceNum == null || Number.isNaN(priceNum)) return null;

    return {
      price: priceNum,
      currency: obj.currency || "USD",
      asOf: obj.datetime || new Date().toISOString(),
      source: "twelvedata-live",
    };
  };

  // Batch responses are usually keyed by symbol
  const looksBatch =
    typeof data === "object" &&
    !Array.isArray(data) &&
    !("symbol" in data) &&
    symbols.some((s) => Object.prototype.hasOwnProperty.call(data, s));

  if (looksBatch) {
    for (const sym of symbols) {
      const item = normaliseOne(data[sym]);
      if (item) out[sym] = item;
    }
    return out;
  }

  // Single response fallback
  const sym = String(data.symbol || symbols[0] || "").toUpperCase();
  const item = normaliseOne(data);
  if (sym && item) out[sym] = item;

  return out;
}


export default async function handler(req, res) {
  try {
    // Optional: basic protection so randoms can't hammer this endpoint
    // Set CRON_SECRET in Vercel env and call with ?secret=...
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
          _id: {
            ticker: "$ticker",
            currency: "$currency",
            type: "$type",
          },
          netQty: { $sum: "$quantity" },
        },
      },
      {
        $match: {
          netQty: { $ne: 0 },
        },
      },
      {
        $group: {
          _id: "$_id.ticker",
        },
      },
    ];

    const held = await tradesCol.aggregate(pipeline).toArray();
    const symbols = held.map((x) => String(x._id || "").toUpperCase()).filter(Boolean);

    if (symbols.length === 0) {
      return res.status(200).json({ ok: true, refreshed: 0, symbols: [] });
    }

    // 2) Fetch live prices in one go (provider permitting)
    const live = await fetchLivePricesChunked(symbols);

    // 3) Upsert cache
    const now = new Date();
    const ops = symbols
      .map((sym) => {
        const item = live?.[sym];
        if (!item?.price) return null;

        return {
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
        };
      })
      .filter(Boolean);

    if (ops.length) await pricesCol.bulkWrite(ops);

    return res.status(200).json({
      ok: true,
      refreshed: ops.length,
      symbolsCount: symbols.length,
    });
  } catch (err) {
    console.error("Prices refresh error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
