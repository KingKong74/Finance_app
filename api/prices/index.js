// /api/prices/index.js
import { connectToDB } from "../utils/db.js";

const CACHE_COLLECTION = "prices";

// helper: parse symbols param
function parseSymbols(q) {
  const raw = String(q || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  // de-dupe
  return Array.from(new Set(raw));
}

// TODO: replace this with your actual provider fetch.
// Keep it server-side (never expose api key to frontend).
async function fetchLivePrices(symbols) {
  // Return: { ASML: { price: 123, currency: "USD" }, ... }
  // Throw if provider fails.
  // For now, pretend it fails so you see fallback behaviour:
  throw new Error("Live provider not wired yet");
}

export default async function handler(req, res) {
  try {
    const db = await connectToDB();
    const col = db.collection(CACHE_COLLECTION);

    if (req.method === "GET") {
      const symbols = parseSymbols(req.query.symbols);
      if (symbols.length === 0) {
        return res.status(400).json({ error: "symbols is required" });
      }

      // 1) try live
      let live = null;
      try {
        live = await fetchLivePrices(symbols);

        // If live succeeded, upsert cache
        const now = new Date();
        const ops = symbols.map((sym) => {
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
        }).filter(Boolean);

        if (ops.length) await col.bulkWrite(ops);

      } catch (e) {
        // swallow live error -> fallback to cache
        live = null;
      }

      // 2) read cache for all symbols
      const cachedRows = await col.find({ symbol: { $in: symbols } }).toArray();
      const cachedMap = Object.fromEntries(
        cachedRows.map((r) => [
          r.symbol,
          {
            price: Number(r.price),
            currency: r.currency || "USD",
            asOf: r.asOf || (r.updatedAt ? new Date(r.updatedAt).toISOString() : null),
            source: r.source || "cache",
          },
        ])
      );

      // 3) merge: live wins, else cache, else null
      const out = {};
      for (const sym of symbols) {
        const l = live?.[sym];
        if (l?.price != null) {
          out[sym] = {
            price: Number(l.price),
            currency: l.currency || "USD",
            asOf: l.asOf || new Date().toISOString(),
            source: l.source || "live",
          };
        } else if (cachedMap[sym]) {
          out[sym] = cachedMap[sym];
        } else {
          out[sym] = null;
        }
      }

      return res.status(200).json(out);
    }

    // Optional: allow manual cache updates
    if (req.method === "POST") {
      const payload = req.body || {};
      const symbol = String(payload.symbol || "").toUpperCase();
      if (!symbol) return res.status(400).json({ error: "symbol is required" });

      const now = new Date();
      await col.updateOne(
        { symbol },
        {
          $set: {
            symbol,
            currency: payload.currency || "USD",
            price: Number(payload.price),
            source: payload.source || "manual",
            asOf: payload.asOf || now.toISOString(),
            updatedAt: now,
          },
        },
        { upsert: true }
      );

      return res.status(200).json({ success: true });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error("Prices API error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
