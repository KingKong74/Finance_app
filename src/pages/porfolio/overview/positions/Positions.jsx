import React, { useEffect, useMemo, useState } from "react";

const TABS_FOR_POSITIONS = ["trades", "crypto", "forex"]; // include forex if you want it in positions

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response not JSON. Status=${res.status}. Body starts: ${text.slice(0, 80)}`);
  }
}

function normaliseTrade(row, tab) {
  return {
    _id: row._id,
    type: tab, // "trades" | "crypto" | "forex"
    ticker: String(row.ticker || row.symbol || "").toUpperCase(),
    date: String(row.date || "").slice(0, 10), // keep YYYY-MM-DD
    currency: row.currency || "USD",
    quantity: Number(row.quantity || 0),
    price: Number(row.price || 0),
    fee: Number(row.fee || 0),
    broker: row.broker || "",
  };
}

function normaliseCash(row) {
  const entryType = row.entryType || "deposit";
  const sign = entryType === "withdrawal" ? -1 : 1;

  return {
    _id: row._id,
    date: String(row.date || "").slice(0, 10),
    currency: row.currency || "AUD",
    entryType,
    amount: Number(row.amount || 0) * sign,
    note: row.note || "",
  };
}

/**
 * Average-cost positions from trade history.
 * Uses latest trade price (by date) as "current price" placeholder.
 */
function computePositions(trades) {
  const map = new Map();

  for (const t of trades) {
    if (!t.ticker) continue;

    const key = `${t.type}|${t.ticker}|${t.currency}`;
    if (!map.has(key)) {
      map.set(key, {
        type: t.type,
        ticker: t.ticker,
        currency: t.currency,
        position: 0,
        costBasis: 0, // avg-cost cost basis of open position
        latestPrice: 0,
        latestDate: "",
      });
    }

    const p = map.get(key);

    // Track latest trade price by date (string compare works for YYYY-MM-DD)
    if (!p.latestDate || t.date >= p.latestDate) {
      p.latestDate = t.date;
      p.latestPrice = t.price;
    }

    // Average cost method (basic):
    // - Buys increase position and increase costBasis by qty*price (+ fee if you want)
    // - Sells reduce position and reduce costBasis proportionally using avg cost
    const qty = t.quantity;
    const price = t.price;

    if (qty === 0) continue;

    const prevPos = p.position;
    const prevCost = p.costBasis;

    // BUY (qty > 0)
    if (qty > 0) {
      p.position = prevPos + qty;
      p.costBasis = prevCost + qty * price; // you can add fees here if you want: + t.fee
      continue;
    }

    // SELL (qty < 0)
    // Remove cost basis based on current average cost
    const sellQtyAbs = Math.abs(qty);

    if (prevPos === 0) {
      // Selling without an existing position => you're going short.
      // We'll treat the new short as a fresh position at this sell price.
      p.position = prevPos + qty; // negative
      p.costBasis = sellQtyAbs * price; // store abs cost basis for short, for display avg
      continue;
    }

    const avgCost = prevCost / Math.abs(prevPos || 1);

    // If selling more than you have (crosses through zero), split:
    if (sellQtyAbs > Math.abs(prevPos)) {
      // close existing position fully
      const qtyToClose = Math.abs(prevPos);
      const qtyToGoShort = sellQtyAbs - qtyToClose;

      // remove full existing cost basis
      p.position = 0;
      p.costBasis = 0;

      // open short for the remainder at this price
      p.position = -qtyToGoShort;
      p.costBasis = qtyToGoShort * price;
    } else {
      // normal partial close
      p.position = prevPos + qty; // reduces towards 0
      p.costBasis = prevCost - sellQtyAbs * avgCost;
    }
  }

  const rows = Array.from(map.values())
    // only open positions
    .filter((p) => p.position !== 0)
    .map((p) => {
      const avgPrice = p.costBasis / Math.abs(p.position || 1);
      const marketValue = p.position * p.latestPrice;

      // Unrealised P&L sign works for longs and shorts:
      // long: (price - avg)*pos; short: (price - avg)*neg => flips sign correctly
      const unrealisedPL = (p.latestPrice - avgPrice) * p.position;

      return {
        ...p,
        avgPrice,
        marketValue,
        unrealisedPL,
      };
    });

  // Optional: sort by largest market value
  rows.sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue));
  return rows;
}

function computeCashHoldings(cashRows) {
  const byCurrency = new Map();
  for (const c of cashRows) {
    const cur = c.currency || "AUD";
    byCurrency.set(cur, (byCurrency.get(cur) || 0) + Number(c.amount || 0));
  }

  return Array.from(byCurrency.entries())
    .map(([currency, balance]) => ({ currency, balance }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export default function Positions() {
  const [loading, setLoading] = useState(true);
  const [tradeRows, setTradeRows] = useState([]);
  const [cashRows, setCashRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const tradeFetches = TABS_FOR_POSITIONS.map((tab) =>
          fetch(`/api/ledger?tab=${tab}`)
        );
        const cashFetch = fetch(`/api/ledger?tab=cash`);

        const responses = await Promise.all([...tradeFetches, cashFetch]);

        for (const res of responses) {
          if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        }

        const jsons = await Promise.all(responses.map((r) => safeJson(r)));

        const tradesCombined = [];
        for (let i = 0; i < TABS_FOR_POSITIONS.length; i++) {
          const tab = TABS_FOR_POSITIONS[i];
          const arr = Array.isArray(jsons[i]) ? jsons[i] : [];
          tradesCombined.push(...arr.map((row) => normaliseTrade(row, tab)));
        }

        const cashArr = Array.isArray(jsons[jsons.length - 1]) ? jsons[jsons.length - 1] : [];
        const cashNormalised = cashArr.map(normaliseCash);

        if (!cancelled) {
          setTradeRows(tradesCombined);
          setCashRows(cashNormalised);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e.message || "Failed to load positions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const positions = useMemo(() => computePositions(tradeRows), [tradeRows]);
  const cashHoldings = useMemo(() => computeCashHoldings(cashRows), [cashRows]);

  if (loading) return <div style={{ padding: "1rem" }}>Loading positions…</div>;
  if (error) return <div style={{ padding: "1rem", color: "crimson" }}>Error: {error}</div>;

  return (
    <div style={{ padding: "1rem" }}>
      <h2 style={{ margin: "0 0 0.75rem" }}>Open Positions</h2>

      <div className="ledger-table-wrapper">
        <table className="ledger-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Instrument</th>
              <th>Position</th>
              <th>Market Value</th>
              <th>Avg. Price</th>
              <th>Unrealised P&amp;L</th>
              <th>Currency</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "left", padding: "0.8rem" }}>
                  No open positions found.
                </td>
              </tr>
            )}

            {positions.map((p) => (
              <tr key={`${p.type}|${p.ticker}|${p.currency}`}>
                <td style={{ textAlign: "left" }}>
                  <strong>{p.ticker}</strong>{" "}
                  <span style={{ opacity: 0.6, fontSize: "0.85em" }}>
                    ({p.type})
                  </span>
                </td>
                <td>{p.position.toFixed(6).replace(/\.?0+$/, "")}</td>
                <td>{p.marketValue.toFixed(2)}</td>
                <td>{p.avgPrice.toFixed(4)}</td>
                <td style={{ color: p.unrealisedPL >= 0 ? "green" : "crimson" }}>
                  {p.unrealisedPL.toFixed(2)}
                </td>
                <td>{p.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ margin: "1.5rem 0 0.75rem" }}>Cash Holdings</h3>
      <div className="ledger-table-wrapper">
        <table className="ledger-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Currency</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {cashHoldings.length === 0 && (
              <tr>
                <td colSpan={2} style={{ textAlign: "left", padding: "0.8rem" }}>
                  No cash ledger entries found.
                </td>
              </tr>
            )}

            {cashHoldings.map((c) => (
              <tr key={c.currency}>
                <td style={{ textAlign: "left" }}><strong>{c.currency}</strong></td>
                <td>{c.balance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: "0.75rem", opacity: 0.7, fontSize: "0.9rem" }}>
        Note: Market Value &amp; Unrealised P&amp;L currently use your <strong>latest trade price</strong> as a placeholder for live pricing.
      </p>
    </div>
  );
}
