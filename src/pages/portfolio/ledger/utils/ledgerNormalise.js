// src/pages/portfolio/ledger/utils/ledgerNormalise.js

export const EXCHANGE_RATES = { USD: 1.65, EUR: 1.8, AUD: 1 };

export function safeUpper(s) {
  return String(s || "").toUpperCase();
}

export function normaliseRow(row, tab) {
  if (tab === "cash") {
    const amount = Number(row.amount || 0);
    return {
      ...row,
      amount,
      currency: row.currency || "AUD",
      entryType: row.entryType || (amount >= 0 ? "deposit" : "withdrawal"),
    };
  }

  const quantity = Number(row.quantity || 0);
  const price = Number(row.price || 0);
  const fee = Number(row.fee || 0);
  const realisedPL = Number(row.realisedPL || 0);

  const proceeds = quantity * price;
  const basis = proceeds - fee;

  return {
    ...row,
    ticker: row.ticker || row.symbol || "",
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
