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

function safeUpper(s) {
  return String(s || "").trim().toUpperCase();
}

function keyForCashReportRow(r) {
  const asOf = String(r?.asOf || "");
  const date = String(r?.date || "");
  const ts = String(r?.ts || "");
  return asOf || date || (ts ? ts.slice(0, 10) : "");
}

// FX (AUD.USD) FIFO lots in USD, cost tracked in AUD
function computeFxUsdLotsAndUpnlAud(forexTrades, fxRates, broker) {
  const r = fxRates || { AUD: 1 };
  const bKey = safeUpper(broker);
  const lots = []; // [{ usd, costAud }]

  const trades = (Array.isArray(forexTrades) ? forexTrades : [])
    .filter((t) => safeUpper(t.type) === "FOREX")
    .filter((t) => safeUpper(t.ticker) === "AUD.USD")
    .filter((t) => safeUpper(t.broker) === bKey)
    .map((t) => {
      const qtyAud = num(t.quantity); // AUD amount (+ buy AUD, - sell AUD)
      const price = num(t.price); // USD per AUD
      const proceedsUsd =
        t.proceeds != null ? num(t.proceeds) : -(qtyAud * price); // in USD
      const fee = Math.abs(num(t.fee));
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
      // sell AUD, receive USD => BUY USD lot
      const usdBought = Math.max(0, t.proceedsUsd);
      const audCost = Math.abs(t.qtyAud) + feeAud;
      if (usdBought > 0) lots.push({ usd: usdBought, costAud: audCost });
      continue;
    }

    if (t.qtyAud > 0) {
      // buy AUD, spend USD => SELL USD lots FIFO
      const usdSpent = Math.max(0, -t.proceedsUsd);
      let remaining = usdSpent;

      while (remaining > 1e-12 && lots.length) {
        const lot = lots[0];
        const lotUsdBefore = lot.usd;
        const take = Math.min(remaining, lotUsdBefore);

        lot.usd -= take;

        // reduce cost in same proportion
        const ratio = take / (lotUsdBefore || 1);
        lot.costAud -= lot.costAud * ratio;

        remaining -= take;

        if (lot.usd <= 1e-12) lots.shift();
      }

      // fee drags remaining position a bit (approx)
      if (feeAud > 0) {
        if (lots.length) lots[0].costAud += feeAud;
        else {
          // no lots left but fee exists; keep it as negative P/L against zero position
          lots.push({ usd: 0, costAud: feeAud });
        }
      }
    }
  }

  const usdOpen = lots.reduce((a, l) => a + num(l.usd), 0);
  const costAudOpen = lots.reduce((a, l) => a + num(l.costAud), 0);
  const valueAudOpen = toBase(usdOpen, "USD", "AUD", r);
  const upnlAud = valueAudOpen - costAudOpen;

  return {
    ticker: "AUD.USD",
    broker: bKey,
    usdOpen,
    costAudOpen,
    valueAudOpen,
    upnlAud,
  };
}

