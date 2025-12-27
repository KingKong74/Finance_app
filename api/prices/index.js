// /api/prices/index.js
// Free quotes via Stooq (no API key). Mostly end-of-day / delayed style quotes.
// Returns: { "AAPL": { price: 123.45, currency: "USD" }, ... }

function parseSymbols(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50); // basic safety cap
}

function stooqSymbol(sym) {
  // Stooq uses things like aapl.us, rea.au, etc.
  // We'll assume:
  // - If symbol already contains ".", keep it (e.g., "REA.AU")
  // - Otherwise treat as US stock (".US")
  if (sym.includes(".")) return sym.toLowerCase();
  return `${sym.toLowerCase()}.us`;
}

function currencyFromStooqSymbol(stq) {
  if (stq.endsWith(".au")) return "AUD";
  if (stq.endsWith(".us")) return "USD";
  return "USD";
}

async function fetchStooqClose(stq) {
  // Example:
  // https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stq)}&f=sd2t2ohlcv&h&e=csv`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Stooq fetch failed: ${r.status}`);

  const text = await r.text();

  // CSV format:
  // Symbol,Date,Time,Open,High,Low,Close,Volume
  // AAPL.US,2025-12-26,22:00:09,....,Close,Volume
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;

  const cols = lines[1].split(",");
  const close = cols[6]; // Close column
  const price = Number(close);

  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
}

export default async function handler(req, res) {
  try {
    // Use WHATWG URL API (avoids url.parse deprecation)
    const fullUrl = new URL(req.url, `https://${req.headers.host}`);
    const raw = fullUrl.searchParams.get("symbols");

    const symbols = parseSymbols(raw);
    if (!symbols.length) {
      return res.status(400).json({ error: "Missing symbols" });
    }

    const out = {};
    await Promise.all(
      symbols.map(async (sym) => {
        try {
          const stq = stooqSymbol(sym);
          const price = await fetchStooqClose(stq);
          if (price == null) return;

          out[sym] = {
            price,
            currency: currencyFromStooqSymbol(stq),
            source: "stooq",
          };
        } catch (e) {
          // ignore per-symbol failures
        }
      })
    );

    return res.status(200).json(out);
  } catch (err) {
    console.error("prices API error:", err);
    return res.status(500).json({ error: "Failed to fetch prices" });
  }
}
