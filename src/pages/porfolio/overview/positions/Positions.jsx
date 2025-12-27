import React, { useEffect, useMemo, useState } from "react";
import "../../../../css/positionsTab.css";

// Replace later with live FX rates (API), but fine for now:
const EXCHANGE_RATES = { AUD: 1, USD: 1.65, EUR: 1.8 };

// If live price fails + cache missing, we can still fall back to last trade price:
const useLastTradeAsMarketPrice = true;

// Cache freshness (for the “stale” badge)
const STALE_AFTER_HOURS = 24;

// Dropdown options
const DISPLAY_OPTIONS = ["MARKET", ...Object.keys(EXCHANGE_RATES)];

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

async function safeJson(res) {
  try {
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function hoursSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60);
}

function priceBadgeLabel(source, asOfIso) {
  const src = String(source || "").toUpperCase();
  const ageHrs = hoursSince(asOfIso);

  // Normalise the main badge name
  let main = "LAST";
  if (src.includes("LIVE")) main = "LIVE";
  else if (src.includes("CACHE")) main = "CACHED";
  else if (src) main = src;

  // Add stale marker when cached/unknown and old
  const stale =
    ageHrs != null && ageHrs > STALE_AFTER_HOURS && main !== "LIVE";

  if (stale) return `${main} · STALE`;
  return main;
}

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
        const positions = buildPositionsFIFO(normalised);

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
          const rPrices = await fetch(`/api/prices?symbols=${symbols.join(",")}`);
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
        marketValue == null ? null : toBase(marketValue, p.currency, displayCurrency);
      const cbDisplay = toBase(p.costBasis, p.currency, displayCurrency);
      const upnlDisplay =
        unrealised == null ? null : toBase(unrealised, p.currency, displayCurrency);

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
                            <span className={`price-badge ${badge.includes("LIVE") ? "live" : badge.includes("CACHED") ? "cached" : "last"}`}>
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
          Prices try LIVE first, then fall back to your cached DB price, then (if needed) last trade price.
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
                  <td colSpan={displayCurrency !== "MARKET" ? 3 : 2} className="positions-empty">
                    Loading…
                  </td>
                </tr>
              ) : cashRows.length === 0 ? (
                <tr>
                  <td colSpan={displayCurrency !== "MARKET" ? 3 : 2} className="positions-empty">
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

/**
 * Build open positions using FIFO lots (more accurate than avg-cost).
 * - Quantity can go negative (short). We keep it working, but FIFO for shorts can be upgraded later.
 * - Cost basis reflects the remaining open lots (in trade currency).
 * - marketPrice initially uses last trade price as placeholder (easy fallback).
 */
function buildPositionsFIFO(trades) {
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

    // BUY (q > 0): add a lot. (We ignore fee allocation per-lot for now; we apply it to costBasis.)
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
