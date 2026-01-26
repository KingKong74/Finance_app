// server_api/transactions/parsers/genericPdf.js

/**
 * GENERIC PDF PARSER
 * 
 * Fallback parser for unknown bank statements.
 * Uses heuristics to detect transaction patterns.
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

function cleanMoney(s) {
  const cleaned = String(s).replace(/\$/g, "").replace(/,/g, "").trim();
  return parseFloat(cleaned) || 0;
}

export function parseGenericPdf(rawText) {
  const lines = String(rawText || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const transactions = [];
  const warnings = [];

  // Heuristic: Look for date patterns followed by amounts
  // Pattern: DD/MM/YYYY ... $XXX.XX or XXX.XX
  for (const l of lines) {
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

  // Check for table headers
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
        "Could not detect transaction format.",
        "This bank may not be supported yet.",
        "Currently supported: ANZ credit card statements."
      ],
    };
  }

  return {
    provider: "GENERIC_PDF",
    accountId: "UNKNOWN",
    accountType: "transaction",
    period: null,
    transactions,
    warnings: warnings.length > 0 ? warnings : [
      "Parsed using generic heuristics.",
      "Please verify transaction accuracy."
    ],
  };
}