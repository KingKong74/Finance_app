// /api/utils/yahooFinance.js

function normaliseYahooQuote(q) {
  const px = q?.regularMarketPrice;
  if (px == null) return null;

  const asOf =
    q?.regularMarketTime != null
      ? new Date(q.regularMarketTime * 1000).toISOString()
      : new Date().toISOString();

  return {
    price: Number(px),
    currency: q?.currency || "AUD",
    asOf,
    source: "yahoo-finance", // you’ll badge this as DELAYED in UI
  };
}

export async function fetchYahooPrices(symbols) {
  // symbols expected like ["REA.AX","CBA.AX"]
  if (!symbols?.length) return {};

  // Yahoo supports comma-separated symbols
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    symbols.join(",")
  )}`;

  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json,text/plain,*/*",
      "Accept-Language": "en-AU,en;q=0.9",
    },
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Yahoo HTTP ${r.status}: ${txt.slice(0, 160)}`);
  }

  const data = await r.json().catch(() => null);
  const results = data?.quoteResponse?.result;

  if (!Array.isArray(results)) return {};

  const out = {};
  for (const q of results) {
    const sym = String(q?.symbol || "").toUpperCase();
    const item = normaliseYahooQuote(q);
    if (sym && item) out[sym] = item;
  }

  return out;
}
