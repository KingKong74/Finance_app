// /api/overview/accounts.js
import { connectToDB } from "../utils/db.js";

function normBroker(x) {
  const b = String(x || "").trim();
  return b || "Unknown";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const db = await connectToDB();
    const tradesCol = db.collection("trades");
    const dividendsCol = db.collection("dividends");

    // Trades: realisedPL by broker + totals (optional)
    const tradesAgg = await tradesCol
      .aggregate([
        {
          $group: {
            _id: "$broker",
            realisedPL: { $sum: { $ifNull: ["$realisedPL", 0] } },
            fee: { $sum: { $ifNull: ["$fee", 0] } },
          },
        },
      ])
      .toArray();

    // Dividends: amount by broker
    const divAgg = await dividendsCol
      .aggregate([
        {
          $group: {
            _id: "$broker",
            dividends: { $sum: { $ifNull: ["$amount", 0] } },
          },
        },
      ])
      .toArray();

    // Merge by broker
    const byBroker = new Map();

    for (const t of tradesAgg) {
      const broker = normBroker(t._id);
      byBroker.set(broker, {
        name: broker,
        total: 0, // we’ll improve this once you wire positions/value
        cash: 0,  // intentionally not implemented yet
        pl: Number(t.realisedPL || 0) + 0, // + dividends added below
        dayPL: 0, // placeholder until live pricing/day change
        meta: { fee: Number(t.fee || 0) },
      });
    }

    for (const d of divAgg) {
      const broker = normBroker(d._id);
      if (!byBroker.has(broker)) {
        byBroker.set(broker, {
          name: broker,
          total: 0,
          cash: 0,
          pl: 0,
          dayPL: 0,
          meta: { fee: 0 },
        });
      }
      const row = byBroker.get(broker);
      row.meta.dividends = Number(d.dividends || 0);
      row.pl = Number(row.pl || 0) + Number(d.dividends || 0);
    }

    const brokerAccounts = Array.from(byBroker.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    // All Accounts (sum)
    const all = brokerAccounts.reduce(
      (acc, a) => {
        acc.total += Number(a.total || 0);
        acc.cash += Number(a.cash || 0);
        acc.pl += Number(a.pl || 0);
        acc.dayPL += Number(a.dayPL || 0);
        return acc;
      },
      { name: "All Accounts", total: 0, cash: 0, pl: 0, dayPL: 0 }
    );

    return res.status(200).json([all, ...brokerAccounts]);
  } catch (err) {
    console.error("overview/accounts error:", err);
    return res.status(500).json({ error: "Failed to build accounts" });
  }
}
