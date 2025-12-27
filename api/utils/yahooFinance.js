// /api/utils/yahooFinance.js

export async function fetchYahooPrices(symbols) {
  const out = {};

  for (const sym of symbols) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      sym
    )}?interval=1d&range=1d`;

    const r = await fetch(url, {
      headers: {
        // Yahoo is much more reliable when these are present
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-AU,en;q=0.9",
      },
    });

    if (!r.ok) {
      // Don’t hide the reason — it’s crucial for debugging
      const txt = await r.text().catch(() => "");
      throw new Error(`Yahoo HTTP ${r.status} for ${sym}: ${txt.slice(0, 120)}`);
    }

    const data = await r.json().catch(() => null);

    const result = data?.chart?.result?.[0];
    const meta = result?.meta;

    const px = meta?.regularMarketPrice;
    if (px == null) continue;

    out[sym] = {
      price: Number(px),
      currency: meta.currency || "AUD",
      asOf: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString(),
      source: "yahoo-finance",
    };
  }

  return out;
}
