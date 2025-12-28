import React, { useEffect, useMemo, useState } from "react";
import "../../../../css/positionsTab.css";

import { DISPLAY_OPTIONS, fmtMoney, fmtNum, toBase } from "./utils/money";
import { priceBadgeLabel, safeJson } from "./utils/priceMeta";
import { buildPositionsFIFO, summariseCash } from "./utils/positionsMath";

// If live price fails + cache missing, we can still fall back to last trade price:
const useLastTradeAsMarketPrice = true;

export default function Positions() {
  const [rows, setRows] = useState([]);
  const [cashRows, setCashRows] = useState([]);
  const [displayCurrency, setDisplayCurrency] = useState("MARKET"); // "AUD" | "USD" | "EUR" | "MARKET"
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
          rTrades.ok ? safeJson(rTrades) : [],
          rCrypto.ok ? safeJson(rCrypto) : [],
          rCash.ok ? safeJson(rCash) : [],
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

        // Build FIFO open positions (marketPrice initially = last trade price placeholder)
        const positions = buildPositionsFIFO(normalised, {
          useLastTradeAsMarketPrice,
        });

        // ---- Live price with DB cache fallback ----
        // We call /api/prices which is responsible for:
        // 1) live fetch
        // 2) fallback to cached DB price
        // 3) null if none
        const symbols = Array.from(
          new Set(positions.map((p) => String(p.ticker || "").toUpperCase()))
        ).filter(Boolean);

        let priceMap = {};
        if (symbols.length > 0) {
          const rPrices = await fetch(
            `/api/prices?symbols=${symbols.join(",")}&ttl=60`
          );
          const data = rPrices.ok ? await safeJson(rPrices) : null;
          priceMap = data && typeof data === "object" ? data : {};
        }

        const mergedPositions = positions.map((p) => {
          const info = priceMap?.[p.ticker];

          // If we got a price (live OR cached), prefer it
          if (info && info.price != null) {
            return {
              ...p,
              marketPrice: Number(info.price),
              marketAsOf: info.asOf || null,
              marketSource: info.source || "cache",
              // keep currency from your trades for FX conversion
              // if provider returns different currency, you can reconcile later
            };
          }

          // If nothing from /api/prices, fall back to last trade price (already set by builder)
          return {
            ...p,
            marketAsOf: null,
            marketSource: useLastTradeAsMarketPrice ? "last-trade" : "none",
          };
        });

        // Cash holdings: sum deposits/withdrawals by currency
        const cashNormalised = (Array.isArray(cash) ? cash : []).map((c) => ({
          date: String(c.date || ""),
          currency: String(c.currency || "AUD"),
          entryType: String(c.entryType || "deposit"),
          amount: Number(c.amount || 0),
        }));

        setRows(mergedPositions);
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
    return rows.map((p) => {
      const marketValue =
        p.marketPrice != null ? p.quantity * p.marketPrice : null;
      const unrealised =
        marketValue != null ? marketValue - p.costBasis : null;

      // MARKET mode: show everything in the trade currency (per-row)
      if (displayCurrency === "MARKET") {
        return {
          ...p,
          marketValue,
          unrealised,
          mvDisplay: marketValue,
          cbDisplay: p.costBasis,
          upnlDisplay: unrealised,
          displayCcy: p.currency,
        };
      }

      // Fixed currency mode: convert from trade currency -> display currency
      const mvDisplay =
        marketValue == null
          ? null
          : toBase(marketValue, p.currency, displayCurrency);
      const cbDisplay = toBase(p.costBasis, p.currency, displayCurrency);
      const upnlDisplay =
        unrealised == null
          ? null
          : toBase(unrealised, p.currency, displayCurrency);

      return {
        ...p,
        marketValue,
        unrealised,
        mvDisplay,
        cbDisplay,
        upnlDisplay,
        displayCcy: displayCurrency,
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
            <select
              value={displayCurrency}
              onChange={(e) => setDisplayCurrency(e.target.value)}
            >
              {DISPLAY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c === "MARKET" ? "Market currency" : c}
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
                  Unrealised P&amp;L (
                  {displayCurrency === "MARKET" ? "Market" : displayCurrency})
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
                  const pnlClass =
                    pnl == null ? "" : pnl > 0 ? "pos" : pnl < 0 ? "neg" : "";

                  const badge = priceBadgeLabel(p.marketSource, p.marketAsOf);

                  return (
                    <tr key={`${p.ticker}_${p.currency}_${p.type}`}>
                      <td>
                        <div className="instrument">
                          <span className="instrument-ticker">{p.ticker}</span>
                          <span className="instrument-meta">
                            {String(p.type || "").toUpperCase()} · {p.currency} ·{" "}
                            <span
                              className={`price-badge ${
                                badge.includes("LIVE")
                                  ? "live"
                                  : badge.includes("CACHED")
                                  ? "cached"
                                  : badge.includes("DELAYED")
                                  ? "delayed" 
                                  : "last"
                              }`}
                            >
                              {badge}
                            </span>
                          </span>
                        </div>
                      </td>

                      <td className="num">{fmtNum(p.quantity, 6)}</td>

                      <td className="num">
                        {p.mvDisplay == null
                          ? "—"
                          : fmtMoney(p.mvDisplay, p.displayCcy)}
                      </td>

                      <td className="num">
                        {p.avgPrice == null
                          ? "—"
                          : fmtMoney(
                              displayCurrency === "MARKET"
                                ? p.avgPrice
                                : toBase(p.avgPrice, p.currency, displayCurrency),
                              p.displayCcy
                            )}
                      </td>

                      <td className="num">{fmtMoney(p.cbDisplay, p.displayCcy)}</td>

                      <td className={`num ${pnlClass}`}>
                        {pnl == null ? "—" : fmtMoney(pnl, p.displayCcy)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="positions-note">
          Prices try LIVE first, then fall back to your cached DB price, then (if
          needed) last trade price.
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
                {displayCurrency !== "MARKET" && (
                  <th className="num">Balance ({displayCurrency})</th>
                )}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={displayCurrency !== "MARKET" ? 3 : 2}
                    className="positions-empty"
                  >
                    Loading…
                  </td>
                </tr>
              ) : cashRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={displayCurrency !== "MARKET" ? 3 : 2}
                    className="positions-empty"
                  >
                    No cash entries yet.
                  </td>
                </tr>
              ) : (
                cashRows.map((c) => (
                  <tr key={c.currency}>
                    <td>{c.currency}</td>
                    <td className="num">{fmtMoney(c.balance, c.currency)}</td>
                    {displayCurrency !== "MARKET" && (
                      <td className="num">
                        {fmtMoney(
                          toBase(c.balance, c.currency, displayCurrency),
                          displayCurrency
                        )}
                      </td>
                    )}
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
