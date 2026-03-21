// server_api/ledger/index.js
import { db }         from "../utils/db.js";
import { trades, forexTrades, cashEntries, dividends } from "../schema/index.js";
import { eq, desc } from "drizzle-orm";
import { num, normUpper, normStr, makeImportKey, deriveDate, deriveTs } from "../utils/shared.js";

const ALLOWED_TABS = ["trades", "crypto", "forex", "cash", "dividends"];

function tabIsValid(tab) {
  return ALLOWED_TABS.includes(String(tab || "").toLowerCase());
}

// Map each tab to which Drizzle table it writes/reads
function tableForTab(tab) {
  if (tab === "cash")     return cashEntries;
  if (tab === "dividends") return dividends;
  if (tab === "forex")    return forexTrades;
  return trades; // "trades" | "crypto"
}

// Normalise a DB row back to the shape the frontend expects
function normaliseRow(row, tab) {
  if (tab === "cash") {
    return {
      _id:        row.id,
      date:       row.settledAt ? new Date(row.settledAt).toISOString().slice(0, 10) : "",
      ts:         row.settledAt ? new Date(row.settledAt).toISOString().slice(0, 19) : "",
      amount:     Number(row.amount),
      currency:   row.currency,
      entryType:  row.entryType,
      broker:     row.broker,
      note:       row.note || "",
      importKey:  row.importKey,
    };
  }

  if (tab === "dividends") {
    return {
      _id:       row.id,
      date:      row.paidAt ? new Date(row.paidAt).toISOString().slice(0, 10) : "",
      ts:        row.paidAt ? new Date(row.paidAt).toISOString().slice(0, 19) : "",
      amount:    Number(row.amount),
      currency:  row.currency,
      ticker:    row.ticker || "",
      broker:    row.broker,
      note:      row.note || "",
      importKey: row.importKey,
    };
  }

  if (tab === "forex") {
    return {
      _id:         row.id,
      date:        row.tradedAt ? new Date(row.tradedAt).toISOString().slice(0, 10) : "",
      ts:          row.tradedAt ? new Date(row.tradedAt).toISOString().slice(0, 19) : "",
      ticker:      row.ticker,
      quantity:    Number(row.quantity),
      price:       Number(row.price),
      proceeds:    Number(row.proceeds),
      fee:         Number(row.fee),
      feeCurrency: row.feeCurrency,
      currency:    row.currency,
      broker:      row.broker,
      realisedPL:  Number(row.realisedPl),
      type:        "forex",
      importKey:   row.importKey,
    };
  }

  // trades | crypto
  return {
    _id:         row.id,
    date:        row.tradedAt ? new Date(row.tradedAt).toISOString().slice(0, 10) : "",
    ts:          row.tradedAt ? new Date(row.tradedAt).toISOString().slice(0, 19) : "",
    ticker:      row.ticker,
    quantity:    Number(row.quantity),
    price:       Number(row.price),
    proceeds:    Number(row.proceeds),
    fee:         Number(row.fee),
    feeCurrency: row.feeCurrency,
    currency:    row.currency,
    broker:      row.broker,
    realisedPL:  Number(row.realisedPl),
    type:        row.type,
    importKey:   row.importKey,
  };
}

export default async function handler(req, res) {
  try {
    const tab = String(req.query.tab || "").toLowerCase();
    if (!tabIsValid(tab)) return res.status(400).json({ error: "Missing/invalid tab" });

    const table = tableForTab(tab);

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      let rows;

      if (tab === "cash") {
        rows = await db.select().from(cashEntries).orderBy(desc(cashEntries.settledAt));
      } else if (tab === "dividends") {
        rows = await db.select().from(dividends).orderBy(desc(dividends.paidAt));
      } else if (tab === "forex") {
        rows = await db.select().from(forexTrades).orderBy(desc(forexTrades.tradedAt));
      } else {
        // trades | crypto — both live in the trades table, filtered by type
        rows = await db.select().from(trades)
          .where(eq(trades.type, tab))
          .orderBy(desc(trades.tradedAt));
      }

      return res.status(200).json(rows.map((r) => normaliseRow(r, tab)));
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      const payload = req.body || {};

      if (tab === "cash") {
        if (!payload.date)   return res.status(400).json({ error: "date is required" });
        if (payload.amount == null) return res.status(400).json({ error: "amount is required" });

        const amount    = num(payload.amount);
        const settledAt = new Date(deriveTs(payload) || `${payload.date}T00:00:00`);
        const entryType = normStr(payload.entryType || (amount >= 0 ? "deposit" : "withdrawal")).toLowerCase();
        const importKey = makeImportKey("cash", { ...payload, amount, entryType });

        const [row] = await db.insert(cashEntries).values({
          broker: normStr(payload.broker || ""),
          currency: normUpper(payload.currency || "AUD"),
          entryType,
          settledAt,
          amount:    String(amount),
          note:      normStr(payload.note || ""),
          importKey,
          createdAt: new Date(),
        }).returning();

        return res.status(201).json({ _id: row.id });
      }

      if (tab === "dividends") {
        if (!payload.date)   return res.status(400).json({ error: "date is required" });
        if (payload.amount == null) return res.status(400).json({ error: "amount is required" });

        const amount    = num(payload.amount);
        const paidAt    = new Date(deriveTs(payload) || `${payload.date}T00:00:00`);
        const importKey = makeImportKey("dividends", payload);

        const [row] = await db.insert(dividends).values({
          broker:    normStr(payload.broker || "IBKR"),
          ticker:    normUpper(payload.ticker || ""),
          currency:  normUpper(payload.currency || "USD"),
          paidAt,
          amount:    String(amount),
          note:      normStr(payload.note || ""),
          importKey,
          createdAt: new Date(),
        }).returning();

        return res.status(201).json({ _id: row.id });
      }

      // trades | crypto | forex
      if (!payload.ticker) return res.status(400).json({ error: "ticker is required" });
      if (!payload.date)   return res.status(400).json({ error: "date is required" });

      const quantity  = num(payload.quantity);
      const price     = num(payload.price);
      const fee       = Math.abs(num(payload.fee));
      const proceeds  = payload.proceeds != null ? num(payload.proceeds) : -(quantity * price);
      const tradedAt  = new Date(deriveTs(payload) || `${payload.date}T00:00:00`);
      const importKey = makeImportKey(tab, payload);

      const commonFields = {
        broker:      normStr(payload.broker || "IBKR"),
        ticker:      normUpper(payload.ticker),
        currency:    normUpper(payload.currency || "USD"),
        feeCurrency: normUpper(payload.feeCurrency || "AUD"),
        tradedAt,
        quantity:    String(quantity),
        price:       String(price),
        proceeds:    String(proceeds),
        fee:         String(fee),
        realisedPl:  String(num(payload.realisedPL)),
        importKey,
        createdAt:   new Date(),
      };

      if (tab === "forex") {
        const [row] = await db.insert(forexTrades).values(commonFields).returning();
        return res.status(201).json({ _id: row.id });
      }

      const [row] = await db.insert(trades).values({ ...commonFields, type: tab }).returning();
      return res.status(201).json({ _id: row.id });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error("Ledger API error:", err);
    return res.status(500).json({ error: "A server error has occurred" });
  }
}