export default function Positions() {
  const [rows, setRows] = useState([]);
  const [cashRows, setCashRows] = useState([]); // [{ currency, balance }]
  const [fxPos, setFxPos] = useState(null); // { usdOpen, costAudOpen, valueAudOpen, upnlAud }
  const [fxRates, setFxRates] = useState({ AUD: 1 });
  const [displayCurrency, setDisplayCurrency] = useState("MARKET");
  const [loading, setLoading] = useState(true);

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
          .filter(
            (t) =>
              t.ticker &&
              t.date &&
              String(t.type || "").toUpperCase() !== "FOREX"
          );

        normalised.sort((a, b) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0
        );

        const positions = buildPositionsFIFO(normalised, {
          useLastTradeAsMarketPrice,
        });

        // Live price map (with DB cache fallback)
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
        // CASH holdings (prefer overview/cash-report; fallback to flat cash_reports docs)
        // -----------------------------
        let balances = { AUD: 0, USD: 0, EUR: 0 };
        let gotBalances = false;

        // 1) preferred endpoint (returns { balances: {AUD,USD,EUR} })
        try {
          const rCash = await fetch("/api/overview/cash-report?broker=IBKR");
          const j = rCash.ok ? await safeJson(rCash) : null;
          const br =
            j?.balances && typeof j.balances === "object" ? j.balances : null;

          if (br) {
            balances = {
              AUD: num(br.AUD),
              USD: num(br.USD),
              EUR: num(br.EUR),
            };
            gotBalances =
              Math.abs(balances.AUD) + Math.abs(balances.USD) + Math.abs(balances.EUR) >
              0;
          }
        } catch {
          // ignore
        }

        // 2) fallback: read raw cash_report rows (flat docs) if your API exposes them
        if (!gotBalances) {
          try {
            const rCashReports = await fetch("/api/ledger?tab=cash_report");
            const allSnaps = rCashReports.ok ? await safeJson(rCashReports) : [];

            const broker = "IBKR";
            const candidates = (Array.isArray(allSnaps) ? allSnaps : [])
              .filter((s) => safeUpper(s?.broker) === broker)
              .filter((s) => {
                const label = String(s?.label || s?.note || "").toLowerCase();
                return label.includes("ending cash"); // handles "Ending Cash" / "Ending Settled Cash"
              });

            // pick the latest date key
            let latestKey = "";
            let chosen = [];
            candidates.forEach((s) => {
              const k = keyForCashReportRow(s);
              if (!k) return;

              if (k > latestKey) {
                latestKey = k;
                chosen = [s];
              } else if (k === latestKey) {
                chosen.push(s);
              }
            });

            // if both Ending Cash & Ending Settled Cash exist on same date, prefer Ending Cash
            const hasEndingCash = chosen.some((x) =>
              String(x?.label || "").toLowerCase().includes("ending cash")
            );

            const filtered = chosen.filter((x) => {
              const l = String(x?.label || "").toLowerCase();
              if (hasEndingCash) return l === "ending cash";
              return true;
            });

            const b = { AUD: 0, USD: 0, EUR: 0 };
            filtered.forEach((x) => {
              const ccy = safeUpper(x?.currency);
              if (ccy === "AUD" || ccy === "USD" || ccy === "EUR") {
                b[ccy] += num(x?.amount);
              }
            });

            balances = b;
          } catch {
            // ignore
          }
        }

        // ✅ hide balances <= 0 (your request)
        const cashList = ["AUD", "USD", "EUR"]
          .map((ccy) => ({ currency: ccy, balance: num(balances?.[ccy] || 0) }))
          .filter((x) => x.balance > 0);

        setCashRows(cashList);

        // -----------------------------
        // FX Position (AUD.USD) from forex trades (FIFO)
        // -----------------------------
        try {
          const rForex = await fetch("/api/ledger?tab=forex");
          const forex = rForex.ok ? await safeJson(rForex) : [];
          const fx = computeFxUsdLotsAndUpnlAud(forex, rates, "IBKR");

          const show =
            Math.abs(num(fx.usdOpen)) > 1e-8 ||
            Math.abs(num(fx.upnlAud)) > 0.01 ||
            Math.abs(num(fx.costAudOpen)) > 0.01;

          setFxPos(show ? fx : null);
        } catch (e) {
          console.warn("FX position calc failed:", e);
          setFxPos(null);
        }
      } catch (e) {
        console.error("Positions fetch failed:", e);
        setRows([]);
        setCashRows([]);
        setFxPos(null);
        setFxRates({ AUD: 1 });
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
      const unrealised = marketValue != null ? marketValue - p.costBasis : null;

      // MARKET mode: show everything in trade currency
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
        marketValue == null
          ? null
          : toBase(marketValue, p.currency, displayCurrency, fxRates);

      const cbDisplay = toBase(p.costBasis, p.currency, displayCurrency, fxRates);

      const upnlDisplay =
        unrealised == null
          ? null
          : toBase(unrealised, p.currency, displayCurrency, fxRates);

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

    // FX P/L is naturally in AUD; MARKET mode shows AUD (so it's still meaningful)
    const dispCcy = displayCurrency === "MARKET" ? "AUD" : displayCurrency;

    const costDisplay = toBase(num(fxPos.costAudOpen), "AUD", dispCcy, fxRates);
    const valueDisplay = toBase(num(fxPos.valueAudOpen), "AUD", dispCcy, fxRates);
    const upnlDisplay = toBase(num(fxPos.upnlAud), "AUD", dispCcy, fxRates);

    return {
      ticker: fxPos.ticker || "AUD.USD",
      usdOpen: num(fxPos.usdOpen),
      costDisplay,
      valueDisplay,
      upnlDisplay,
      displayCcy: dispCcy,
    };
  }, [fxPos, displayCurrency, fxRates]);

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
                                : toBase(
                                    p.avgPrice,
                                    p.currency,
                                    displayCurrency,
                                    fxRates
                                  ),
                              p.displayCcy
                            )}
                      </td>

                      <td className="num">
                        {fmtMoney(p.cbDisplay, p.displayCcy)}
                      </td>

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
        <h3 className="cash-title">Cash holdings (Cash Report)</h3>

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
                        {fmtMoney(
                          toBase(c.balance, c.currency, displayCurrency, fxRates),
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

        {/* FX position (does NOT remove cash) */}
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
                  <th className="num">
                    Cost ({fxPosDisplay?.displayCcy || "AUD"})
                  </th>
                  <th className="num">
                    Value ({fxPosDisplay?.displayCcy || "AUD"})
                  </th>
                  <th className="num">
                    Unrealised P&amp;L ({fxPosDisplay?.displayCcy || "AUD"})
                  </th>
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
                    <td className="num">
                      {fmtMoney(fxPosDisplay.costDisplay, fxPosDisplay.displayCcy)}
                    </td>
                    <td className="num">
                      {fmtMoney(fxPosDisplay.valueDisplay, fxPosDisplay.displayCcy)}
                    </td>
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
            FX position is derived from your AUD.USD forex trades (FIFO). “MARKET”
            displays FX P/L in AUD.
          </p>
        </div>

        <p className="positions-note">
          Cash balances are sourced from IBKR Cash Report “Ending Cash”.
        </p>
      </div>
    </div>
  );
}
