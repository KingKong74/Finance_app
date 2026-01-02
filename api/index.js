// /api/index.js
import ledgerIndex from "../server_api/ledger/index.js";
import ledgerImport from "../server_api/ledger/import.js";
import ledgerImportPreview from "../server_api/ledger/importPreview.js";
import ledgerById from "../server_api/ledger/[id].js";

import pricesIndex from "../server_api/prices/index.js";
import pricesRefresh from "../server_api/prices/refresh.js";
import pricesRefresher from "../server_api/prices/refresher.js";

import cashReport from "../server_api/overview/cash-report.js";
import overviewAccount from "../server_api/overview/account.js";

import fx from "../server_api/fx.js";

/**
 * We use a rewrite so *all* /api/* hits this function.
 * Depending on Vercel behaviour, req.url may be "/api/index" instead of original path.
 * So we prefer the original URL header if present.
 */
function getOriginalUrl(req) {
  return (
    req.headers["x-vercel-original-url"] ||
    req.headers["x-original-uri"] ||
    req.url ||
    "/"
  );
}

function send404(res, path) {
  return res.status(404).json({ error: `No route for ${path}` });
}

export default async function handler(req, res) {
  try {
    const originalUrl = getOriginalUrl(req);
    const host = req.headers.host || "localhost";
    const url = new URL(originalUrl, `http://${host}`);
    const path = url.pathname;

    // ---- FX ----
    if (path === "/api/fx") {
      return fx(req, res);
    }

    // ---- CASH REPORT (you call /api/cash-report in the app) ----
    // Your file is in /overview/cash-report.js, but we expose it at /api/cash-report
    if (path === "/api/cash-report") {
      return cashReport(req, res);
    }

    // ---- OVERVIEW ACCOUNT (optional) ----
    if (path === "/api/account") {
      return overviewAccount(req, res);
    }

    // ---- PRICES ----
    if (path === "/api/prices") {
      return pricesIndex(req, res);
    }
    if (path === "/api/prices/refresh") {
      return pricesRefresh(req, res);
    }
    if (path === "/api/prices/refresher") {
      return pricesRefresher(req, res);
    }

    // ---- LEDGER ----
    if (path === "/api/ledger") {
      return ledgerIndex(req, res);
    }
    if (path === "/api/ledger/import") {
      return ledgerImport(req, res);
    }
    if (path === "/api/ledger/importPreview") {
      return ledgerImportPreview(req, res);
    }

    // ---- LEDGER [id] ----
    // Match: /api/ledger/<id>
    // (but not the above fixed routes)
    const m = path.match(/^\/api\/ledger\/([^/]+)$/);
    if (m) {
      req.query = req.query || {};
      req.query.id = m[1];
      return ledgerById(req, res);
    }

    return send404(res, path);
  } catch (e) {
    console.error("API router error:", e);
    return res.status(500).json({ error: "API router failed" });
  }
}
