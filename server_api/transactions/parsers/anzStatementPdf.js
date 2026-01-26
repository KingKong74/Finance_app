// server_api/transactions/parsers/anzStatementPdf.js

/**
 * ANZ CREDIT CARD STATEMENT PARSER
 * 
 * Parses ANZ credit card PDF statements.
 * Extracts account info, period, and all transactions.
 */

function cleanMoney(s) {
  return Number(String(s).replace(/\$/g, "").replace(/,/g, "").trim());
}

function toIsoDate(dmy) {
  const [dd, mm, yyyy] = dmy.split("/");
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function hashExternalId(parts) {
  const str = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `anz_${(h >>> 0).toString(16)}`;
}

export function parseAnzStatementPdf(rawText) {
  const provider = "ANZ";
  const accountType = "credit_card";
  const source = "statement_import";

  const lines = String(rawText || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Extract account number
  let accountNumber = null;
  for (const l of lines) {
    const m = l.match(/^ACCOUNT NUMBER:\s*([0-9\-]+)$/i);
    if (m) {
      accountNumber = m[1].trim();
      break;
    }
  }
  const accountId = accountNumber ? `ANZ-${accountNumber}` : "ANZ-UNKNOWN";

  // Extract statement period
  let period = null;
  for (const l of lines) {
    const m = l.match(/^STATEMENT PERIOD:\s*([0-9\/]+)\s*to\s*([0-9\/]+)$/i);
    if (m) {
      period = { from: toIsoDate(m[1]), to: toIsoDate(m[2]) };
      break;
    }
  }

  // Find transaction details section
  const startIdx = lines.findIndex((l) => l.toLowerCase() === "transaction details");
  if (startIdx === -1) {
    return {
      provider,
      accountId,
      accountType,
      period,
      transactions: [],
      warnings: ["Could not find 'Transaction Details' section."]
    };
  }

  const tx = [];
  let lastTx = null;

  for (let i = startIdx + 1; i < lines.length; i++) {
    const l = lines[i];

    // Stop at end markers
    if (/^IMPORTANT MESSAGES/i.test(l)) break;
    if (/^Please refer to the last four digits/i.test(l)) break;

    // Foreign currency line (e.g. "22.00 USD")
    const fx = l.match(/^([0-9]+(?:\.[0-9]+)?)\s+([A-Z]{3})$/);
    if (fx && lastTx) {
      lastTx.foreign = { amount: Number(fx[1]), currency: fx[2] };
      continue;
    }

    // Overseas fee line
    if (/INCL OVERSEAS TXN FEE/i.test(l)) {
      const feeMatch = l.match(/INCL OVERSEAS TXN FEE\s+([0-9]+(?:\.[0-9]+)?)\s+AUD/i);
      if (feeMatch && lastTx) {
        lastTx.fees = (lastTx.fees || 0) + Number(feeMatch[1]);
      }
      continue;
    }

    // Main transaction line:
    // "12/12/2025 10/12/2025 0192 APPLE.COM/BILL SYDNEY $22.99 $3,564.86"
    // Credits have: "$500.00 CR"
    const m = l.match(
      /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{4})\s+(.+?)\s+\$([0-9,]+\.[0-9]{2})(\s+CR)?\s+\$([0-9,]+\.[0-9]{2})$/i
    );

    if (!m) continue;

    const postedAt = toIsoDate(m[1]);
    const occurredAt = toIsoDate(m[2]);
    const cardLast4 = m[3];
    const description = m[4].trim();
    const amtAbs = cleanMoney(m[5]);
    const isCredit = Boolean(m[6]) || /PAYMENT THANKYOU/i.test(description);

    // Credit card: purchases = negative, payments = positive
    const amount = isCredit ? amtAbs : -amtAbs;
    const balance = cleanMoney(m[7]);

    const externalId = hashExternalId([
      accountId,
      postedAt,
      occurredAt,
      cardLast4,
      description,
      String(amount),
      String(balance)
    ]);

    const row = {
      accountId,
      provider,
      accountType,
      postedAt,
      occurredAt,
      cardLast4,
      description,
      amount,
      currency: "AUD",
      foreign: null,
      fees: 0,
      balance,
      source,
      externalId,
    };

    tx.push(row);
    lastTx = row;
  }

  return {
    provider,
    accountId,
    accountType,
    period,
    transactions: tx,
    warnings: tx.length === 0 ? ["No transactions found in statement"] : []
  };
}