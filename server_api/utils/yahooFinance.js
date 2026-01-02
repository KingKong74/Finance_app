// /api/utils/yahooFinance.js

export async function fetchYahooPrices(symbols) {
  // symbols like ["REA.AX", "CBA.AX"]
  const out = {};

  for (const sym of symbols) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`;

    const r = await fetch(url);
    const data = await r.json().catch(() => null);

    const result = data?.chart?.result?.[0];
    const meta = result?.meta;

    if (!meta?.regularMarketPrice) continue;

    out[sym] = {
      price: Number(meta.regularMarketPrice),
      currency: meta.currency || "AUD",
      asOf: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString(),
      source: "yahoo-finance",
    };
  }

  return out;
}
