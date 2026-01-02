// /api/index.js
import path from "path";
import { pathToFileURL } from "url";
import fs from "fs";

function getOriginalUrl(req) {
  return (
    req.headers["x-vercel-original-url"] ||
    req.headers["x-original-uri"] ||
    req.url ||
    "/"
  );
}

function normaliseApiPath(p) {
  // Expect "/api/...."
  if (!p.startsWith("/api")) return null;

  // Strip "/api"
  let rest = p.slice(4); // "" or "/ledger/import"
  if (!rest) rest = "/";

  // Remove trailing slash (except "/")
  if (rest.length > 1 && rest.endsWith("/")) rest = rest.slice(0, -1);

  return rest; // "/" or "/ledger/import"
}

function send404(res, p) {
  return res.status(404).json({ error: `No route for ${p}` });
}

export default async function handler(req, res) {
  try {
    const originalUrl = getOriginalUrl(req);
    const host = req.headers.host || "localhost";
    const url = new URL(originalUrl, `http://${host}`);
    const pathname = url.pathname;

    const rest = normaliseApiPath(pathname);
    if (rest == null) return send404(res, pathname);

    // Build possible file targets inside /server_api
    // Example: /api/ledger/import -> /server_api/ledger/import.js
    // Example: /api/ledger/abc123 -> /server_api/ledger/[id].js  (fallback)
    const serverRoot = path.join(process.cwd(), "server_api");

    const directFile = path.join(serverRoot, `${rest}.js`);          // /ledger/import.js
    const directIndex = path.join(serverRoot, rest, "index.js");     // /ledger/index.js

    let target = null;

    if (fs.existsSync(directFile)) target = directFile;
    else if (fs.existsSync(directIndex)) target = directIndex;
    else {
      // fallback for dynamic [id].js in a folder
      // /api/ledger/<id> => /server_api/ledger/[id].js
      const parts = rest.split("/").filter(Boolean); // ["ledger", "abc123"]
      if (parts.length >= 2) {
        const folder = parts[0];
        const id = parts[1];

        const dyn = path.join(serverRoot, folder, "[id].js");
        if (fs.existsSync(dyn)) {
          // Ensure req.query exists and set id like Next does
          req.query = req.query || {};
          req.query.id = id;
          target = dyn;
        }
      }
    }

    if (!target) return send404(res, pathname);

    // Dynamically import the handler module
    const mod = await import(pathToFileURL(target).href);
    const fn = mod?.default;

    if (typeof fn !== "function") {
      return res.status(500).json({ error: `Handler missing default export for ${target}` });
    }

    return fn(req, res);
  } catch (e) {
    console.error("API auto-router error:", e);
    return res.status(500).json({ error: "API router failed" });
  }
}
