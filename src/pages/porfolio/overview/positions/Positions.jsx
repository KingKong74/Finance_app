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

        const positions = buildPositions(normalised);

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
function buildPositions(trades) {
  // key: ticker|currency|type
  const map = new Map();

  for (const t of trades) {
    const key = `${t.ticker}|${t.currency}|${t.type}`;
    if (!map.has(key)) {
      map.set(key, {
        ticker: t.ticker,
        currency: t.currency,
        type: t.type,
        quantity: 0,
        costBasis: 0, // in trade currency
        avgPrice: null,
        marketPrice: null,
        lastDate: "",
      });
    }

    const p = map.get(key);

    // Update placeholder market price (last trade)
    if (useLastTradeAsMarketPrice) {
      p.marketPrice = t.price;
      p.lastDate = t.date;
    }

    const q = Number(t.quantity || 0);
    const px = Number(t.price || 0);
    const fee = Number(t.fee || 0);

    // Buy (q > 0): cost increases by (q*px + fee)
    if (q > 0) {
      const newQty = p.quantity + q;
      const newCost = p.costBasis + q * px + fee;

      p.quantity = newQty;
      p.costBasis = newCost;
      p.avgPrice = newQty !== 0 ? newCost / newQty : null;
      continue;
    }

    // Sell (q < 0): reduce qty; reduce cost basis by avgCost * abs(q)
    if (q < 0) {
      const sellQty = Math.abs(q);

      // If no position yet (or weird crossing), use current avg if possible, else trade price
      const currentAvg = p.quantity !== 0 ? p.costBasis / p.quantity : px;

      const newQty = p.quantity - sellQty;
      const reduceCost = currentAvg * sellQty;

      // Fee on sell: treat as extra cost (reduces proceeds), so add fee to cost basis
      const newCost = p.costBasis - reduceCost + fee;

      p.quantity = newQty;
      p.costBasis = newCost;
      p.avgPrice = newQty !== 0 ? newCost / newQty : null;
      continue;
    }
  }

  // Keep only non-zero positions
  const out = Array.from(map.values()).filter((p) => Math.abs(p.quantity) > 1e-12);

  // Sort: biggest market value first (fallback: cost basis)
  out.sort((a, b) => {
    const amv = a.marketPrice != null ? a.marketPrice * a.quantity : a.costBasis;
    const bmv = b.marketPrice != null ? b.marketPrice * b.quantity : b.costBasis;
    return Math.abs(bmv) - Math.abs(amv);
  });

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
