// src/pages/portfolio/ledger/utils/ledgerNormalise.js

export const EXCHANGE_RATES = { USD: 1.65, EUR: 1.8, AUD: 1 };

export function safeUpper(s) {
  return String(s || "").toUpperCase();
}

export function normaliseRow(row, tab) {
  // Treat dividends like cash-style rows (amount-based)
  if (tab === "cash" || tab === "dividends") {
    const amount = Number(row.amount || 0);

    return {
      ...row,
      date: row.date || "",

      // standardise ts if present
      ts: row.ts || (row.date ? `${row.date}T00:00:00` : ""),

      // amount-based
      amount,
      currency: row.currency || (tab === "cash" ? "AUD" : "USD"),

      // cash-only field, but safe to keep blank for dividends
      entryType:
        tab === "cash"
          ? row.entryType || (amount >= 0 ? "deposit" : "withdrawal")
          : undefined,

      // dividends commonly have ticker (optional)
      ticker:
        tab === "dividends"
          ? String(row.ticker || row.symbol || "").toUpperCase()
          : undefined,

      broker: row.broker || "IBKR",
    };
  }

  // trades / forex / crypto (quantity-based)
  const quantity = Number(row.quantity || 0);
  const price = Number(row.price || 0);
  const fee = Number(row.fee || 0);
  const realisedPL = Number(row.realisedPL || 0);

  const proceeds = quantity * price;
  const basis = proceeds - fee;

  return {
    ...row,
    date: row.date || "",
    ts: row.ts || (row.date ? `${row.date}T00:00:00` : ""),

    ticker: String(row.ticker || row.symbol || "").toUpperCase(),
    quantity,
    price,
    fee,
    realisedPL,
    proceeds,
    basis,

    currency: row.currency || "USD",
    broker: row.broker || "IBKR",
  };
}
