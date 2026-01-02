// /api/prices/refresh.js
import { connectToDB } from "../utils/db.js";
import { fetchLivePricesChunked } from "../utils/twelveData.js";
import { fetchYahooPrices } from "../utils/yahooFinance.js";



const TRADES_COLLECTION = "trades";
const PRICES_COLLECTION = "prices";


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

    // 2) Fetch live prices
    const now = new Date();

    const ASX = symbols.filter((s) => s.endsWith(".AX"));
    const NON_ASX = symbols.filter((s) => !s.endsWith(".AX"));

    const live = {};

    if (NON_ASX.length) {
      Object.assign(live, await fetchLivePricesChunked(NON_ASX));
    }

    if (ASX.length) {
      Object.assign(live, await fetchYahooPrices(ASX));
    }


    // 3) Upsert cache
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
