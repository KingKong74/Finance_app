// server_api/transactions/import.js

import { connectToDB } from "../utils/db.js";

/**
 * TRANSACTION IMPORT API
 * 
 * POST /api/transactions/import
 * Body: { transactions: [...], metadata: { provider, accountId, filename, importedAt } }
 * 
 * Saves transactions to MongoDB with deduplication.
 * Returns: { ok: true, imported: N, skipped: N, duplicates: [...] }
 */
export default async function txImport(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const { transactions, metadata } = req.body || {};

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: "transactions array is required" });
    }

    const db = await connectToDB();
    const col = db.collection("transactions");

    // ────────────────────────────────────────────────────────────
    // DEDUPE CHECK
    // Check which transactions already exist based on externalId
    // ────────────────────────────────────────────────────────────

    const externalIds = transactions.map((tx) => tx.externalId).filter(Boolean);

    const existing = await col
      .find({ externalId: { $in: externalIds } })
      .project({ externalId: 1 })
      .toArray();

    const existingSet = new Set(existing.map((doc) => doc.externalId));

    // ────────────────────────────────────────────────────────────
    // PREPARE DOCUMENTS
    // Only import transactions that don't already exist
    // ────────────────────────────────────────────────────────────

    const now = new Date();
    const docsToInsert = [];
    const duplicates = [];

    for (const tx of transactions) {
      if (!tx.externalId) {
        // Skip transactions without externalId (shouldn't happen)
        continue;
      }

      if (existingSet.has(tx.externalId)) {
        // Duplicate - skip
        duplicates.push(tx.externalId);
        continue;
      }

      // New transaction - prepare for insert
      docsToInsert.push({
        ...tx,
        importedAt: now,
        importMetadata: metadata || {},
        
        // Ensure consistent field names
        accountId: tx.accountId || metadata?.accountId || "UNKNOWN",
        provider: tx.provider || metadata?.provider || "UNKNOWN",
        postedAt: tx.postedAt || tx.date,
        occurredAt: tx.occurredAt || tx.postedAt || tx.date,
        
        // Additional fields for future use
        category: null,
        merchant: tx.merchant || null,
        tags: [],
        notes: "",
        matched: false,
        reconciled: false,
      });
    }

    // ────────────────────────────────────────────────────────────
    // INSERT TO DATABASE
    // ────────────────────────────────────────────────────────────

    let insertedCount = 0;

    if (docsToInsert.length > 0) {
      const result = await col.insertMany(docsToInsert);
      insertedCount = result.insertedCount;
    }

    // ────────────────────────────────────────────────────────────
    // RETURN RESULTS
    // ────────────────────────────────────────────────────────────

    return res.status(200).json({
      ok: true,
      imported: insertedCount,
      skipped: duplicates.length,
      total: transactions.length,
      duplicates: duplicates.slice(0, 10), // only return first 10 for brevity
      message: `Imported ${insertedCount} transaction(s), skipped ${duplicates.length} duplicate(s).`,
    });

  } catch (err) {
    console.error("Transaction import error:", err);
    return res.status(500).json({
      error: "Server error during import",
      message: err.message,
    });
  }
}