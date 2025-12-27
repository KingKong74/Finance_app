// /api/prices/index.js

async function fetchLivePrices(symbols) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("Missing TWELVE_DATA_API_KEY");

  // Twelve Data batch: symbol=AAPL,MSFT,EUR/USD,BTC/USD  :contentReference[oaicite:1]{index=1}
  const qs = new URLSearchParams({
    symbol: symbols.join(","),
    apikey: apiKey,
  });

  // quote gives currency + more fields (price endpoint is lighter but less metadata)
  const url = `https://api.twelvedata.com/quote?${qs.toString()}`;

  const r = await fetch(url, {
    headers: { "accept": "application/json" },
  });

  // If you hit limits you may see 4xx or an "error" JSON
  const data = await r.json().catch(() => null);
  if (!r.ok || !data) {
    throw new Error(`Twelve Data HTTP error: ${r.status}`);
  }

  // If API returns a top-level error object
  if (data.status === "error") {
    throw new Error(data.message || "Twelve Data error");
  }

  // Normalise both possible shapes:
  // 1) single symbol => { symbol:"AAPL", currency:"USD", close:"...", ... }
  // 2) batch => { AAPL: {...}, MSFT: {...} } (common for batch JSON)
  const out = {};

  const normaliseOne = (obj) => {
    if (!obj) return null;
    if (obj.status === "error") return null;

    // Twelve Data commonly uses "close" as the latest price in quote
    // but we defensively try a few.
    const rawPrice =
      obj.price ?? obj.close ?? obj.last ?? obj.regularMarketPrice ?? null;

    const priceNum = rawPrice == null ? null : Number(rawPrice);
    if (priceNum == null || Number.isNaN(priceNum)) return null;

    return {
      price: priceNum,
      currency: obj.currency || "USD",
      // Quote often includes datetime; fall back to now if missing
      asOf: obj.datetime || obj.timestamp || new Date().toISOString(),
      source: "twelvedata-live",
    };
  };

  // batch response: keys are symbols
  const looksBatch =
    typeof data === "object" &&
    !Array.isArray(data) &&
    !("symbol" in data) &&
    symbols.some((s) => Object.prototype.hasOwnProperty.call(data, s));

  if (looksBatch) {
    for (const sym of symbols) {
      const item = normaliseOne(data[sym]);
      if (item) out[sym] = item;
    }
    return out;
  }

  // single response
  const sym = String(data.symbol || symbols[0] || "").toUpperCase();
  const item = normaliseOne(data);
  if (sym && item) out[sym] = item;

  return out;
}
