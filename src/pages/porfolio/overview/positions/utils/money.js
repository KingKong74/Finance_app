// src/pages/portfolio/positions/utils/money.js

// Replace later with live FX rates (API), but fine for now:
export const EXCHANGE_RATES = { AUD: 1, USD: 1.65, EUR: 1.8 };

export const DISPLAY_OPTIONS = ["MARKET", ...Object.keys(EXCHANGE_RATES)];

export const fmtMoney = (n, ccy = "AUD") => {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: 2,
  });
};

export const fmtNum = (n, dp = 2) => {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, { maximumFractionDigits: dp });
};

// rates are "1 unit = rate AUD" (like your ledger)
export const toBase = (value, from, to) => {
  const v = Number(value || 0);
  const rFrom = EXCHANGE_RATES[from] ?? 1;
  const rTo = EXCHANGE_RATES[to] ?? 1;
  return (v * rFrom) / rTo;
};
