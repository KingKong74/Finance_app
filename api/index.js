// api/index.js
// Central Vercel serverless function. All API routes flow through here.
// URL pattern: /api?action=<route>&sub=<sub-path>
//
// To add a new route, import the handler and add it to `table`.

import fx                from "../server_api/fx.js";

import ledgerIndex       from "../server_api/ledger/index.js";
import ledgerImport      from "../server_api/ledger/import.js";
import ledgerPreview     from "../server_api/ledger/importPreview.js";
import ledgerId          from "../server_api/ledger/[id].js";

import pricesIndex       from "../server_api/prices/index.js";
import pricesRefresh     from "../server_api/prices/refresh.js";

import overviewAccount   from "../server_api/overview/account.js";
import overviewCashReport from "../server_api/overview/cash-report.js";

import txImportPreview   from "../server_api/transactions/importPreview.js";
import txImport          from "../server_api/transactions/import.js";
import txAccounts        from "../server_api/transactions/accounts.js";

// ---------------------------------------------------------------------------
// Route table  action -> handler
// ---------------------------------------------------------------------------
const table = {
  "fx":                       fx,
  "ledger":                   ledgerIndex,
  "ledger/import":            ledgerImport,
  "ledger/importPreview":     ledgerPreview,
  "prices":                   pricesIndex,
  "prices/refresh":           pricesRefresh,
  "overview/account":         overviewAccount,
  "overview/cash-report":     overviewCashReport,
  "transactions/importPreview": txImportPreview,
  "transactions/import":      txImport,
  "transactions/accounts":    txAccounts,
  // Dynamic route — matched below
  "ledger/[id]":              ledgerId,
};

// ---------------------------------------------------------------------------
// Route resolution
// ---------------------------------------------------------------------------
function resolveKey(action, sub) {
  const a = String(action || "").trim();
  const s = String(sub    || "").trim();
  if (!a) return null;

  // No sub-path — direct lookup
  if (!s) return table[a] ? a : null;

  // Exact match first (e.g. "ledger/import")
  const exact = `${a}/${s}`;
  if (table[exact]) return exact;

  // Dynamic id: /api?action=ledger&sub=<uuid>
  if (a === "ledger" && !s.includes("/")) return "ledger/[id]";

  return null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  try {
    const action = String(req.query.action || "").trim();
    const sub    = String(req.query.sub    || "").trim();

    const key = resolveKey(action, sub);
    const fn  = key ? table[key] : null;

    if (!fn) {
      return res.status(404).json({
        error:   "Unknown route",
        got:     { action, sub },
        allowed: Object.keys(table),
      });
    }

    // For dynamic ledger id routes, attach the id to req.query
    if (key === "ledger/[id]") {
      req.query.id = sub;
    }

    return await fn(req, res);
  } catch (e) {
    console.error("Router error:", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}