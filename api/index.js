// /api/index.js  (the ONLY file in /api)
import fx from "../server_api/fx.js";

import ledgerIndex from "../server_api/ledger/index.js";
import ledgerImport from "../server_api/ledger/import.js";
import ledgerImportPreview from "../server_api/ledger/importPreview.js";
import ledgerId from "../server_api/ledger/[id].js";

import pricesIndex from "../server_api/prices/index.js";
import pricesRefresh from "../server_api/prices/refresh.js";

import overviewAccount from "../server_api/overview/account.js";
import overviewCashReport from "../server_api/overview/cash-report.js";

const table = {
  fx,

  // ledger
  "ledger": ledgerIndex,
  "ledger/import": ledgerImport,
  "ledger/importPreview": ledgerImportPreview,
  "ledger/[id]": ledgerId,

  // prices
  "prices": pricesIndex,
  "prices/refresh": pricesRefresh,

  // overview
  "overview/account": overviewAccount,
  "overview/cash-report": overviewCashReport,
};

function pickKey(action, sub) {
  const a = String(action || "").trim();
  const s = String(sub || "").trim(); // can be "import" or "abc123"
  if (!a) return "";

  if (!s) return a;

  // exact match first (eg ledger/import)
  const exact = `${a}/${s}`;
  if (table[exact]) return exact;

  // dynamic id support: /api/ledger/<id> -> ledger/[id]
  if (a === "ledger" && s && !s.includes("/")) return "ledger/[id]";

  return exact;
}

export default async function handler(req, res) {
  try {
    const action = String(req.query.action || "");
    const sub = String(req.query.sub || ""); // may be "import" or "abc123" etc

    const key = pickKey(action, sub);
    const fn = table[key];

    if (!fn) {
      return res.status(404).json({
        error: `Unknown route`,
        got: { action, sub, key },
        allowed: Object.keys(table),
      });
    }

    // If dynamic ledger id route, attach req.query.id
    if (key === "ledger/[id]") {
      req.query.id = sub;
    }

    return await fn(req, res);
  } catch (e) {
    console.error("Admin router error:", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
