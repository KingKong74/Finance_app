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

function safeUpper(x) {
  return String(x || "").trim().toUpperCase();
}

function keyForCashReportRow(r) {
  const asOf = String(r?.asOf || "");
  const date = String(r?.date || "");
  const ts = String(r?.ts || "");
  return asOf || date || (ts ? ts.slice(0, 10) : "");
}

/**
 * Compute open USD lots from AUD.USD conversions (FIFO) and unrealised P/L in AUD.
 *
 * Assumptions (matches your imports):
 * - ticker = "AUD.USD"
 * - quantity = AUD amount (signed). Negative = SELL AUD (receive USD).
 * - price = USD per 1 AUD.
 * - proceeds = USD cashflow (buy AUD => negative, sell AUD => positive)
 * - fee is stored positive, feeCurrency default AUD unless provided.
 */
function computeFxUsdLotsAndUpnlAud(forexTrades, fxRates, broker = "IBKR") {
  const r = fxRates || { AUD: 1 };
  const bKey = safeUpper(broker);

  const trades = (Array.isArray(forexTrades) ? forexTrades : [])
    .filter((t) => safeUpper(t.type) === "FOREX")
    .filter((t) => safeUpper(t.ticker) === "AUD.USD")
    .filter((t) => safeUpper(t.broker) === bKey)
    .map((t) => {
      const qtyAud = num(t.quantity);
      const price = num(t.price);

      // If proceeds missing, derive from qty*price
      // buy AUD (qty>0) => proceeds negative
      // sell AUD (qty<0) => proceeds positive
      const proceedsUsd =
        t.proceeds != null ? num(t.proceeds) : -(qtyAud * price);

      const fee = Math.abs(num(t.fee));
      const feeCurrency = safeUpper(t.feeCurrency || "AUD");

      const ts = String(t.ts || "");
      const date = String(t.date || "");
      const sortKey = ts || (date ? `${date}T00:00:00` : "");

      return { qtyAud, proceedsUsd, fee, feeCurrency, sortKey };
    })
    .filter((t) => t.sortKey);

  trades.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

  const lots = []; // [{ usd, costAud }]

  const feeToAud = (fee, feeCurrency) => {
    if (!fee) return 0;
    if (feeCurrency === "AUD") return fee;
    return toBase(fee, feeCurrency, "AUD", r);
  };

  for (const t of trades) {
    const feeAud = feeToAud(t.fee, t.feeCurrency);

    if (t.qtyAud < 0) {
      // SELL AUD, receive USD => BUY USD lot
      const usdBought = Math.max(0, t.proceedsUsd);
      const audCost = Math.abs(t.qtyAud) + feeAud;

      if (usdBought > 0) lots.push({ usd: usdBought, costAud: audCost });
      continue;
    }

    if (t.qtyAud > 0) {
      // BUY AUD, spend USD => SELL USD lots FIFO
      const usdSpent = Math.max(0, -t.proceedsUsd);
      let remaining = usdSpent;

      while (remaining > 1e-12 && lots.length) {
        const lot = lots[0];
        const take = Math.min(remaining, lot.usd);

        const usdBefore = lot.usd;
        lot.usd -= take;

        const ratio = take / (usdBefore || 1);
        lot.costAud -= lot.costAud * ratio;

        remaining -= take;

        if (lot.usd <= 1e-12) lots.shift();
      }

      // allocate fee to remaining open position (best-effort)
      if (feeAud > 0 && lots.length) lots[0].costAud += feeAud;
    }
  }

  const usdOpen = lots.reduce((a, l) => a + l.usd, 0);
  const costAudOpen = lots.reduce((a, l) => a + l.costAud, 0);

  // Current value of open USD in AUD
  const valueAudOpen = toBase(usdOpen, "USD", "AUD", r);
  const upnlAud = valueAudOpen - costAudOpen;

  return {
    broker: bKey,
    ticker: "AUD.USD",
    usdOpen,
    costAudOpen,
    valueAudOpen,
    upnlAud,
  };
}

