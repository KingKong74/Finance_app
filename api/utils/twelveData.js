// /api/utils/twelveData.js
export async function fetchLivePrices(symbols) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("Missing TWELVE_DATA_API_KEY");

  const qs = new URLSearchParams({
    symbol: symbols.join(","),
    apikey: apiKey,
  });

  const url = `https://api.twelvedata.com/quote?${qs.toString()}`;

  const r = await fetch(url, { headers: { accept: "application/json" } });
  const data = await r.json().catch(() => null);

  if (!r.ok || !data) {
    throw new Error(`Twelve Data HTTP error: ${r.status}`);
  }

  if (data.status === "error") {
    throw new Error(data.message || "Twelve Data error");
  }

  const out = {};

  const normaliseOne = (obj) => {
    if (!obj || obj.status === "error") return null;

    const rawPrice = obj.price ?? obj.close ?? obj.last ?? null;
    const priceNum = rawPrice == null ? null : Number(rawPrice);
    if (Number.isNaN(priceNum)) return null;

    return {
      price: priceNum,
      currency: obj.currency || "USD",
      asOf: obj.datetime || new Date().toISOString(),
      source: "twelvedata-live",
    };
  };

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

  const sym = String(data.symbol || symbols[0] || "").toUpperCase();
  const item = normaliseOne(data);
  if (sym && item) out[sym] = item;

  return out;
}
