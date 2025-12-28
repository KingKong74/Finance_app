// src/pages/portfolio/positions/utils/positionsMath.js

export function buildPositionsFIFO(
  trades,
  { useLastTradeAsMarketPrice = true } = {}
) {
  // key: broker|ticker|currency|type  ✅ add broker
  const map = new Map();

  for (const t of trades) {
    const broker = String(t.broker || "").trim() || "Unknown";
    const key = `${broker}|${t.ticker}|${t.currency}|${t.type}`;

    if (!map.has(key)) {
      map.set(key, {
        broker, // ✅ keep broker
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

      lot.qty = lot.qty - lotSign * takeAbs;

      p.quantity += -lotSign * takeAbs;
      p.costBasis -= lotSign * takeAbs * lot.price;

      remaining = remaining - sgn(remaining) * takeAbs;

      if (Math.abs(lot.qty) <= 1e-12) p.lots.shift();
    }

    if (remaining !== 0) {
      p.lots.push({ qty: remaining, price: px });
      p.quantity += remaining;
      p.costBasis += remaining * px;
    }

    p.costBasis += fee;

    p.avgPrice = p.quantity !== 0 ? p.costBasis / p.quantity : null;
  }

  const out = Array.from(map.values())
    .filter((p) => Math.abs(p.quantity) > 1e-12)
    .map((p) => ({
      broker: p.broker, // ✅ output broker
      ticker: p.ticker,
      currency: p.currency,
      type: p.type,
      quantity: p.quantity,
      costBasis: p.costBasis,
      avgPrice: p.avgPrice,
      marketPrice: p.marketPrice,
      lastDate: p.lastDate,
      marketSource: useLastTradeAsMarketPrice ? "last-trade" : "none",
      marketAsOf: null,
    }));

  out.sort((a, b) => {
    const amv = a.marketPrice != null ? a.marketPrice * a.quantity : a.costBasis;
    const bmv = b.marketPrice != null ? b.marketPrice * b.quantity : b.costBasis;
    return Math.abs(bmv) - Math.abs(amv);
  });

  return out;
}

export function summariseCash(cashRows) {
  const byCcy = new Map();

  for (const c of cashRows) {
    const key = c.currency;
    if (!byCcy.has(key)) byCcy.set(key, 0);

    const sign = c.entryType === "withdrawal" ? -1 : 1;
    byCcy.set(key, byCcy.get(key) + sign * Number(c.amount || 0));
  }

  return Array.from(byCcy.entries())
    .map(([currency, balance]) => ({ currency, balance }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
