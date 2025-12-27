// src/pages/portfolio/positions/utils/positionsMath.js

/**
 * Build open positions using FIFO lots (more accurate than avg-cost).
 * - Quantity can go negative (short). We keep it working, but FIFO for shorts can be upgraded later.
 * - Cost basis reflects the remaining open lots (in trade currency).
 * - marketPrice initially uses last trade price as placeholder (easy fallback).
 */
export function buildPositionsFIFO(trades, { useLastTradeAsMarketPrice = true } = {}) {
  // key: ticker|currency|type
  const map = new Map();

  for (const t of trades) {
    const key = `${t.ticker}|${t.currency}|${t.type}`;
    if (!map.has(key)) {
      map.set(key, {
        ticker: t.ticker,
        currency: t.currency,
        type: t.type,
        lots: [], // [{ qty, price }] FIFO queue, qty > 0 for long lots
        quantity: 0,
        costBasis: 0,
        avgPrice: null,
        marketPrice: null,
        lastDate: "",
      });
    }

    const p = map.get(key);

    // last trade price fallback
    if (useLastTradeAsMarketPrice && t.price != null) {
      p.marketPrice = t.price;
      p.lastDate = t.date;
    }

    const q = Number(t.quantity || 0);
    const px = Number(t.price || 0);
    const fee = Number(t.fee || 0);

    // BUY (q > 0): add a lot.
    if (q > 0) {
      p.lots.push({ qty: q, price: px });
      p.quantity += q;
      p.costBasis += q * px + fee;
      p.avgPrice = p.quantity !== 0 ? p.costBasis / p.quantity : null;
      continue;
    }

    // SELL (q < 0): remove from FIFO lots
    if (q < 0) {
      let toSell = Math.abs(q);

      // If no lots (shorting), we’ll just let quantity go negative and treat costBasis roughly.
      // (If you want proper short-lot FIFO later, we’ll implement separate short lots.)
      if (p.lots.length === 0) {
        p.quantity -= toSell;
        // fee: keep as cost drag
        p.costBasis += fee;
        p.avgPrice = p.quantity !== 0 ? p.costBasis / p.quantity : null;
        continue;
      }

      // Consume FIFO lots
      while (toSell > 0 && p.lots.length > 0) {
        const lot = p.lots[0];
        const take = Math.min(lot.qty, toSell);

        // Reduce cost basis by the lot cost we’re closing out
        p.costBasis -= take * lot.price;

        lot.qty -= take;
        toSell -= take;
        p.quantity -= take;

        if (lot.qty <= 1e-12) p.lots.shift();
      }

      // Apply fee as cost drag (so unrealised reflects it too)
      p.costBasis += fee;

      // If you sold more than you had (crossed into short), reflect remaining sell
      if (toSell > 0) {
        p.quantity -= toSell;
        // No lot cost to remove for the short portion here (upgrade later)
      }

      p.avgPrice = p.quantity !== 0 ? p.costBasis / p.quantity : null;
      continue;
    }
  }

  // Keep only non-zero positions
  const out = Array.from(map.values())
    .filter((p) => Math.abs(p.quantity) > 1e-12)
    .map((p) => ({
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

  // Sort: biggest market value first (fallback: cost basis)
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
