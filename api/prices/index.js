// /api/prices/index.js
import { connectToDB } from "../utils/db.js";
import { fetchLivePrices } from "../utils/twelveData.js";
import { fetchYahooPrices } from "../utils/yahooFinance.js";

const CACHE_COLLECTION = "prices";
const DEFAULT_TTL_MINUTES = 60;
const MAX_SYMBOLS = 8;

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

    // ⛔ hard limit to prevent abuse / rate-limit exhaustion
    if (symbols.length > MAX_SYMBOLS) {
      return res.status(400).json({
        error: `Too many symbols requested (max ${MAX_SYMBOLS})`,
      });
    }

    const ttl = Number(req.query.ttl ?? DEFAULT_TTL_MINUTES);
    const forceRefresh = req.query.refresh === "1";

    const db = await connectToDB();
    const col = db.collection(CACHE_COLLECTION);

    // 1) read cache
    const cachedRows = await col.find({ symbol: { $in: symbols } }).toArray();
    const cachedMap = Object.fromEntries(cachedRows.map((r) => [r.symbol, r]));

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
        const now = new Date();

        // (a) Try Twelve Data for everything first
        const td = await fetchLivePrices(toFetch);

        // td is keyed by symbol (usually)
        for (const [sym, item] of Object.entries(td || {})) {
          if (item?.price != null) live[sym] = item;
        }

        // (b) Auto-fallback: any missing symbols -> try Yahoo as ASX (.AX)
        const missing = toFetch.filter((s) => !live[s]?.price);
        if (missing.length) {
          const yahooSyms = missing.map((s) => `${s}.AX`);
          const yf = await fetchYahooPrices(yahooSyms);

          // map REA.AX back to REA
          for (const [psym, item] of Object.entries(yf || {})) {
            const orig = psym.endsWith(".AX") ? psym.slice(0, -3) : psym;
            if (item?.price != null) {
              live[orig] = item; // store under original ticker
            }
          }
        }

        // Cache updates (single format regardless of provider)
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

        if (ops.length) await col.bulkWrite(ops);
        } catch (e) {
          console.error("Live fetch failed (prices):", e?.message || e);
          // fallback to cache
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
