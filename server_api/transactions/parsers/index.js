// server_api/transactions/parsers/index.js

import { parseAnzStatementPdf } from "./anzStatementPdf.js";
import { parseGenericPdf } from "./genericPdf.js";

/**
 * AUTO-DETECT BANK PROVIDER
 */
function detectProvider(text, filename, fileType) {
  const t = String(text || "").toLowerCase();
  const fn = String(filename || "").toLowerCase();
  
  // ANZ patterns
  if (
    t.includes("anz first") ||
    t.includes("anz.com") ||
    t.includes("australia and new zealand banking group") ||
    (/account number:\s*[0-9\-]+/i.test(text) && t.includes("statement period")) ||
    fn.includes("anz")
  ) {
    return "ANZ";
  }
  
  // Commonwealth Bank
  if (
    t.includes("commonwealth bank") ||
    t.includes("commbank.com.au") ||
    fn.includes("commbank")
  ) {
    return "COMMONWEALTH";
  }
  
  // NAB
  if (
    t.includes("national australia bank") ||
    t.includes("nab.com.au") ||
    fn.includes("nab")
  ) {
    return "NAB";
  }
  
  // Westpac
  if (
    t.includes("westpac banking corporation") ||
    t.includes("westpac.com.au") ||
    fn.includes("westpac")
  ) {
    return "WESTPAC";
  }
  
  // Generic PDF fallback
  if (fileType === "pdf") {
    return "GENERIC_PDF";
  }
  
  return null;
}

/**
 * GENERATE EXTERNAL ID (for deduplication)
 */
function generateExternalId({ accountId, date, description, amount, balance }) {
  const parts = [
    String(accountId || ""),
    String(date || ""),
    String(description || "").trim().toLowerCase(),
    Number(amount || 0).toFixed(2),
    balance != null ? Number(balance).toFixed(2) : "",
  ];
  
  const str = parts.join("|");
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  
  return `tx_${(hash >>> 0).toString(16)}`;
}

/**
 * NORMALIZE TRANSACTION OUTPUT
 */
export function normalizeTransaction(raw, provider, accountId) {
  return {
    accountId,
    provider,
    postedAt: raw.postedAt || raw.date,
    occurredAt: raw.occurredAt || raw.postedAt || raw.date,
    description: String(raw.description || "").trim(),
    amount: Number(raw.amount || 0),
    currency: raw.currency || "AUD",
    balance: raw.balance != null ? Number(raw.balance) : null,
    merchant: raw.merchant || null,
    cardLast4: raw.cardLast4 || null,
    foreign: raw.foreign || null,
    fees: raw.fees || 0,
    source: "statement_import",
    accountType: raw.accountType || "transaction",
    externalId: raw.externalId || generateExternalId({
      accountId,
      date: raw.postedAt || raw.date,
      description: raw.description,
      amount: raw.amount,
      balance: raw.balance,
    }),
  };
}

/**
 * STUB PARSERS
 */
function parseCommonwealthStatement(text) {
  return {
    accountId: "COMMONWEALTH-UNKNOWN",
    accountType: "transaction",
    period: null,
    transactions: [],
    warnings: ["Commonwealth parser not yet implemented."],
  };
}

function parseNabStatement(text) {
  return {
    accountId: "NAB-UNKNOWN",
    accountType: "transaction",
    period: null,
    transactions: [],
    warnings: ["NAB parser not yet implemented."],
  };
}

function parseWestpacStatement(text) {
  return {
    accountId: "WESTPAC-UNKNOWN",
    accountType: "transaction",
    period: null,
    transactions: [],
    warnings: ["Westpac parser not yet implemented."],
  };
}

/**
 * MASTER PARSE FUNCTION - MAIN EXPORT
 */
export async function parseStatement(text, filename = "", fileType = "pdf", options = {}) {
  const provider = options.provider || detectProvider(text, filename, fileType);
  
  if (!provider) {
    throw new Error("Could not detect bank provider.");
  }
  
  let parsed;
  
  switch (provider) {
    case "ANZ":
      parsed = parseAnzStatementPdf(text);
      break;
    case "COMMONWEALTH":
      parsed = parseCommonwealthStatement(text);
      break;
    case "NAB":
      parsed = parseNabStatement(text);
      break;
    case "WESTPAC":
      parsed = parseWestpacStatement(text);
      break;
    case "GENERIC_PDF":
      parsed = parseGenericPdf(text);
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
  
  const accountId = parsed.accountId || options.accountId || `${provider}-UNKNOWN`;
  const normalized = (parsed.transactions || []).map((tx) =>
    normalizeTransaction(tx, provider, accountId)
  );
  
  return {
    provider,
    accountId,
    accountType: parsed.accountType || "transaction",
    period: parsed.period || null,
    transactions: normalized,
    warnings: parsed.warnings || [],
    metadata: {
      filename,
      parsedAt: new Date().toISOString(),
      transactionCount: normalized.length,
    },
  };
}