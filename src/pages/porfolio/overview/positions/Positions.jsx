import React, { useEffect, useMemo, useState } from "react";
import "../../../../css/positionsTab.css";

/**
 * FX rates (placeholder)
 * Rates are "1 unit = rate AUD" (same style you used in Ledger)
 */
const EXCHANGE_RATES = { AUD: 1, USD: 1.65, EUR: 1.8 };

/**
 * If a live price can't be fetched, we fallback to last trade price.
 */
const useLastTradeAsMarketPrice = true;

async function safeJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(`Expected JSON, got: ${ct}. Body starts: ${text.slice(0, 60)}`);
  }
  return res.json();
}


/** ---------- formatting helpers ---------- */
const fmtMoney = (n, ccy = "AUD") => {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: 2,
  });
};

const fmtNum = (n, dp = 6) => {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, { maximumFractionDigits: dp });
};

const toBase = (value, from, to) => {
  const v = Number(value || 0);
  const rFrom = EXCHANGE_RATES[from] ?? 1;
  const rTo = EXCHANGE_RATES[to] ?? 1;
  return (v * rFrom) / rTo;
};

export default function Positions() {
  const [rows, setRows] = useState([]);
  const [cashRows, setCashRows] = useState([]);

  // "AUD" | "USD" | "EUR" | "MARKET"
  const [displayCurrency, setDisplayCurrency] = useState("AUD");

  const [loading, setLoading] = useState(true);

  // live prices by ticker: { AMZN: { price: 212.34, currency: "USD" } }
  const [prices, setPrices] = useState({});

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);

        // Pull trades + crypto + cash
        const [rTrades, rCrypto, rCash] = await Promise.all([
          fetch("/api/ledger?tab=trades"),
          fetch("/api/ledger?tab=crypto"),
          fetch("/api/ledger?tab=cash"),
        ]);

        const [trades, crypto, cash] = await Promise.all([
          rTrades.ok ? rTrades.json() : [],
          rCrypto.ok ? rCrypto.json() : [],
          rCash.ok ? rCash.json() : [],
        ]);

        const allTrades = [
          ...(Array.isArray(trades) ? trades : []),
          ...(Array.isArray(crypto) ? crypto : []),
        ];

        // Normalise & sort by date (string YYYY-MM-DD)
        const normalised = allTrades
          .map((t) => ({
            ticker: String(t.ticker || "").toUpperCase(),
            date: String(t.date || ""),
            quantity: Number(t.quantity || 0),
            price: Number(t.price || 0),
            fee: Number(t.fee || 0),
            currency: String(t.currency || "USD"),
            type: t.type || "trades",
          }))
          .filter((t) => t.ticker && t.date);

        normalised.sort((a, b) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0
        );

        const positions = buildPositionsFIFO(normalised);

        // Cash holdings: sum deposits/withdrawals by currency
        const cashNormalised = (Array.isArray(cash) ? cash : []).map((c) => ({
          date: String(c.date || ""),
          currency: String(c.currency || "AUD"),
          entryType: String(c.entryType || "deposit"),
          amount: Number(c.amount || 0),
        }));

        setRows(positions);
        setCashRows(summariseCash(cashNormalised));

        // Fetch live prices (US stocks) via your serverless /api/prices endpoint
        // Only fetch for unique tickers
        const symbols = Array.from(new Set(positions.map((p) => p.ticker))).filter(
          Boolean
        );

        if (symbols.length) {
          try {
            const rPrices = await fetch(
              `/api/prices?symbols=${encodeURIComponent(symbols.join(","))}`
            );
            if (!rPrices.ok) throw new Error(`Prices failed: ${rPrices.status}`);
            const pmap = await safeJson(rPrices);
            setPrices(pmap && typeof pmap === "object" ? pmap : {});
          } catch (e) {
            console.warn("Live prices unavailable, using fallback:", e);
            setPrices({});
          }
        }
      } catch (e) {
        console.error("Positions fetch failed:", e);
        setRows([]);
        setCashRows([]);
        setPrices({});
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const rowsWithDisplay = useMemo(() => {
    return rows.map((p) => {
      // live market price (if available)
      const live = prices?.[p.ticker]?.price;
      const livePrice =
        Number.isFinite(Number(live)) && Number(live) > 0 ? Number(live) : null;

      // choose market price:
      const marketPrice =
        livePrice != null ? livePrice : useLastTradeAsMarketPrice ? p.marketPrice : null;

      const marketValue =
        marketPrice != null ? Number(p.quantity || 0) * Number(marketPrice) : null;

      const unrealised =
        marketValue != null ? marketValue - Number(p.costBasis || 0) : null;

      // MARKET option: show values in the trade's currency
      const targetCcy = displayCurrency === "MARKET" ? p.currency : displayCurrency;

      const mvDisplay =
        marketValue == null ? null : toBase(marketValue, p.currency, targetCcy);

      const cbDisplay = toBase(p.costBasis, p.currency, targetCcy);

      const upnlDisplay =
        unrealised == null ? null : toBase(unrealised, p.currency, targetCcy);

      const avgPriceDisplay =
        p.avgPrice == null ? null : toBase(p.avgPrice, p.currency, targetCcy);

      return {
        ...p,
        marketPrice,
        marketValue,
        unrealised,
        targetCcy,
        mvDisplay,
        cbDisplay,
        upnlDisplay,
        avgPriceDisplay,
        hasLivePrice: livePrice != null,
      };
    });
  }, [rows, displayCurrency, prices]);

  const plHeaderCcyLabel =
    displayCurrency === "MARKET" ? "Market" : displayCurrency;

  return (
    <div className="positions-page">
      <div className="positions-header">
        <h2 className="positions-title">Positions</h2>

        <div className="positions-controls">
          <label className="currency-pill">
            P/L currency:&nbsp;
            <select
              value={displayCurrency}
              onChange={(e) => setDisplayCurrency(e.target.value)}
            >
              <option value="MARKET">Market currency</option>
              {Object.keys(EXCHANGE_RATES).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="positions-card">
        <div className="positions-table-wrap">
          <table className="positions-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th className="num">Position</th>
                <th className="num">Market Value</th>
                <th className="num">Avg. Price</th>
                <th className="num">Cost Basis</th>
                <th className="num">Unrealised P&amp;L ({plHeaderCcyLabel})</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="positions-empty">
                    Loading…
                  </td>
                </tr>
              ) : rowsWithDisplay.length === 0 ? (
                <tr>
                  <td colSpan={6} className="positions-empty">
                    No positions yet.
                  </td>
                </tr>
              ) : (
                rowsWithDisplay.map((p) => {
                  const pnl = p.upnlDisplay;
                  const pnlClass =
                    pnl == null ? "" : pnl > 0 ? "pos" : pnl < 0 ? "neg" : "";

                  return (
                    <tr key={`${p.ticker}_${p.currency}_${p.type}`}>
                      <td>
                        <div className="instrument">
                          <span className="instrument-ticker">{p.ticker}</span>
                          <span className="instrument-meta">
                            {p.type.toUpperCase()} · {p.currency}
                            {p.hasLivePrice ? " · LIVE" : useLastTradeAsMarketPrice ? " · LAST" : ""}
                          </span>
                        </div>
                      </td>

                      <td className="num">{fmtNum(p.quantity, 6)}</td>

                      <td className="num">
                        {p.mvDisplay == null ? "—" : fmtMoney(p.mvDisplay, p.targetCcy)}
                      </td>

                      <td className="num">
                        {p.avgPriceDisplay == null ? "—" : fmtMoney(p.avgPriceDisplay, p.targetCcy)}
                      </td>

                      <td className="num">{fmtMoney(p.cbDisplay, p.targetCcy)}</td>

                      <td className={`num ${pnlClass}`}>
                        {pnl == null ? "—" : fmtMoney(pnl, p.targetCcy)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="positions-note">
          Market price uses{" "}
          {Object.keys(prices || {}).length ? "live quotes (when available)" : "no live quotes yet"}.
          If a quote can’t be found, it falls back to{" "}
          {useLastTradeAsMarketPrice ? "last trade price" : "—"}.
        </p>
      </div>

      <div className="cash-card">
        <h3 className="cash-title">Cash holdings</h3>

        <div className="positions-table-wrap">
          <table className="positions-table cash-table">
            <thead>
              <tr>
                <th>Currency</th>
                <th className="num">Balance</th>
                <th className="num">Balance ({plHeaderCcyLabel})</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="positions-empty">
                    Loading…
                  </td>
                </tr>
              ) : cashRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="positions-empty">
                    No cash entries yet.
                  </td>
                </tr>
              ) : (
                cashRows.map((c) => {
                  const targetCcy =
                    displayCurrency === "MARKET" ? c.currency : displayCurrency;

                  return (
                    <tr key={c.currency}>
                      <td>{c.currency}</td>
                      <td className="num">{fmtMoney(c.balance, c.currency)}</td>
                      <td className="num">
                        {fmtMoney(toBase(c.balance, c.currency, targetCcy), targetCcy)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Build open positions using average cost method.
 * - Quantity can be negative (short). We'll still compute avg price + cost basis.
 * - Cost basis is tracked as total cost of the open position.
 * - Market price falls back to last trade price (easy upgrade later).
 */
function buildPositionsFIFO(trades) {
  // key: ticker|currency|type
  const map = new Map();

  const getKey = (t) => `${t.ticker}|${t.currency}|${t.type}`;

  // Sort oldest -> newest (FIFO needs this)
  const sorted = [...trades].sort((a, b) => {
    const at = a.ts || a.date || "";
    const bt = b.ts || b.date || "";
    return at < bt ? -1 : at > bt ? 1 : 0;
  });

  for (const t of sorted) {
    const key = getKey(t);

    if (!map.has(key)) {
      map.set(key, {
        ticker: t.ticker,
        currency: t.currency,
        type: t.type,
        lotsLong: [],  // [{qty, px}]
        lotsShort: [], // [{qty, px}] qty is positive “shares short”
        marketPrice: null,
        lastTs: "",
      });
    }

    const p = map.get(key);

    // last trade price as placeholder “market”
    if (useLastTradeAsMarketPrice && Number.isFinite(t.price)) {
      p.marketPrice = t.price;
      p.lastTs = t.ts || t.date || "";
    }

    let q = Number(t.quantity || 0);
    const px = Number(t.price || 0);
    const fee = Number(t.fee || 0);

    if (!q || !Number.isFinite(px)) continue;

    // Helper: allocate fee per share for the trade being applied (simple + fair enough)
    // This keeps FIFO stable and avoids fees “exploding” the avg cost.
    const feePerShare = Math.abs(q) > 0 ? fee / Math.abs(q) : 0;

    // BUY (q > 0)
    if (q > 0) {
      // If currently short, buys should cover shorts FIFO first
      while (q > 0 && p.lotsShort.length > 0) {
        const lot = p.lotsShort[0];
        const cover = Math.min(q, lot.qty);

        lot.qty -= cover;
        q -= cover;

        if (lot.qty <= 1e-12) p.lotsShort.shift();
      }

      // Any remaining buy becomes a new long lot
      if (q > 0) {
        p.lotsLong.push({ qty: q, px: px + feePerShare }); // bake fee into lot cost
      }

      continue;
    }

    // SELL (q < 0)
    if (q < 0) {
      let sellQty = Math.abs(q);

      // If currently long, sells consume long lots FIFO first
      while (sellQty > 0 && p.lotsLong.length > 0) {
        const lot = p.lotsLong[0];
        const take = Math.min(sellQty, lot.qty);

        lot.qty -= take;
        sellQty -= take;

        if (lot.qty <= 1e-12) p.lotsLong.shift();
      }

      // Any remaining sell becomes / adds to a short lot
      if (sellQty > 0) {
        p.lotsShort.push({ qty: sellQty, px: px - feePerShare }); 
        // note: fee on sell reduces proceeds; for “cost view” this convention is OK.
      }

      continue;
    }
  }

  // Convert lots into position rows
  const out = [];

  for (const p of map.values()) {
    const longQty = p.lotsLong.reduce((a, l) => a + l.qty, 0);
    const shortQty = p.lotsShort.reduce((a, l) => a + l.qty, 0);
    const netQty = longQty - shortQty;

    if (Math.abs(netQty) <= 1e-12) continue;

    // Cost basis: long lots add cost, short lots subtract cost (so avgPrice still works)
    const longCost = p.lotsLong.reduce((a, l) => a + l.qty * l.px, 0);
    const shortCost = p.lotsShort.reduce((a, l) => a + l.qty * l.px, 0);

    const costBasis = longCost - shortCost;
    const avgPrice = netQty !== 0 ? costBasis / netQty : null;

    out.push({
      ticker: p.ticker,
      currency: p.currency,
      type: p.type,
      quantity: netQty,
      costBasis,
      avgPrice,
      marketPrice: p.marketPrice,
      lastDate: p.lastTs,
    });
  }

  // Sort by size (rough)
  out.sort((a, b) => Math.abs((b.marketPrice || 0) * b.quantity) - Math.abs((a.marketPrice || 0) * a.quantity));

  return out;
}


function summariseCash(cashRows) {
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
