// src/pages/portfolio/overview/positions/Positions.jsx
import React, { useEffect, useMemo, useState } from "react";
import "../../../../css/positionsTab.css";

import { fmtMoney, fmtNum, toBase } from "./utils/money";
import { priceBadgeLabel, safeJson } from "./utils/priceMeta";
import { buildPositionsFIFO } from "./utils/positionsMath";

const useLastTradeAsMarketPrice = true;
const DISPLAY_OPTIONS_FIXED = ["MARKET", "AUD", "USD", "EUR"];

function num(x) {
  if (typeof x === "string") x = x.replace(/,/g, "");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export default function Positions() {
  const [rows, setRows] = useState([]);
  const [cashRows, setCashRows] = useState([]); // [{ currency, balance }]
  const [fxRates, setFxRates] = useState({ AUD: 1 });
  const [displayCurrency, setDisplayCurrency] = useState("MARKET");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);

        // FX (AUD base)
        const rFx = await fetch("/api?action=fx&base=AUD&ttl=21600");
        const fxJson = rFx.ok ? await safeJson(rFx) : null;
        const rates =
          fxJson?.rates && typeof fxJson.rates === "object"
            ? { ...fxJson.rates, AUD: 1 }
            : { AUD: 1 };
        setFxRates(rates);

        // Pull trades + crypto (positions)
        const [rTrades, rCrypto] = await Promise.all([
          fetch("/api?action=ledger&tab=trades"),
          fetch("/api?action=ledger&tab=crypto"),
        ]);

        const [trades, crypto] = await Promise.all([
          rTrades.ok ? safeJson(rTrades) : [],
          rCrypto.ok ? safeJson(rCrypto) : [],
        ]);

        const allTrades = [
          ...(Array.isArray(trades) ? trades : []),
          ...(Array.isArray(crypto) ? crypto : []),
        ];

        const normalised = allTrades
          .map((t) => ({
            broker: String(t.broker || "").trim() || "Unknown",
            ticker: String(t.ticker || "").toUpperCase(),
            date: String(t.date || ""),
            quantity: Number(t.quantity || 0),
            price: Number(t.price || 0),
            fee: Number(t.fee || 0),
            currency: String(t.currency || "USD").toUpperCase(),
            type: t.type || "trades",
          }))
          .filter((t) => t.ticker && t.date && String(t.type || "").toUpperCase() !== "FOREX");

        normalised.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

        const positions = buildPositionsFIFO(normalised, {
          useLastTradeAsMarketPrice,
        });

        const symbols = Array.from(new Set(positions.map((p) => String(p.ticker || "").toUpperCase()))).filter(Boolean);

        let priceMap = {};
        if (symbols.length > 0) {
          const rPrices = await fetch(`/api?action=prices&symbols=${symbols.join(",")}&ttl=60`);
          const data = rPrices.ok ? await safeJson(rPrices) : null;
          priceMap = data && typeof data === "object" ? data : {};
        }

        const mergedPositions = positions.map((p) => {
          const info = priceMap?.[p.ticker];

          if (info && info.price != null) {
            return {
              ...p,
              marketPrice: Number(info.price),
              marketAsOf: info.asOf || null,
              marketSource: info.source || "cache",
            };
          }

          return {
            ...p,
            marketAsOf: null,
            marketSource: useLastTradeAsMarketPrice ? "last-trade" : "none",
          };
        });

        setRows(mergedPositions);

        // CASH holdings from Cash Report (IBKR)
        const rCash = await fetch("/api?action=overview/cash-report&broker=IBKR");
        const cashJson = rCash.ok ? await safeJson(rCash) : null;

        const balancesRaw =
          cashJson?.balances && typeof cashJson.balances === "object"
            ? cashJson.balances
            : {};

        const list = ["AUD", "USD", "EUR"]
          .map((ccy) => ({ currency: ccy, balance: num(balancesRaw?.[ccy] || 0) }))
          .filter((x) => x.balance > 0); // ✅ hide <= 0

        setCashRows(list);
      } catch (e) {
        console.error("Positions fetch failed:", e);
        setRows([]);
        setCashRows([]);
        setFxRates({ AUD: 1 });
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const rowsWithDisplay = useMemo(() => {
    return rows.map((p) => {
      const marketValue = p.marketPrice != null ? p.quantity * p.marketPrice : null;
      const unrealised = marketValue != null ? marketValue - p.costBasis : null;

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

      const mvDisplay =
        marketValue == null ? null : toBase(marketValue, p.currency, displayCurrency, fxRates);

      const cbDisplay = toBase(p.costBasis, p.currency, displayCurrency, fxRates);

      const upnlDisplay =
        unrealised == null ? null : toBase(unrealised, p.currency, displayCurrency, fxRates);

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
  }, [rows, displayCurrency, fxRates]);

  return (
    <div className="positions-page">
      <div className="positions-header">
        <h2 className="positions-title">Positions</h2>

        <div className="positions-controls">
          <label className="currency-pill">
            P/L currency:&nbsp;
            <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)}>
              {DISPLAY_OPTIONS_FIXED.map((c) => (
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
                  Unrealised P&amp;L ({displayCurrency === "MARKET" ? "Market" : displayCurrency})
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="positions-empty">Loading…</td>
                </tr>
              ) : rowsWithDisplay.length === 0 ? (
                <tr>
                  <td colSpan={6} className="positions-empty">No positions yet.</td>
                </tr>
              ) : (
                rowsWithDisplay.map((p) => {
                  const pnl = p.upnlDisplay;
                  const pnlClass = pnl == null ? "" : pnl > 0 ? "pos" : pnl < 0 ? "neg" : "";
                  const badge = priceBadgeLabel(p.marketSource, p.marketAsOf);

                  return (
                    <tr key={`${p.broker}_${p.ticker}_${p.currency}_${p.type}`}>
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
                      <td className="num">{p.mvDisplay == null ? "—" : fmtMoney(p.mvDisplay, p.displayCcy)}</td>
                      <td className="num">
                        {p.avgPrice == null
                          ? "—"
                          : fmtMoney(
                              displayCurrency === "MARKET"
                                ? p.avgPrice
                                : toBase(p.avgPrice, p.currency, displayCurrency, fxRates),
                              p.displayCcy
                            )}
                      </td>
                      <td className="num">{fmtMoney(p.cbDisplay, p.displayCcy)}</td>
                      <td className={`num ${pnlClass}`}>{pnl == null ? "—" : fmtMoney(pnl, p.displayCcy)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="positions-note">
          Prices try LIVE first, then fall back to your cached DB price, then (if needed) last trade price.
        </p>
      </div>

      <div className="cash-card">
        <h3 className="cash-title">Cash holdings (Cash Report)</h3>

        <div className="positions-table-wrap">
          <table className="positions-table cash-table">
            <thead>
              <tr>
                <th>Currency</th>
                <th className="num">Balance</th>
                {displayCurrency !== "MARKET" && <th className="num">Balance ({displayCurrency})</th>}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={displayCurrency !== "MARKET" ? 3 : 2} className="positions-empty">Loading…</td>
                </tr>
              ) : cashRows.length === 0 ? (
                <tr>
                  <td colSpan={displayCurrency !== "MARKET" ? 3 : 2} className="positions-empty">
                    No positive cash balances.
                  </td>
                </tr>
              ) : (
                cashRows.map((c) => (
                  <tr key={c.currency}>
                    <td>{c.currency}</td>
                    <td className="num">{fmtMoney(c.balance, c.currency)}</td>
                    {displayCurrency !== "MARKET" && (
                      <td className="num">
                        {fmtMoney(toBase(c.balance, c.currency, displayCurrency, fxRates), displayCurrency)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="positions-note">Cash balances are sourced from IBKR Cash Report “Ending Cash”.</p>
      </div>
    </div>
  );
}