export default function Positions() {
  const [rows, setRows] = useState([]);
  const [cashRows, setCashRows] = useState([]); // [{ currency, balance }]
  const [fxRates, setFxRates] = useState({ AUD: 1 });
  const [displayCurrency, setDisplayCurrency] = useState("MARKET");
  const [loading, setLoading] = useState(true);

  const [fxPos, setFxPos] = useState(null); // fx position row for AUD.USD

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);

        // FX (AUD base)
        const rFx = await fetch("/api/fx?base=AUD&ttl=21600");
        const fxJson = rFx.ok ? await safeJson(rFx) : null;
        const rates =
          fxJson?.rates && typeof fxJson.rates === "object"
            ? { ...fxJson.rates, AUD: 1 }
            : { AUD: 1 };
        setFxRates(rates);

        // Pull trades + crypto (positions)
        const [rTrades, rCrypto] = await Promise.all([
          fetch("/api/ledger?tab=trades"),
          fetch("/api/ledger?tab=crypto"),
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

        const positions = buildPositionsFIFO(normalised, { useLastTradeAsMarketPrice });

        // Live price map (with DB cache fallback)
        const symbols = Array.from(
          new Set(positions.map((p) => String(p.ticker || "").toUpperCase()))
        ).filter(Boolean);

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

        // -----------------------------
        // CASH holdings from Cash Report (latest snapshot for IBKR)
        // -----------------------------
        const rCashReports = await fetch("/api/ledger?tab=cash_report");
        const allSnaps = rCashReports.ok ? await safeJson(rCashReports) : [];

        // pick latest for broker=IBKR
        const broker = "IBKR";
        let latest = null;
        (Array.isArray(allSnaps) ? allSnaps : [])
          .filter((s) => safeUpper(s?.broker) === broker)
          .forEach((s) => {
            const k = keyForCashReportRow(s);
            const prevK = latest ? keyForCashReportRow(latest) : "";
            if (!latest || (k && k > prevK)) latest = s;
          });

        const balancesRaw =
          latest?.balances && typeof latest.balances === "object" ? latest.balances : {};

        // ✅ hide balances <= 0
        const list = ["AUD", "USD", "EUR"]
          .map((ccy) => ({
            currency: ccy,
            balance: num(balancesRaw?.[ccy] || 0),
          }))
          .filter((x) => x.balance > 0);

        setCashRows(list);

        // -----------------------------
        // FX position (AUD.USD) from forex trades
        // -----------------------------
        const rForex = await fetch("/api/ledger?tab=forex");
        const forex = rForex.ok ? await safeJson(rForex) : [];

        const fxRow = computeFxUsdLotsAndUpnlAud(forex, rates, broker);

        // If basically zero, hide it
        const show =
          Math.abs(num(fxRow.usdOpen)) > 1e-6 || Math.abs(num(fxRow.upnlAud)) > 0.01;

        setFxPos(show ? fxRow : null);
      } catch (e) {
        console.error("Positions fetch failed:", e);
        setRows([]);
        setCashRows([]);
        setFxRates({ AUD: 1 });
        setFxPos(null);
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

  const fxPosDisplay = useMemo(() => {
    if (!fxPos) return null;

    // For FX row: MARKET => show values in AUD (since it’s inherently “cash FX” vs base)
    const target = displayCurrency === "MARKET" ? "AUD" : displayCurrency;

    const cost = toBase(num(fxPos.costAudOpen), "AUD", target, fxRates);
    const value = toBase(num(fxPos.valueAudOpen), "AUD", target, fxRates);
    const upnl = toBase(num(fxPos.upnlAud), "AUD", target, fxRates);

    return {
      ...fxPos,
      displayCcy: target,
      costDisplay: cost,
      valueDisplay: value,
      upnlDisplay: upnl,
    };
  }, [fxPos, displayCurrency, fxRates]);

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
                  <td colSpan={displayCurrency !== "MARKET" ? 3 : 2} className="positions-empty">
                    Loading…
                  </td>
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

        {/* FX position section */}
        <div style={{ marginTop: 14 }}>
          <h3 className="cash-title" style={{ marginTop: 0 }}>
            FX position (AUD.USD)
          </h3>

          <div className="positions-table-wrap">
            <table className="positions-table cash-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th className="num">Open USD</th>
                  <th className="num">Cost</th>
                  <th className="num">Value</th>
                  <th className="num">Unrealised P&amp;L</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="positions-empty">
                      Loading…
                    </td>
                  </tr>
                ) : !fxPosDisplay ? (
                  <tr>
                    <td colSpan={5} className="positions-empty">
                      No open AUD.USD FX position.
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td>{fxPosDisplay.ticker}</td>
                    <td className="num">{fmtMoney(fxPosDisplay.usdOpen, "USD")}</td>
                    <td className="num">{fmtMoney(fxPosDisplay.costDisplay, fxPosDisplay.displayCcy)}</td>
                    <td className="num">{fmtMoney(fxPosDisplay.valueDisplay, fxPosDisplay.displayCcy)}</td>
                    <td
                      className={`num ${
                        fxPosDisplay.upnlDisplay > 0
                          ? "pos"
                          : fxPosDisplay.upnlDisplay < 0
                          ? "neg"
                          : ""
                      }`}
                    >
                      {fmtMoney(fxPosDisplay.upnlDisplay, fxPosDisplay.displayCcy)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="positions-note">
            FX position is derived from your AUD.USD forex trades (FIFO). “MARKET” shows FX P/L in AUD.
          </p>
        </div>

        <p className="positions-note">Cash balances are sourced from IBKR Cash Report “Ending Cash”.</p>
      </div>
    </div>
  );
}
