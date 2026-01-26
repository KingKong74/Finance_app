// server_api/transactions/parsers/anzStatementPdf.js

/**
 * ANZ STATEMENT PDF PARSER
 * 
 * Parses ANZ credit card statement PDFs (extracted text from pdf-parse).
 * 
 * Format from your statements:
 * - Account summary section (opening/closing balance, payments, purchases)
 * - Transaction Details table with columns:
 *   Date Processed | Date of Transaction | Card Used | Transaction Details | Amount ($A) | Balance
 * 
 * Example transaction line:
 * 10/11/2025 04/11/2025 0192 TRANSLINK TICKETING QLD $0.50 $900.40
 */
export function parseAnzStatementPdf(rawText) {
  const lines = String(rawText || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // ────────────────────────────────────────────────────────────
  // 1. EXTRACT ACCOUNT NUMBER
  // ────────────────────────────────────────────────────────────
  
  let accountNumber = null;
  for (const l of lines) {
    const m = l.match(/ACCOUNT NUMBER:\s*([0-9\-]+)/i);
    if (m) {
      accountNumber = m[1].replace(/\-/g, "");
      break;
    }
  }
  
  const accountId = accountNumber ? `ANZ-${accountNumber}` : "ANZ-UNKNOWN";

  // ────────────────────────────────────────────────────────────
  // 2. EXTRACT STATEMENT PERIOD
  // ────────────────────────────────────────────────────────────
  
  let period = null;
  for (const l of lines) {
    const m = l.match(/STATEMENT PERIOD:\s*(\d{2}\/\d{2}\/\d{2})\s*to\s*(\d{2}\/\d{2}\/\d{2})/i);
    if (m) {
      period = {
        from: toIsoDate(m[1]),
        to: toIsoDate(m[2]),
      };
      break;
    }
  }

  // ────────────────────────────────────────────────────────────
  // 3. FIND TRANSACTION DETAILS SECTION
  // ────────────────────────────────────────────────────────────
  
  const startIdx = lines.findIndex((l) =>
    /transaction details/i.test(l)
  );
  
  if (startIdx === -1) {
    return {
      provider: "ANZ",
      accountId,
      accountType: "credit_card",
      period,
      transactions: [],
      warnings: ["Could not find 'Transaction Details' section"],
    };
  }

  const transactions = [];
  const warnings = [];
  let lastTx = null; // track for multi-line transactions

  // ────────────────────────────────────────────────────────────
  // 4. PARSE TRANSACTIONS
  // ────────────────────────────────────────────────────────────
  
  for (let i = startIdx + 1; i < lines.length; i++) {
    const l = lines[i];

    // Stop at end markers
    if (/^IMPORTANT MESSAGES/i.test(l)) break;
    if (/^Please refer to the last four digits/i.test(l)) break;
    if (/^PAYMENT SUMMARY/i.test(l)) break;

    // ────────────────────────────────────────────────────────────
    // FOREIGN CURRENCY LINE (follows main transaction)
    // Example: "22.00 USD" or "4400.00 VND"
    // ────────────────────────────────────────────────────────────
    
    const fxMatch = l.match(/^([0-9]+(?:\.[0-9]+)?)\s+([A-Z]{3})$/);
    if (fxMatch && lastTx) {
      lastTx.foreign = {
        amount: parseFloat(fxMatch[1]),
        currency: fxMatch[2],
      };
      continue;
    }

    // ────────────────────────────────────────────────────────────
    // OVERSEAS FEE LINE
    // Example: "29/12/2025 INCL OVERSEAS TXN FEE 1.15 AUD $2,440.46"
    // ────────────────────────────────────────────────────────────
    
    if (/INCL OVERSEAS TXN FEE/i.test(l)) {
      const feeMatch = l.match(/INCL OVERSEAS TXN FEE\s+([0-9]+(?:\.[0-9]+)?)\s+AUD/i);
      if (feeMatch && lastTx) {
        lastTx.fees = (lastTx.fees || 0) + parseFloat(feeMatch[1]);
      }
      continue;
    }

    // ────────────────────────────────────────────────────────────
    // MAIN TRANSACTION LINE
    // Format: DD/MM/YYYY DD/MM/YYYY XXXX DESCRIPTION $AMOUNT [$BALANCE]
    // 
    // With optional "CR" suffix for credits (payments)
    // Example: 12/12/2025 12/12/2025 0192 PAYMENT THANKYOU 574315 $500.00 CR $3,064.86
    // ────────────────────────────────────────────────────────────
    
    const txMatch = l.match(
      /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{4})\s+(.+?)\s+\$([0-9,]+\.[0-9]{2})(\s+CR)?\s+\$([0-9,]+\.[0-9]{2})$/i
    );

    if (!txMatch) continue;

    const postedAt = toIsoDate(txMatch[1]);
    const occurredAt = toIsoDate(txMatch[2]);
    const cardLast4 = txMatch[3];
    const description = txMatch[4].trim();
    const amountAbs = cleanMoney(txMatch[5]);
    const isCredit = Boolean(txMatch[6]) || /PAYMENT THANKYOU/i.test(description);
    const balance = cleanMoney(txMatch[7]);

    // Convention: credit card purchases = negative, payments = positive
    const amount = isCredit ? amountAbs : -amountAbs;

    const tx = {
      postedAt,
      occurredAt,
      description,
      amount,
      balance,
      currency: "AUD",
      cardLast4,
      merchant: null, // could extract from description later
      foreign: null,
      fees: 0,
      accountType: "credit_card",
    };

    transactions.push(tx);
    lastTx = tx;
  }

  return {
    provider: "ANZ",
    accountId,
    accountType: "credit_card",
    period,
    transactions,
    warnings,
  };
}

/**
 * CONVERT DATE: DD/MM/YY or DD/MM/YYYY → YYYY-MM-DD
 */
function toIsoDate(dmy) {
  if (!dmy) return "";
  
  const parts = dmy.split("/");
  if (parts.length !== 3) return "";
  
  let [dd, mm, yyyy] = parts;
  
  // Handle 2-digit year (25 → 2025)
  if (yyyy.length === 2) {
    yyyy = parseInt(yyyy, 10) > 50 ? `19${yyyy}` : `20${yyyy}`;
  }
  
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * CLEAN MONEY: "$1,463.90" → 1463.90
 */
function cleanMoney(s) {
  const cleaned = String(s).replace(/\$/g, "").replace(/,/g, "").trim();
  return parseFloat(cleaned) || 0;
}