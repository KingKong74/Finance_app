// src/pages/portfolio/positions/utils/money.js

// NOTE:
// We store fxRates as: 1 AUD = fxRates[CCY]
// Example: fxRates.USD = 0.66 means 1 AUD = 0.66 USD
// To convert FROM "from" TO "to":
// amountInAUD = value / fxRates[from]
// valueInTo   = amountInAUD * fxRates[to]

export const DISPLAY_OPTIONS = (fxRates = {}) => {
  const keys = Object.keys(fxRates || {}).filter(Boolean).sort();
  // Always include AUD if missing
  if (!keys.includes("AUD")) keys.unshift("AUD");
  return ["MARKET", ...keys];
};

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
  return num.toLocaleString(undefined, {
    maximumFractionDigits: dp,
  });
};

// fxRates are "1 AUD = rate CCY"
export const toBase = (value, from, to, fxRates = {}) => {
  const v = Number(value || 0);
  const f = String(from || "AUD").toUpperCase();
  const t = String(to || "AUD").toUpperCase();

  if (f === t) return v;

  // If MARKET etc accidentally passed through
  if (!fxRates || typeof fxRates !== "object") return v;

  const rFrom = Number(fxRates[f]);
  const rTo = Number(fxRates[t]);

  // Must have both to do a proper conversion
  if (!Number.isFinite(rFrom) || rFrom <= 0) return v;
  if (!Number.isFinite(rTo) || rTo <= 0) return v;

  const inAud = v / rFrom;
  return inAud * rTo;
};
