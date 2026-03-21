// server_api/utils/shared.js
// Single source of truth for utilities used across API handlers AND imported
// by the client-side ImportModal via src/lib/shared.js (re-export).
// Keep this file free of Node-only imports so it remains browser-safe.

export function num(x) {
  if (typeof x === "string") x = x.replace(/,/g, "");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export function normUpper(x) {
  return String(x || "").trim().toUpperCase();
}

export function normStr(x) {
  return String(x || "").trim();
}

export function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function isIsoDateTime(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s);
}

export function deriveDate(r) {
  if (isIsoDate(r.date)) return r.date;
  if (isIsoDateTime(r.ts)) return r.ts.slice(0, 10);
  return "";
}

export function deriveTs(r) {
  if (isIsoDateTime(r.ts)) return r.ts;
  if (isIsoDate(r.date)) return `${r.date}T00:00:00`;
  return "";
}

/**
 * Canonical import key builder — used by both client preview and server import.
 * Changing this will invalidate all existing import keys, so treat it as stable.
 *
 * tab: "trades" | "forex" | "crypto" | "cash" | "dividends" | "cash_report"
 */
export function makeImportKey(tab, r) {
  const broker  = normUpper(r.broker || "IBKR");
  const account = normStr(r.account || "");
  const currency = normStr(r.currency || "");
  const tsOrDate = deriveTs(r) || deriveDate(r);

  switch (tab) {
    case "cash": {
      const amount = num(r.amount);
      const entryType = normStr(
        r.entryType || (amount >= 0 ? "deposit" : "withdrawal")
      ).toLowerCase();
      const note = normStr(r.note || "");
      return [broker, account, tab, tsOrDate, currency, entryType, amount.toFixed(8), note].join("|");
    }

    case "dividends": {
      const amount = num(r.amount);
      const ticker = normUpper(r.ticker || "");
      const note   = normStr(r.note || "");
      return [broker, account, tab, tsOrDate, currency, ticker, amount.toFixed(8), note].join("|");
    }

    case "cash_report": {
      // Flat row shape: one row per currency (post-parse)
      const amount = num(r.amount);
      const label  = normStr(r.label || "Ending Cash");
      return [broker, account, tab, tsOrDate, currency, label, amount.toFixed(8)].join("|");
    }

    // trades | forex | crypto
    default: {
      const ticker = normUpper(r.ticker || "");
      const qty    = num(r.quantity);
      const price  = num(r.price);
      const fee    = Math.abs(num(r.fee));
      return [broker, account, tab, tsOrDate, currency, ticker, qty.toFixed(8), price.toFixed(8), fee.toFixed(8)].join("|");
    }
  }
}

/** FX conversion: fxRates stored as "1 AUD = rate CCY" (AUD-base). */
export function toBase(value, from, to, fxRates = {}) {
  const v  = num(value);
  const f  = normUpper(from || "AUD");
  const t  = normUpper(to   || "AUD");
  if (f === t) return v;
  if (!fxRates || typeof fxRates !== "object") return v;
  const rFrom = Number(fxRates[f]);
  const rTo   = Number(fxRates[t]);
  if (!Number.isFinite(rFrom) || rFrom <= 0) return v;
  if (!Number.isFinite(rTo)   || rTo   <= 0) return v;
  return (v / rFrom) * rTo;
}