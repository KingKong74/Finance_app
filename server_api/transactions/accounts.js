// server_api/transactions/accounts.js

import { connectToDB } from "../utils/db.js";
import { ObjectId } from "mongodb";

/**
 * ACCOUNTS API
 * 
 * GET    /api/transactions/accounts - List all accounts
 * POST   /api/transactions/accounts - Create account
 * PUT    /api/transactions/accounts/:id - Update account
 * DELETE /api/transactions/accounts/:id - Delete account (if no transactions)
 */
export default async function accountsApi(req, res) {
  try {
    const db = await connectToDB();
    const accountsCol = db.collection("accounts");
    const transactionsCol = db.collection("transactions");
    
    // ────────────────────────────────────────────────────────────
    // GET - List all accounts
    // ────────────────────────────────────────────────────────────
    
    if (req.method === "GET") {
      const accounts = await accountsCol
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      
      // Enrich with transaction counts
      const enriched = await Promise.all(
        accounts.map(async (acc) => {
          const txCount = await transactionsCol.countDocuments({
            accountId: acc.externalId,
          });
          
          const latestTx = await transactionsCol
            .find({ accountId: acc.externalId })
            .sort({ postedAt: -1 })
            .limit(1)
            .toArray();
          
          return {
            ...acc,
            transactionCount: txCount,
            latestTransactionDate: latestTx[0]?.postedAt || null,
          };
        })
      );
      
      return res.status(200).json(enriched);
    }
    
    // ────────────────────────────────────────────────────────────
    // POST - Create account
    // ────────────────────────────────────────────────────────────
    
    if (req.method === "POST") {
      const { externalId, name, provider, accountType } = req.body || {};
      
      if (!externalId || !name) {
        return res.status(400).json({
          error: "externalId and name are required",
        });
      }
      
      // Check for duplicate
      const existing = await accountsCol.findOne({ externalId });
      if (existing) {
        return res.status(409).json({
          error: "Account with this externalId already exists",
        });
      }
      
      const newAccount = {
        externalId,
        name,
        provider: provider || "UNKNOWN",
        accountType: accountType || "transaction",
        currentBalance: null,
        balanceAsOf: null,
        currency: "AUD",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const result = await accountsCol.insertOne(newAccount);
      
      return res.status(201).json({
        ok: true,
        _id: result.insertedId,
        ...newAccount,
      });
    }
    
    // ────────────────────────────────────────────────────────────
    // PUT - Update account
    // ────────────────────────────────────────────────────────────
    
    if (req.method === "PUT") {
      const { id } = req.query;
      const { name, accountType, isActive } = req.body || {};
      
      if (!id) {
        return res.status(400).json({ error: "id query param required" });
      }
      
      const update = { updatedAt: new Date() };
      if (name !== undefined) update.name = name;
      if (accountType !== undefined) update.accountType = accountType;
      if (isActive !== undefined) update.isActive = isActive;
      
      const result = await accountsCol.updateOne(
        { _id: new ObjectId(id) },
        { $set: update }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: "Account not found" });
      }
      
      return res.status(200).json({ ok: true });
    }
    
    // ────────────────────────────────────────────────────────────
    // DELETE - Delete account (only if no transactions)
    // ────────────────────────────────────────────────────────────
    
    if (req.method === "DELETE") {
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ error: "id query param required" });
      }
      
      const account = await accountsCol.findOne({ _id: new ObjectId(id) });
      
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
      
      // Check for transactions
      const txCount = await transactionsCol.countDocuments({
        accountId: account.externalId,
      });
      
      if (txCount > 0) {
        return res.status(409).json({
          error: "Cannot delete account with transactions",
          transactionCount: txCount,
        });
      }
      
      await accountsCol.deleteOne({ _id: new ObjectId(id) });
      
      return res.status(200).json({ ok: true });
    }
    
    // ────────────────────────────────────────────────────────────
    // METHOD NOT ALLOWED
    // ────────────────────────────────────────────────────────────
    
    res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
    
  } catch (err) {
    console.error("Accounts API error:", err);
    return res.status(500).json({
      error: "Server error",
      message: err.message,
    });
  }
}