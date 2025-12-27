// /api/utils/eodhd.js
//
// Fetch delayed "live" prices from EODHD.
// Docs show: https://eodhd.com/api/real-time/AAPL.US?api_token=demo&fmt=json
// Multi tickers: https://eodhd.com/api/real-time/AAPL.US?s=VTI,EUR.FOREX&api_token=demo&fmt=json :contentReference[oaicite:2]{index=2}
//
// For ASX, use ".AU" (e.g., REA.AU). :contentReference[oaicite:3]{index=3}

const DEFAULT_EXCHANGE = "AU"; // you can extend later if you store exchange per-instrument

function toEodhdSymbol(base, exchange = DEFAULT_EXCHANGE) {
  const t = String(base || "").trim().toUpperCase();
  if (!t) return null;
  // If user already passed "REA.AU" keep it
  if (t.includes(".")) return t;
  return `${t}.${exchange}`;
}

function normaliseEodhdRow(row) {
  if (!row || typeof row !== "object") return null;

  // EODHD real-time object typically includes code + close (or price-ish field)
  const code = String(row.code || row.symbol || "").toUpperCase();
  const rawPrice =
    row.close ?? row.price ?? row.last ?? row.adjusted_close ?? null;

  const priceNum = rawPrice == null ? null : Number(rawPrice);
  if (priceNum == null || Number.isNaN(priceNum)) return null;

  // timestamp is often unix seconds; sometimes iso-ish string depending on endpoint variants
  let asOf = null;
  if (row.timestamp != null) {
    const ts = Number(row.timestamp);
    asOf = Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null;
  }
  if (!asOf && row.datetime) asOf = String(row.datetime);
  if (!asOf) asOf = new Date().toISOString();

  return {
    code, // e.g. "REA.AU"
    price: priceNum,
    currency: row.currency || "AUD",
    asOf,
    source: "eodhd-delayed",
  };
}

export async function fetchEodhdLivePrices(baseSymbols, exchange = DEFAULT_EXCHANGE) {
  const apiToken = process.env.EODHD_API_TOKEN;
  if (!apiToken) throw new Error("Missing EODHD_API_TOKEN");

  const bases = Array.from(new Set((baseSymbols || []).map((s) => String(s || "").toUpperCase()))).filter(Boolean);
  if (!bases.length) return {};

  const eSyms = bases.map((b) => toEodhdSymbol(b, exchange)).filter(Boolean);
  if (!eSyms.length) return {};

  // EODHD multi-ticker uses "s=" on the first symbol endpoint :contentReference[oaicite:4]{index=4}
  const head = eSyms[0];
  const rest = eSyms.slice(1);

  const qs = new URLSearchParams({
    api_token: apiToken,
    fmt: "json",
  });
  if (rest.length) qs.set("s", rest.join(","));

  const url = `https://eodhd.com/api/real-time/${encodeURIComponent(head)}?${qs.toString()}`;

  const r = await fetch(url, {
    headers: { accept: "application/json" },
  });

  const data = await r.json().catch(() => null);
  if (!r.ok || !data) {
    throw new Error(`EODHD HTTP error: ${r.status}`);
  }

  const out = {};

  // Possible shapes:
  // - single symbol: { code:"AAPL.US", close:..., ... }
  // - multi: [ {code:"AAPL.US",...}, {code:"VTI",...}, ... ]  (common)
  // - multi: object keyed by symbols (less common)
  if (Array.isArray(data)) {
    for (const row of data) {
      const item = normaliseEodhdRow(row);
      if (!item?.code) continue;

      const base = item.code.includes(".") ? item.code.split(".")[0] : item.code;
      out[base] = {
        price: item.price,
        currency: item.currency,
        asOf: item.asOf,
        source: item.source,
      };
    }
    return out;
  }

  // single object
  const single = normaliseEodhdRow(data);
  if (single?.code) {
    const base = single.code.includes(".") ? single.code.split(".")[0] : single.code;
    out[base] = {
      price: single.price,
      currency: single.currency,
      asOf: single.asOf,
      source: single.source,
    };
  }

  // keyed object fallback
  if (!Object.keys(out).length && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      const item = normaliseEodhdRow(v);
      const keyBase = String(k || "").toUpperCase().split(".")[0];
      if (item?.price != null && keyBase) {
        out[keyBase] = {
          price: item.price,
          currency: item.currency,
          asOf: item.asOf,
          source: item.source,
        };
      }
    }
  }

  return out;
}
