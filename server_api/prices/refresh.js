// server_api/prices/refresh.js
import { db }         from "../utils/db.js";
import { trades, priceCache } from "../schema/index.js";
import { sql }        from "drizzle-orm";
import { fetchLivePricesChunked } from "../utils/twelveData.js";
import { fetchYahooPrices }       from "../utils/yahooFinance.js";

export default async function handler(req, res) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.query.secret !== secret) {
      return res.status(401).json({ error: "Unauthorised" });
    }

    // Find all tickers with a non-zero net position
    const held = await db
      .select({ ticker: trades.ticker })
      .from(trades)
      .groupBy(trades.ticker)
      .having(sql`sum(${trades.quantity}::numeric) <> 0`);

    const symbols = held.map((r) => String(r.ticker || "").toUpperCase()).filter(Boolean);

    if (!symbols.length) {
      return res.status(200).json({ ok: true, refreshed: 0, symbols: [] });
    }

    const ASX     = symbols.filter((s) => s.endsWith(".AX"));
    const NON_ASX = symbols.filter((s) => !s.endsWith(".AX"));

    const live = {};
    if (NON_ASX.length) Object.assign(live, await fetchLivePricesChunked(NON_ASX));
    if (ASX.length)     Object.assign(live, await fetchYahooPrices(ASX));

    const now   = new Date();
    const upsertRows = Object.entries(live)
      .filter(([, item]) => item?.price != null)
      .map(([symbol, item]) => ({
        symbol,
        price:    String(Number(item.price)),
        currency: item.currency || "USD",
        source:   item.source   || "live",
        asOf:     new Date(item.asOf || now),
        updatedAt: now,
      }));

    if (upsertRows.length) {
      await db
        .insert(priceCache)
        .values(upsertRows)
        .onConflictDoUpdate({
          target: [priceCache.symbol],
          set: {
            price:     sql`excluded.price`,
            currency:  sql`excluded.currency`,
            source:    sql`excluded.source`,
            asOf:      sql`excluded.as_of`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }

    return res.status(200).json({ ok: true, refreshed: upsertRows.length, symbolsCount: symbols.length });
  } catch (err) {
    console.error("Prices refresh error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}