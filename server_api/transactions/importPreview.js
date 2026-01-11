import pdf from "pdf-parse";
import { parseAnzStatementText } from "./parsers/anzStatementText.js";
import { parseGenericCsv } from "./parsers/genericCsv.js";

// NOTE: keep this fast. Preview should NOT write to DB.

function bad(res, msg, extra = {}) {
  return res.status(400).json({ error: msg, ...extra });
}

export default async function txImportPreview(req, res) {
  try {
    if (req.method !== "POST") return bad(res, "Use POST");

    const { filename, mime, base64 } = req.body || {};
    if (!base64) return bad(res, "Missing base64");

    const ext = String(filename || "").split(".").pop()?.toLowerCase();

    // decode
    const buf = Buffer.from(base64, "base64");

    // Decide parse path
    if (ext === "pdf" || mime === "application/pdf") {
      const out = await pdf(buf);
      const text = out?.text || "";

      // ANZ statement text parser (the one we wrote earlier)
      const parsed = parseAnzStatementText(text);

      return res.status(200).json({
        kind: "statement_pdf",
        provider: "ANZ",
        accountId: parsed.accountId,
        period: parsed.period,
        count: parsed.transactions.length,
        transactions: parsed.transactions.slice(0, 200), // cap preview
        warnings: parsed.warnings || [],
      });
    }

    if (ext === "csv") {
      const text = buf.toString("utf8");
      const parsed = parseGenericCsv(text);

      return res.status(200).json({
        kind: "csv",
        provider: parsed.provider || "UNKNOWN",
        count: parsed.transactions.length,
        transactions: parsed.transactions.slice(0, 200),
        warnings: parsed.warnings || [],
      });
    }

    if (ext === "txt") {
      const text = buf.toString("utf8");
      const parsed = parseAnzStatementText(text);
      return res.status(200).json({
        kind: "statement_text",
        provider: "ANZ",
        accountId: parsed.accountId,
        period: parsed.period,
        count: parsed.transactions.length,
        transactions: parsed.transactions.slice(0, 200),
        warnings: parsed.warnings || [],
      });
    }

    return bad(res, "Unsupported file type. Use PDF, CSV, or TXT.", { got: { filename, mime } });
  } catch (e) {
    console.error("tx importPreview error:", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
