// server_api/transactions/importPreview.js

import { default as pdfParse } from "pdf-parse";
import { parseStatement } from "./parsers/index.js";

/**
 * IMPORT PREVIEW API
 * 
 * POST /api/transactions/importPreview
 * Body: { filename, mime, base64 }
 * 
 * Returns: { provider, accountId, transactions[], warnings[], metadata }
 * 
 * This is step 1: parse and preview. User reviews, then calls /import.
 */
export default async function txImportPreview(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const { filename, mime, base64 } = req.body || {};
    
    if (!base64) {
      return res.status(400).json({ error: "Missing base64" });
    }

    const ext = String(filename || "").split(".").pop()?.toLowerCase();
    const buf = Buffer.from(base64, "base64");
    
    let text = "";
    let fileType = ext;
    
    // ────────────────────────────────────────────────────────────
    // 1. EXTRACT TEXT FROM PDF
    // ────────────────────────────────────────────────────────────
    
    if (ext === "pdf" || mime === "application/pdf") {
      try {
        const pdfData = await pdfParse(buf);
        text = pdfData?.text || "";
        fileType = "pdf";
      } catch (err) {
        return res.status(400).json({
          error: "Failed to parse PDF",
          message: err.message,
        });
      }
    } else if (ext === "txt") {
      text = buf.toString("utf8");
      fileType = "txt";
    } else {
      return res.status(400).json({
        error: "Unsupported file type. Please upload a PDF bank statement.",
        supported: [".pdf"],
        got: ext,
      });
    }
    
    if (!text || text.length < 10) {
      return res.status(400).json({
        error: "File appears to be empty or unreadable. Please check the PDF is not password-protected.",
      });
    }
    
    // ────────────────────────────────────────────────────────────
    // 2. PARSE STATEMENT USING MASTER PARSER
    // ────────────────────────────────────────────────────────────
    
    let parsed;
    
    try {
      parsed = await parseStatement(text, filename, fileType);
    } catch (err) {
      return res.status(400).json({
        error: "Failed to parse statement",
        message: err.message,
        hint: "This bank may not be supported yet. Currently supported: ANZ.",
      });
    }
    
    if (!parsed || !parsed.transactions || parsed.transactions.length === 0) {
      return res.status(400).json({
        error: "No transactions found in statement",
        provider: parsed?.provider || "UNKNOWN",
        warnings: parsed?.warnings || [],
        hint: "The statement format may not be recognized. Please check it's a valid bank statement.",
      });
    }
    
    // ────────────────────────────────────────────────────────────
    // 3. RETURN PREVIEW WITH FULL DETAILS
    // ────────────────────────────────────────────────────────────
    
    return res.status(200).json({
      ok: true,
      provider: parsed.provider,
      accountId: parsed.accountId,
      accountType: parsed.accountType || "transaction",
      period: parsed.period,
      count: parsed.transactions.length,
      
      // Return ALL transactions (not capped) since user will review in UI
      transactions: parsed.transactions,
      
      warnings: parsed.warnings || [],
      
      metadata: {
        filename,
        fileType,
        parsedAt: new Date().toISOString(),
      },
    });
    
  } catch (err) {
    console.error("Import preview error:", err);
    return res.status(500).json({
      error: "Server error during parse",
      message: err.message,
    });
  }
}