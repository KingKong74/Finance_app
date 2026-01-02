// src/pages/portfolio/overview/positions/Positions.jsx
import React, { useEffect, useMemo, useState } from "react";
import "../../../../css/positionsTab.css";

import { fmtMoney, fmtNum, toBase } from "./utils/money";
import { priceBadgeLabel, safeJson } from "./utils/priceMeta";
import { buildPositionsFIFO } from "./utils/positionsMath";

const useLastTradeAsMarketPrice = true;

function safeUpper(s) {
  return String(s || "").trim().toUpperCase();
}
function num(x) {
  if (typeof x === "string") x = x.replace(/,/g, "");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function computeFxPositionAndUpnlAud(forexTrades, fxRates) {
  const r = fxRates || {};
  const lots = []; // USD lots: [{ usd, costAud }]

  const trades = (Array.isArray(forexTrades) ? forexTrades : [])
    .filter((t) => safeUpper(t.ticker) === "AUD.USD")
    .map((t) => {
      const qtyAud = num(t.quantity);
      const price = num(t.price);
      const proceedsUsd = t.proceeds != null ? num(t.proceeds) : -(qtyAud * price);
      const fee = num(t.fee);
      const feeCurrency = safeUpper(t.feeCurrency || "AUD");
      return {
        date: String(t.date || ""),
        ts: String(t.ts || ""),
        qtyAud,
        proceedsUsd,
        fee,
        feeCurrency,
      };
    })
    .filter((t) => t.date);

  trades.sort((a, b) => {
    const ka = a.ts || `${a.date}T00:00:00`;
    const kb = b.ts || `${b.date}T00:00:00`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  for (const t of trades) {
    const feeAud =
      t.feeCurrency === "AUD" ? t.fee : toBase(t.fee, t.feeCurrency, "AUD", r);

    if (t.qtyAud < 0) {
      // sell AUD => receive USD => buy USD lot
      const usdBought = Math.max(0, t.proceedsUsd);
      const audCost = Math.abs(t.qtyAud) + feeAud;
      if (usdBought > 0) lots.push({ usd: usdBought, costAud: audCost });
      continue;
    }

    if (t.qtyAud > 0) {
      // buy AUD => spend USD => sell USD lots FIFO
      const usdSpent = Math.max(0, -t.proceedsUsd);
      let remaining = usdSpent;

      while (remaining > 1e-12 && lots.length) {
        const lot = lots[0];
        const take = Math.min(remaining, lot.usd);

        const lotUsdBefore = lot.usd;
        lot.usd -= take;

        const ratio = take / (lotUsdBefore || 1);
        lot.costAud -= lot.costAud * ratio;

        remaining -= take;

        if (lot.usd <= 1e-12) lots.shift();
      }

      if (feeAud > 0 && lots.length) lots[0].costAud += feeAud;
    }
  }

  const usdOpen = lots.reduce((a, l) => a + l.usd, 0);
  const costAudOpen = lots.reduce((a, l) => a + l.costAud, 0);
  const valueAudOpen = toBase(usdOpen, "USD", "AUD", r);
  const upnlAud = valueAudOpen - costAudOpen;

  return { usdOpen, upnlAud };
}

export default function Positions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // FX + display currency
  const [fxRates, setFxRates] = useState({ AUD: 1 });
  const [displayCurrency, setDisplayCurrency] = useState("MARKET"); // MARKET | AUD | USD | EUR

  // Derived cash + FX position
  const [cashByCcy, setCashByCcy] = useState({});
  const [fxPos, setFxPos] = useState({ usdOpen: 0, upnlAud: 0 });

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);

        // FX rates first
        const rFx = await fetch("/api/fx?base=AUD&ttl=21600");
        const fxJson = rFx.ok ? await safeJson(rFx) : null;
        const rates =
          fxJson?.rates && typeof fxJson.rates === "object"
            ? { ...fxJson.rates, AUD: 1 }
            : { AUD: 1 };
        setFxRates(rates);

        // Pull trades + crypto + forex + cash (+ dividends optional later)
        const [rTrades, rCrypto, rForex, rCash] = await Promise.all([
          fetch("/api/ledger?tab=trades"),
          fetch("/api/ledger?tab=crypto"),
          fetch("/api/ledger?tab=forex"),
          fetch("/api/ledger?tab=cash"),
        ]);

        const [trades, crypto, forex, cash] = await Promise.all([
          rTrades.ok ? safeJson(rTrades) : [],
          rCrypto.ok ? safeJson(rCrypto) : [],
          rForex.ok ? safeJson(rForex) : [],
          rCash.ok ? safeJson(rCash) : [],
        ]);

        // ---- POSITIONS ----
        const allTrades = [
          ...(Array.isArray(trades) ? trades : []),
          ...(Array.isArray(crypto) ? crypto : []),
        ];

        const normalised = allTrades
          .map((t) => ({
            broker: String(t.broker || "").trim() || "Unknown",
            ticker: safeUpper(t.ticker),
            date: String(t.date || ""),
            quantity: num(t.quantity),
            price: num(t.price),
            fee: num(t.fee),
            currency: safeUpper(t.currency || "USD"),
            type: t.type || "trades",
          }))
          .filter((t) => t.ticker && t.date);

        normalised.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

        const positions = buildPositionsFIFO(normalised, { useLastTradeAsMarketPrice });

        // Prices
        const symbols = Array.from(new Set(positions.map((p) => safeUpper(p.ticker)))).filter(Boolean);
        let priceMap = {};
        if (symbols.length > 0) {
          const rPrices = await fetch(`/api/prices?symbols=${symbols.join(",")}&ttl=60`);
          const data = rPrices.ok ? await safeJson(rPrices) : null;
          priceMap = data && typeof data === "object" ? data : {};
        }

        const mergedPositions = positions.map((p) => {
          const info = priceMap?.[p.ticker];
          if (info && info.price != null) {
            return {
              ...p,
              marketPrice: num(info.price),
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

        // ---- DERIVED CASH (flows) ----
        const basket = {};

        const add = (ccy, delta) => {
          const C = safeUpper(ccy || "AUD");
          basket[C] = num(basket[C]) + num(delta);
        };

        // cash entries
        (Array.isArray(cash) ? cash : []).forEach((c) => {
          add(c.currency, num(c.amount));
        });

        // trades/crypto proceeds + fees
        const applyTrade = (t) => {
          const proceeds =
            t.proceeds != null ? num(t.proceeds) : -(num(t.quantity) * num(t.price));
          add(t.currency || "USD", proceeds);

          const fee = num(t.fee);
          if (fee) add(t.feeCurrency || "AUD", -fee);
        };

        (Array.isArray(trades) ? trades : []).forEach(applyTrade);
        (Array.isArray(crypto) ? crypto : []).forEach(applyTrade);

        // forex legs
        (Array.isArray(forex) ? forex : []).forEach((t) => {
          const proceedsUsd =
            t.proceeds != null ? num(t.proceeds) : -(num(t.quantity) * num(t.price));
          add("USD", proceedsUsd);
          add("AUD", num(t.quantity));

          const fee = num(t.fee);
          if (fee) add(t.feeCurrency || "AUD", -fee);
        });

        setCashByCcy(basket);

        // ---- FX position (AUD.USD) ----
        const fx = computeFxPositionAndUpnlAud(forex, rates);
        setFxPos(fx);

        setRows(mergedPositions);
      } catch (e) {
        console.error("Positions fetch failed:", e);
        setRows([]);
        setCashByCcy({});
        setFxPos({ usdOpen: 0, upnlAud: 0 });
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const allowedDisplay = ["MARKET", "AUD", "USD", "EUR"];

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

  // Cash rows for table
  const cashRows = useMemo(() => {
    const entries = Object.entries(cashByCcy || {}).map(([currency, balance]) => ({
      currency,
      balance: num(balance),
    }));
    entries.sort((a, b) => a.currency.localeCompare(b.currency));
    return entries;
  }, [cashByCcy]);

  return (
    <div className="positions-page">
      {/* Header with dropdown (back again) */}
      <div className="positions-header">
        <h2 className="positions-title">Positions</h2>

        <div className="positions-controls">
          <label className="currency-pill">
            P/L currency:&nbsp;
            <select
              value={displayCurrency}
              onChange={(e) => setDisplayCurrency(e.target.value)}
            >
              {allowedDisplay.map((c) => (
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

                      <td className="num">
                        {p.mvDisplay == null ? "—" : fmtMoney(p.mvDisplay, p.displayCcy)}
                      </td>

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
          Prices try LIVE first, then fall back to your cached DB price, then (if needed) last trade price.
        </p>
      </div>

      {/* Cash + FX exposure */}
      <div className="cash-card">
        <h3 className="cash-title">Cash holdings (derived)</h3>

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
                  <td colSpan={displayCurrency !== "MARKET" ? 3 : 2} className="positions-empty">
                    Loading…
                  </td>
                </tr>
              ) : cashRows.length === 0 ? (
                <tr>
                  <td colSpan={displayCurrency !== "MARKET" ? 3 : 2} className="positions-empty">
                    No cash yet.
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

        {/* FX row like a “position” */}
        {!loading && (
          <div style={{ marginTop: 14 }}>
            <h4 style={{ margin: "10px 0 6px" }}>FX exposure</h4>

            <div className="positions-table-wrap">
              <table className="positions-table cash-table">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th className="num">USD open</th>
                    <th className="num">Unrealised (AUD)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>AUD.USD</td>
                    <td className="num">{fmtNum(fxPos.usdOpen, 2)}</td>
                    <td className={`num ${fxPos.upnlAud > 0 ? "pos" : fxPos.upnlAud < 0 ? "neg" : ""}`}>
                      {fmtMoney(fxPos.upnlAud, "AUD")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="positions-note" style={{ marginTop: 6 }}>
              FX unrealised is calculated from your AUD.USD conversion trades (USD lots FIFO), valued using current AUD→USD rate.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
