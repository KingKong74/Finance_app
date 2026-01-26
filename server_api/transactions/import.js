// server_api/transactions/import.js

import { connectToDB } from "../utils/db.js";
import { ObjectId } from "mongodb";

/**
 * TRANSACTIONS IMPORT API
 * 
 * POST /api/transactions/import
 * Body: { transactions: [...], metadata: {...}, accountInfo?: {...} }
 * 
 * Saves previewed transactions to database with:
 * - Deduplication (via externalId)
 * - Account auto-creation
 * - Import batch tracking
 */
export default async function txImport(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const { transactions, metadata, accountInfo } = req.body || {};

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: "transactions[] is required" });
    }

    const db = await connectToDB();
    
    // Collections
    const accountsCol = db.collection("accounts");
    const transactionsCol = db.collection("transactions");
    const importBatchesCol = db.collection("import_batches");
    
    // Ensure indexes exist
    await ensureIndexes(db);
    
    // ────────────────────────────────────────────────────────────
    // 1. AUTO-CREATE OR UPDATE ACCOUNT
    // ────────────────────────────────────────────────────────────
    
    const provider = metadata?.provider || transactions[0]?.provider || "UNKNOWN";
    let accountId = transactions[0]?.accountId || `${provider}-UNKNOWN`;
    const accountType = metadata?.accountType || transactions[0]?.accountType || "transaction";
    
    // If account info provided (e.g., user selected account from UI), use it
    if (accountInfo?.externalId) {
      accountId = accountInfo.externalId;
    }
    
    // Check if account exists
    let account = await accountsCol.findOne({ externalId: accountId });
    
    if (!account) {
      // Auto-create account
      const newAccount = {
        externalId: accountId,
        name: accountInfo?.name || `${provider} Account (${accountId.slice(-4)})`,
        provider,
        accountType,
        currentBalance: null,
        balanceAsOf: null,
        currency: "AUD",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      await accountsCol.insertOne(newAccount);
      account = newAccount;
      
      console.log(`✅ Auto-created account: ${accountId}`);
    }
    
    // ────────────────────────────────────────────────────────────
    // 2. CREATE IMPORT BATCH
    // ────────────────────────────────────────────────────────────
    
    const batchId = new ObjectId();
    
    const batch = {
      _id: batchId,
      filename: metadata?.filename || "unknown",
      fileType: metadata?.fileType || "pdf",
      provider,
      accountId,
      transactionsCount: transactions.length,
      transactionsImported: 0,
      transactionsDuplicate: 0,
      transactionsFailed: 0,
      periodFrom: metadata?.period?.from || null,
      periodTo: metadata?.period?.to || null,
      status: "processing",
      importedAt: new Date(),
      importedBy: null, // future: user ID
    };
    
    await importBatchesCol.insertOne(batch);
    
    // ────────────────────────────────────────────────────────────
    // 3. PREPARE TRANSACTIONS FOR INSERT
    // ────────────────────────────────────────────────────────────
    
    const docs = transactions.map((tx) => ({
      // Identity
      externalId: tx.externalId,
      accountId,
      
      // Core data
      postedAt: new Date(tx.postedAt),
      occurredAt: new Date(tx.occurredAt),
      description: tx.description,
      amount: Number(tx.amount),
      currency: tx.currency || "AUD",
      balance: tx.balance != null ? Number(tx.balance) : null,
      
      // Rich metadata
      merchant: tx.merchant || null,
      cardLast4: tx.cardLast4 || null,
      foreign: tx.foreign || null,
      fees: Number(tx.fees || 0),
      
      // Categorization (initially empty)
      categoryId: null,
      categoryName: null,
      journalEntryId: null,
      
      // Reconciliation
      isReconciled: false,
      reconciledAt: null,
      reconciledBy: null,
      
      // Import metadata
      source: tx.source || "statement_import",
      importedAt: new Date(),
      importBatchId: batchId.toString(),
      
      // Audit
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    
    // ────────────────────────────────────────────────────────────
    // 4. BULK INSERT WITH DEDUPLICATION
    // ────────────────────────────────────────────────────────────
    
    let imported = 0;
    let duplicates = 0;
    let failed = 0;
    
    // Insert one by one to handle duplicates gracefully
    // (bulkWrite with ordered:false would be faster but harder to track)
    for (const doc of docs) {
      try {
        await transactionsCol.insertOne(doc);
        imported++;
      } catch (err) {
        if (err.code === 11000) {
          // Duplicate key error (externalId already exists)
          duplicates++;
        } else {
          console.error("Transaction insert failed:", err.message);
          failed++;
        }
      }
    }
    
    // ────────────────────────────────────────────────────────────
    // 5. UPDATE BATCH STATUS
    // ────────────────────────────────────────────────────────────
    
    await importBatchesCol.updateOne(
      { _id: batchId },
      {
        $set: {
          transactionsImported: imported,
          transactionsDuplicate: duplicates,
          transactionsFailed: failed,
          status: "completed",
        },
      }
    );
    
    // ────────────────────────────────────────────────────────────
    // 6. UPDATE ACCOUNT BALANCE (if available)
    // ────────────────────────────────────────────────────────────
    
    // Find most recent transaction with balance
    const latestWithBalance = docs
      .filter((d) => d.balance != null)
      .sort((a, b) => b.postedAt - a.postedAt)[0];
    
    if (latestWithBalance) {
      await accountsCol.updateOne(
        { externalId: accountId },
        {
          $set: {
            currentBalance: latestWithBalance.balance,
            balanceAsOf: latestWithBalance.postedAt,
            updatedAt: new Date(),
          },
        }
      );
    }
    
    // ────────────────────────────────────────────────────────────
    // 7. RESPONSE
    // ────────────────────────────────────────────────────────────
    
    return res.status(200).json({
      ok: true,
      batchId: batchId.toString(),
      accountId,
      accountName: account.name,
      summary: {
        total: transactions.length,
        imported,
        duplicates,
        failed,
      },
    });
    
  } catch (err) {
    console.error("Import error:", err);
    return res.status(500).json({ 
      error: "Import failed",
      message: err.message 
    });
  }
}

/**
 * ENSURE INDEXES
 */
async function ensureIndexes(db) {
  const accountsCol = db.collection("accounts");
  const transactionsCol = db.collection("transactions");
  const importBatchesCol = db.collection("import_batches");
  
  // Accounts indexes
  await accountsCol.createIndex({ externalId: 1 }, { unique: true });
  await accountsCol.createIndex({ provider: 1 });
  await accountsCol.createIndex({ isActive: 1 });
  
  // Transactions indexes
  await transactionsCol.createIndex({ externalId: 1 }, { unique: true });
  await transactionsCol.createIndex({ accountId: 1, postedAt: -1 });
  await transactionsCol.createIndex({ categoryId: 1 });
  await transactionsCol.createIndex({ isReconciled: 1 });
  await transactionsCol.createIndex({ importBatchId: 1 });
  await transactionsCol.createIndex({ postedAt: -1 });
  
  // Import batches indexes
  await importBatchesCol.createIndex({ accountId: 1, importedAt: -1 });
  await importBatchesCol.createIndex({ status: 1 });
}