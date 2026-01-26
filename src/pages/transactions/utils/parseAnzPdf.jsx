// src/pages/transactions/utils/parseAnzPdf.js

/**
 * CLIENT-SIDE ANZ CREDIT CARD STATEMENT PARSER
 * 
 * Parses ANZ credit card PDF statements directly in the browser.
 * Extracts account info, period, and all transactions.
 */

function cleanMoney(s) {
  return Number(String(s).replace(/\$/g, "").replace(/,/g, "").trim());
}

function toIsoDate(dmy) {
  // "29/12/2025" -> "2025-12-29"
  const [dd, mm, yyyy] = dmy.split("/");
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function hashExternalId(parts) {
  // Simple stable hash for deduplication
  const str = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `anz_${(h >>> 0).toString(16)}`;
}

export async function parseAnzPdf(file) {
  // Dynamic import from your node_modules
  const pdfjsLib = await import('pdfjs-dist');
  
  // Set worker - use the version from your package.json (5.4.296)
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.296/pdf.worker.min.mjs`;

  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Load PDF
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    // Extract text from all pages
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      fullText += pageText + "\n";
    }

    // Parse the extracted text
    return parseAnzStatementText(fullText, file.name);
    
  } catch (error) {
    console.error("PDF parsing error:", error);
    throw new Error("Failed to parse PDF: " + error.message);
  }
}

function parseAnzStatementText(rawText, filename) {
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
    const m = l.match(/ACCOUNT NUMBER:\s*([0-9\-]+)/i);
    if (m) {
      accountNumber = m[1].replace(/\-/g, "");
      break;
    }
  }
  const accountId = accountNumber ? `ANZ-${accountNumber}` : "ANZ-UNKNOWN";

  // Extract statement period
  let period = null;
  for (const l of lines) {
    const m = l.match(/STATEMENT PERIOD:\s*(\d{2}\/\d{2}\/\d{2,4})\s*to\s*(\d{2}\/\d{2}\/\d{2,4})/i);
    if (m) {
      period = {
        from: toIsoDate(m[1]),
        to: toIsoDate(m[2]),
      };
      break;
    }
  }

  // Find transaction details section
  const startIdx = lines.findIndex((l) =>
    /transaction details/i.test(l)
  );

  if (startIdx === -1) {
    return {
      provider,
      accountId,
      accountType,
      period,
      transactions: [],
      warnings: ["Could not find 'Transaction Details' section"],
    };
  }

  const transactions = [];
  let lastTx = null;

  // Parse transactions
  for (let i = startIdx + 1; i < lines.length; i++) {
    const l = lines[i];

    // Stop at end markers
    if (/^IMPORTANT MESSAGES/i.test(l)) break;
    if (/^Please refer to the last four digits/i.test(l)) break;
    if (/^PAYMENT SUMMARY/i.test(l)) break;

    // Foreign currency line (e.g. "22.00 USD")
    const fxMatch = l.match(/^([0-9]+(?:\.[0-9]+)?)\s+([A-Z]{3})$/);
    if (fxMatch && lastTx) {
      lastTx.foreign = { amount: Number(fxMatch[1]), currency: fxMatch[2] };
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

    transactions.push(row);
    lastTx = row;
  }

  return {
    provider,
    accountId,
    accountType,
    period,
    transactions,
    warnings: transactions.length === 0 ? ["No transactions found in statement"] : [],
    metadata: {
      filename,
      parsedAt: new Date().toISOString(),
    },
  };
}