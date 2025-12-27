// /api/prices/index.js
import { connectToDB } from "../utils/db.js";
import { fetchLivePrices} from "../utils/twelveData.js";

const CACHE_COLLECTION = "prices";
const DEFAULT_TTL_MINUTES = 60;

function parseSymbols(q) {
  return Array.from(
    new Set(
      String(q || "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function isFresh(updatedAt, ttlMinutes) {
  if (!updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  return Date.now() - t <= ttlMinutes * 60 * 1000;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).end();
    }

    const symbols = parseSymbols(req.query.symbols);
    if (!symbols.length) {
      return res.status(400).json({ error: "symbols is required" });
    }

    const ttl = Number(req.query.ttl ?? DEFAULT_TTL_MINUTES);
    const forceRefresh = req.query.refresh === "1";

    const db = await connectToDB();
    const col = db.collection(CACHE_COLLECTION);

    // 1) read cache
    const cachedRows = await col.find({ symbol: { $in: symbols } }).toArray();
    const cachedMap = Object.fromEntries(
      cachedRows.map((r) => [r.symbol, r])
    );

    // 2) decide what needs live fetch
    const toFetch = forceRefresh
      ? symbols
      : symbols.filter((s) => {
          const c = cachedMap[s];
          return !c || !isFresh(c.updatedAt, ttl);
        });

    // 3) fetch live only if needed
    let live = {};
    if (toFetch.length) {
      try {
        live = await fetchLivePrices(toFetch);
        const now = new Date();

        const ops = Object.entries(live).map(([sym, item]) => ({
          updateOne: {
            filter: { symbol: sym },
            update: {
              $set: {
                symbol: sym,
                currency: item.currency,
                price: item.price,
                source: item.source,
                asOf: item.asOf,
                updatedAt: now,
              },
            },
            upsert: true,
          },
        }));

        if (ops.length) await col.bulkWrite(ops);
      } catch {
        // swallow live errors → fallback to cache
      }
    }

    // 4) merge response
    const out = {};
    for (const sym of symbols) {
      if (live[sym]) out[sym] = live[sym];
      else if (cachedMap[sym]) {
        out[sym] = {
          price: Number(cachedMap[sym].price),
          currency: cachedMap[sym].currency,
          asOf: cachedMap[sym].asOf,
          source: cachedMap[sym].source || "cache",
        };
      } else {
        out[sym] = null;
      }
    }

    return res.status(200).json(out);
  } catch (err) {
    console.error("Prices API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
