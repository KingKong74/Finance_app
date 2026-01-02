/**
 * FIFO open-position builder that supports BOTH long and short lots.
 * Used for equities, crypto, AND forex.
 */
export function buildPositionsFIFO(
  trades,
  { useLastTradeAsMarketPrice = true } = {}
) {
  const map = new Map();

  for (const t of trades) {
    const key = `${t.broker}|${t.ticker}|${t.currency}|${t.type}`;

    if (!map.has(key)) {
      map.set(key, {
        broker: t.broker,
        ticker: t.ticker,
        currency: t.currency,
        type: t.type,
        lots: [],
        quantity: 0,
        costBasis: 0,
        avgPrice: null,
        marketPrice: null,
        lastDate: "",
      });
    }

    const p = map.get(key);

    if (useLastTradeAsMarketPrice && t.price != null) {
      p.marketPrice = Number(t.price);
      p.lastDate = t.date;
    }

    const q = Number(t.quantity || 0);
    const px = Number(t.price || 0);
    const fee = Number(t.fee || 0);
    if (!q) continue;

    const sgn = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
    let remaining = q;

    while (
      remaining !== 0 &&
      p.lots.length > 0 &&
      sgn(p.lots[0].qty) !== sgn(remaining)
    ) {
      const lot = p.lots[0];
      const lotSign = sgn(lot.qty);
      const takeAbs = Math.min(Math.abs(remaining), Math.abs(lot.qty));

      lot.qty -= lotSign * takeAbs;
      p.quantity += -lotSign * takeAbs;
      p.costBasis -= lotSign * takeAbs * lot.price;
      remaining -= sgn(remaining) * takeAbs;

      if (Math.abs(lot.qty) < 1e-12) p.lots.shift();
    }

    if (remaining !== 0) {
      p.lots.push({ qty: remaining, price: px });
      p.quantity += remaining;
      p.costBasis += remaining * px;
    }

    p.costBasis += fee;
    p.avgPrice = p.quantity !== 0 ? p.costBasis / p.quantity : null;
  }

  return Array.from(map.values())
    .filter((p) => Math.abs(p.quantity) > 1e-12)
    .map((p) => ({
      ...p,
      marketSource: useLastTradeAsMarketPrice ? "last-trade" : "none",
      marketAsOf: null,
    }));
}

/* ────────────────────────────────────────────── */
/* NEW HELPERS                                    */
/* ────────────────────────────────────────────── */

export function splitPositionsByType(positions) {
  const equities = [];
  const fx = [];

  for (const p of positions) {
    if (p.type === "forex") fx.push(p);
    else equities.push(p);
  }

  return { equities, fx };
}
