import React, { useEffect, useMemo, useState } from "react";
import "../../../../css/positionsTab.css";

// Replace later with live FX rates (API), but fine for now:
const EXCHANGE_RATES = { AUD: 1, USD: 1.65, EUR: 1.8 };

// Optional: if you don't have market prices yet, we can:
// - show "—" for Market Value / Unrealised
// - or use last trade price as a placeholder (what I do below)
const useLastTradeAsMarketPrice = true;

const fmtMoney = (n, ccy = "AUD") => {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: 2,
  });
};

const fmtNum = (n, dp = 2) => {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, { maximumFractionDigits: dp });
};

const toBase = (value, from, to) => {
  const v = Number(value || 0);
  const rFrom = EXCHANGE_RATES[from] ?? 1;
  const rTo = EXCHANGE_RATES[to] ?? 1;
  // rates are "1 unit = rate AUD" (like your ledger)
  return (v * rFrom) / rTo;
};

export default function Positions() {
  const [rows, setRows] = useState([]);
  const [cashRows, setCashRows] = useState([]);
  const [displayCurrency, setDisplayCurrency] = useState("AUD"); // "AUD" | "USD" | "EUR" | "MARKET"
  const [loading, setLoading] = useState(true);

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

        normalised.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

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
      } catch (e) {
        console.error("Positions fetch failed:", e);
        setRows([]);
        setCashRows([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const rowsWithDisplay = useMemo(() => {
    const isMarket = displayCurrency === "MARKET";

    return rows.map((p) => {
      const marketValue = p.marketPrice != null ? p.quantity * p.marketPrice : null;
      const unrealised = marketValue != null ? marketValue - p.costBasis : null;

      // If MARKET: do not convert — display in the instrument's own currency
      const mvDisplay =
        marketValue == null ? null : isMarket ? marketValue : toBase(marketValue, p.currency, displayCurrency);

      const cbDisplay = isMarket ? p.costBasis : toBase(p.costBasis, p.currency, displayCurrency);

      const upnlDisplay =
        unrealised == null ? null : isMarket ? unrealised : toBase(unrealised, p.currency, displayCurrency);

      const avgDisplay =
        p.avgPrice == null ? null : isMarket ? p.avgPrice : toBase(p.avgPrice, p.currency, displayCurrency);

      return {
        ...p,
        marketValue,
        unrealised,
        mvDisplay,
        cbDisplay,
        upnlDisplay,
        avgDisplay,
        displayCcy: isMarket ? p.currency : displayCurrency, // per-row currency when Market
      };
    });
  }, [rows, displayCurrency]);

  return (
    <div className="positions-page">
      <div className="positions-header">
        <h2 className="positions-title">Positions</h2>

        <div className="positions-controls">
          <label className="currency-pill">
            P/L currency:&nbsp;
            <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)}>
              <option value="MARKET">Market</option>
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
                <th className="num">
                  Unrealised P&amp;L ({displayCurrency === "MARKET" ? "Market" : displayCurrency})
                </th>
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
                  const pnlClass = pnl == null ? "" : pnl > 0 ? "pos" : pnl < 0 ? "neg" : "";

                  return (
                    <tr key={`${p.ticker}_${p.currency}_${p.type}`}>
                      <td>
                        <div className="instrument">
                          <span className="instrument-ticker">{p.ticker}</span>
                          <span className="instrument-meta">
                            {p.type.toUpperCase()} · {p.currency}
                          </span>
                        </div>
                      </td>

                      <td className="num">{fmtNum(p.quantity, 6)}</td>

                      <td className="num">
                        {p.mvDisplay == null ? "—" : fmtMoney(p.mvDisplay, p.displayCcy)}
                      </td>

                      <td className="num">
                        {p.avgDisplay == null ? "—" : fmtMoney(p.avgDisplay, p.displayCcy)}
                      </td>

                      <td className="num">{fmtMoney(p.cbDisplay, p.displayCcy)}</td>

                      <td className={`num ${pnlClass}`}>
                        {p.upnlDisplay == null ? "—" : fmtMoney(p.upnlDisplay, p.displayCcy)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="positions-note">
          Market price is currently {useLastTradeAsMarketPrice ? "last trade price (placeholder)" : "not set"}.
          When you’re ready, we’ll plug live prices in and Unrealised P/L becomes “real”.
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
                <th className="num">
                  Balance ({displayCurrency === "MARKET" ? "Market" : displayCurrency})
                </th>
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
                cashRows.map((c) => (
                  <tr key={c.currency}>
                    <td>{c.currency}</td>
                    <td className="num">{fmtMoney(c.balance, c.currency)}</td>
                    <td className="num">
                      {displayCurrency === "MARKET"
                        ? "—"
                        : fmtMoney(toBase(c.balance, c.currency, displayCurrency), displayCurrency)}
                    </td>
                  </tr>
                ))
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
 * - Market price uses last trade price as placeholder (easy upgrade later).
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

    // Average-cost position tracking:
    // Buy: quantity > 0 increases position and cost basis
    // Sell: quantity < 0 reduces position and reduces cost basis proportionally
    // NOTE: IBKR sells come in as negative qty already (good)
    const q = t.quantity;
    const px = t.price;
    const fee = t.fee;

    // If buy (q > 0): cost increases by (q*px + fee)
    if (q > 0) {
      const newQty = p.quantity + q;
      const newCost = p.costBasis + q * px + fee;

      p.quantity = newQty;
      p.costBasis = newCost;
      p.avgPrice = newQty !== 0 ? newCost / newQty : null;
      continue;
    }

    // If sell (q < 0): reduce qty; reduce cost basis by avgCost * abs(q)
    if (q < 0) {
      const sellQty = Math.abs(q);

      // If we have no position (or crossing through zero), keep it simple:
      // We’ll apply avg-cost on current side, and allow going negative.
      const currentAvg = p.quantity !== 0 ? p.costBasis / p.quantity : px;

      const newQty = p.quantity - sellQty;
      const reduceCost = currentAvg * sellQty;

      // Fee on sell: treat as extra cost (reduces proceeds), so add fee to cost basis
      // (this keeps P/L consistent later when we implement realised properly)
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
