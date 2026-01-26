// server_api/transactions/parsers/genericPdf.js

/**
 * GENERIC PDF PARSER
 * 
 * Attempts to extract transactions from unknown bank statement PDFs.
 * Uses heuristics to detect transaction patterns.
 * 
 * Common patterns:
 * - Date columns (DD/MM/YYYY or similar)
 * - Description text
 * - Amount columns (with $ or numbers)
 * - Balance columns (optional)
 */
export function parseGenericPdf(rawText) {
  const lines = String(rawText || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const transactions = [];
  const warnings = [];

  // ────────────────────────────────────────────────────────────
  // HEURISTIC 1: Look for date patterns followed by amount
  // Pattern: DD/MM/YYYY ... $XXX.XX or XXX.XX
  // ────────────────────────────────────────────────────────────
  
  for (const l of lines) {
    // Match: date (DD/MM/YYYY) + description + amount + optional balance
    const pattern1 = l.match(
      /(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+\$?([0-9,]+\.[0-9]{2})(?:\s+\$?([0-9,]+\.[0-9]{2}))?/
    );
    
    if (pattern1) {
      const date = toIsoDate(pattern1[1]);
      const description = pattern1[2].trim();
      const amount = cleanMoney(pattern1[3]);
      const balance = pattern1[4] ? cleanMoney(pattern1[4]) : null;
      
      if (date && description && amount !== 0) {
        transactions.push({
          postedAt: date,
          occurredAt: date,
          description,
          amount: -amount, // assume debit
          balance,
          currency: "AUD",
          accountType: "transaction",
        });
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // HEURISTIC 2: Table with headers
  // Look for: Date | Description | Debit | Credit | Balance
  // ────────────────────────────────────────────────────────────
  
  const headerIdx = lines.findIndex((l) =>
    /date.*description.*amount|date.*details.*debit/i.test(l)
  );
  
  if (headerIdx !== -1 && transactions.length === 0) {
    warnings.push("Found potential table header but couldn't parse rows");
  }

  if (transactions.length === 0) {
    return {
      provider: "GENERIC_PDF",
      accountId: "UNKNOWN",
      accountType: "transaction",
      period: null,
      transactions: [],
      warnings: [
        "Could not detect transaction format. This statement may require a custom parser.",
        "Please provide a sample to add support for this bank.",
      ],
    };
  }

  return {
    provider: "GENERIC_PDF",
    accountId: "UNKNOWN",
    accountType: "transaction",
    period: null,
    transactions,
    warnings: warnings.length > 0 ? warnings : ["Parsed using generic heuristics. Please verify accuracy."],
  };
}

/**
 * CONVERT DATE: DD/MM/YYYY → YYYY-MM-DD
 */
function toIsoDate(dmy) {
  if (!dmy) return "";
  
  const parts = dmy.split("/");
  if (parts.length !== 3) return "";
  
  let [dd, mm, yyyy] = parts;
  
  // Handle 2-digit year
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