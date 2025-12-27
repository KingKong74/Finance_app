// src/pages/portfolio/positions/utils/positionsMath.js

/**
 * FIFO open-position builder that supports BOTH long and short lots.
 *
 * Conventions:
 * - quantity is signed: long > 0, short < 0
 * - lots store signed qty:
 *   - long lot:  { qty: +10, price: 100 }
 *   - short lot: { qty: -10, price: 100 }
 * - costBasis is the signed sum of open lots (plus fees applied as "cost drag"):
 *   - long:  positive cost basis
 *   - short: negative cost basis (represents proceeds from the short sale)
 *
 * With your UI formula:
 *   marketValue = quantity * marketPrice
 *   unrealised  = marketValue - costBasis
 * …this gives correct signs for shorts.
 */
export function buildPositionsFIFO(
  trades,
  { useLastTradeAsMarketPrice = true } = {}
) {
  // key: ticker|currency|type
  const map = new Map();

  for (const t of trades) {
    const key = `${t.ticker}|${t.currency}|${t.type}`;

    if (!map.has(key)) {
      map.set(key, {
        ticker: t.ticker,
        currency: t.currency,
        type: t.type,
        lots: [], // FIFO queue: [{ qty (signed), price }]
        quantity: 0,
        costBasis: 0,
        avgPrice: null,
        marketPrice: null,
        lastDate: "",
      });
    }

    const p = map.get(key);

    // last trade price fallback (kept same behaviour as before)
    if (useLastTradeAsMarketPrice && t.price != null) {
      p.marketPrice = Number(t.price);
      p.lastDate = t.date;
    }

    const q = Number(t.quantity || 0);
    const px = Number(t.price || 0);
    const fee = Number(t.fee || 0);

    if (!q) continue;

    // Helper: sign of a number as -1, 0, +1
    const sgn = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);

    // We will "apply" this trade by first netting against opposite-direction lots FIFO,
    // then (if leftover) opening a new lot in the trade direction.
    let remaining = q;

    // While we still have remaining qty AND there is an opposite-direction open lot at the front
    while (
      remaining !== 0 &&
      p.lots.length > 0 &&
      sgn(p.lots[0].qty) !== sgn(remaining)
    ) {
      const lot = p.lots[0];

      const lotSign = sgn(lot.qty); // +1 long lot, -1 short lot
      const takeAbs = Math.min(Math.abs(remaining), Math.abs(lot.qty));

      // Reduce lot towards zero by takeAbs (keeping sign)
      lot.qty = lot.qty - lotSign * takeAbs;

      // Position quantity moves opposite to the lot sign when closing
      // - closing long reduces qty
      // - closing short increases qty (towards zero)
      p.quantity += -lotSign * takeAbs;

      // Remove that portion from costBasis:
      // long lot: costBasis -= +takeAbs*price (reduces)
      // short lot: costBasis -= -takeAbs*price (increases, less negative)
      p.costBasis -= lotSign * takeAbs * lot.price;

      // Consume remaining trade qty:
      // if remaining is + (buy), covering short -> remaining decreases
      // if remaining is - (sell), selling long -> remaining increases towards 0
      remaining = remaining - sgn(remaining) * takeAbs;

      // Drop lot if fully closed
      if (Math.abs(lot.qty) <= 1e-12) p.lots.shift();
    }

    // If we still have remaining, it becomes a NEW open lot in that direction
    if (remaining !== 0) {
      p.lots.push({ qty: remaining, price: px });

      // Quantity increases by remaining (signed)
      p.quantity += remaining;

      // Cost basis adds signed notional
      // long: +qty*price
      // short: -qtyAbs*price (negative)
      p.costBasis += remaining * px;
    }

    // Fee as "cost drag" on the open position.
    // We keep behaviour consistent with your current code: add fee directly.
    // (If later you want perfect fee semantics for negative-fee inputs, we can normalise fees.)
    p.costBasis += fee;

    // Avg price is costBasis / quantity (works for both signs; short becomes positive)
    p.avgPrice = p.quantity !== 0 ? p.costBasis / p.quantity : null;
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

  // Sort: biggest absolute market value first (fallback: cost basis)
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
