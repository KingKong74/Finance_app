// server_api/overview/account.js
import { db }       from "../utils/db.js";
import { trades, dividends } from "../schema/index.js";
import { sql }      from "drizzle-orm";
import { num }      from "../utils/shared.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    // Realised P/L + fees aggregated by broker (trades table holds trades & crypto)
    const tradesAgg = await db
      .select({
        broker:     trades.broker,
        realisedPl: sql`sum(coalesce(${trades.realisedPl}::numeric, 0))`.as("realisedPl"),
        fee:        sql`sum(coalesce(${trades.fee}::numeric, 0))`.as("fee"),
      })
      .from(trades)
      .groupBy(trades.broker);

    // Dividends by broker
    const divAgg = await db
      .select({
        broker:    dividends.broker,
        dividends: sql`sum(coalesce(${dividends.amount}::numeric, 0))`.as("dividends"),
      })
      .from(dividends)
      .groupBy(dividends.broker);

    // Merge
    const byBroker = new Map();

    for (const t of tradesAgg) {
      const broker = String(t.broker || "Unknown").trim() || "Unknown";
      byBroker.set(broker, {
        name:   broker,
        total:  0,
        cash:   0,
        pl:     num(t.realisedPl),
        dayPL:  0,
        meta:   { fee: num(t.fee) },
      });
    }

    for (const d of divAgg) {
      const broker = String(d.broker || "Unknown").trim() || "Unknown";
      if (!byBroker.has(broker)) {
        byBroker.set(broker, { name: broker, total: 0, cash: 0, pl: 0, dayPL: 0, meta: { fee: 0 } });
      }
      const row = byBroker.get(broker);
      row.meta.dividends = num(d.dividends);
      row.pl = num(row.pl) + num(d.dividends);
    }

    const brokerAccounts = Array.from(byBroker.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const all = brokerAccounts.reduce(
      (acc, a) => ({
        ...acc,
        total: acc.total + num(a.total),
        cash:  acc.cash  + num(a.cash),
        pl:    acc.pl    + num(a.pl),
        dayPL: acc.dayPL + num(a.dayPL),
      }),
      { name: "All Accounts", total: 0, cash: 0, pl: 0, dayPL: 0 }
    );

    return res.status(200).json([all, ...brokerAccounts]);
  } catch (err) {
    console.error("overview/account error:", err);
    return res.status(500).json({ error: "Failed to build accounts" });
  }
}