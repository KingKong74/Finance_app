// /api/prices.js
// Free prices via Stooq (no API key).
// NOTE: Stooq uses tickers like aapl.us, msft.us etc.

function toStooqSymbol(sym) {
  // basic US mapping: AMZN -> amzn.us
  return `${String(sym).trim().toLowerCase()}.us`;
}

async function fetchStooqQuote(symbol) {
  const stooq = toStooqSymbol(symbol);
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooq)}&f=sd2t2ohlcv&h&e=csv`;

  const r = await fetch(url);
  if (!r.ok) return null;

  const text = await r.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;

  // header: Symbol,Date,Time,Open,High,Low,Close,Volume
  const cols = lines[1].split(",");
  const close = Number(cols[6]);

  if (!Number.isFinite(close) || close <= 0) return null;
  return { price: close, currency: "USD" };
}

export default async function handler(req, res) {
  try {
    const raw = String(req.query.symbols || "");
    const symbols = raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (!symbols.length) {
      return res.status(400).json({ error: "symbols required, e.g. ?symbols=AMZN,MSFT" });
    }

    // Fetch in parallel (keep it sensible so you don’t hammer it)
    const results = await Promise.all(
      symbols.slice(0, 60).map(async (sym) => [sym, await fetchStooqQuote(sym)])
    );

    const out = {};
    for (const [sym, quote] of results) {
      if (quote) out[sym] = quote;
    }

    return res.status(200).json(out);
  } catch (e) {
    console.error("prices error:", e);
    return res.status(500).json({ error: "Failed to fetch prices" });
  }
}
