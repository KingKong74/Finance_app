import React, { useState, useEffect } from "react";
import "../../../css/ledgerTab.css";

export default function Ledger() {
  const [activeTab, setActiveTab] = useState("trades");
  const [rowLimit, setRowLimit] = useState(25);
  const [collapsed, setCollapsed] = useState({});
  const [trades, setTrades] = useState([]);

  const [newTrade, setNewTrade] = useState({
    ticker: "",
    date: "",
    quantity: "",
    price: "",
    fee: "",
    broker: "IBKR",
    currency: "USD",
  });

  // Filters
  const [filterTicker, setFilterTicker] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterQty, setFilterQty] = useState("");
  const [filterBroker, setFilterBroker] = useState("");

  // Sorting
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "asc" });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchTrades();
  }, []);

  /* ------------------ helpers ------------------ */

  const calcTrade = (t) => {
    const quantity = Number(t.quantity) || 0;
    const price = Number(t.price) || 0;
    const fee = Number(t.fee) || 0;

    const proceeds = quantity * price;
    const basis = proceeds - fee;

    return {
      ...t,
      quantity,
      price,
      fee,
      proceeds,
      basis,
      realisedPL: Number(t.realisedPL) || 0,
    };
  };

  /* ------------------ API ------------------ */

  const fetchTrades = async () => {
    try {
      const res = await fetch("/api/trades");
      const data = await res.json();
      setTrades(data.map(calcTrade));
    } catch (err) {
      console.error("Failed to fetch trades", err);
    }
  };

  const addTrade = async () => {
    const payload = {
      ticker: newTrade.ticker.trim(),
      date: newTrade.date,
      quantity: Number(newTrade.quantity),
      price: Number(newTrade.price),
      fee: Number(newTrade.fee || 0),
      broker: newTrade.broker,
      currency: newTrade.currency,
    };

    // 🚨 block bad requests
    if (
      !payload.ticker ||
      !payload.date ||
      payload.quantity <= 0 ||
      payload.price <= 0
    ) {
      alert("Please enter a valid trade");
      return;
    }

    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg);
      }

      const saved = calcTrade(await res.json());
      setTrades((prev) => [saved, ...prev]);
      setCurrentPage(1);

      setNewTrade({
        ticker: "",
        date: "",
        quantity: "",
        price: "",
        fee: "",
        broker: "IBKR",
        currency: "USD",
      });
    } catch (err) {
      console.error("Failed to add trade", err);
    }
  };

  const deleteTrade = async (id) => {
    try {
      await fetch(`/api/trades/${id}`, { method: "DELETE" });
      setTrades((prev) => prev.filter((t) => t._id !== id));
    } catch (err) {
      console.error("Failed to delete trade", err);
    }
  };

  /* ------------------ sorting & filtering ------------------ */

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction:
        prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  let filteredTrades = trades.filter((t) => (
    (!filterTicker || t.ticker.includes(filterTicker)) &&
    (!filterDate || t.date === filterDate) &&
    (!filterQty || t.quantity === Number(filterQty)) &&
    (!filterBroker || t.broker === filterBroker)
  ));

  if (sortConfig.key) {
    filteredTrades.sort((a, b) => {
      const A = a[sortConfig.key] ?? 0;
      const B = b[sortConfig.key] ?? 0;
      return sortConfig.direction === "asc" ? A - B : B - A;
    });
  }

  const totalPages = Math.ceil(filteredTrades.length / rowLimit);

  const groupedTrades = filteredTrades.reduce((acc, t) => {
    acc[t.ticker] ??= [];
    acc[t.ticker].push(t);
    return acc;
  }, {});

  const grandTotal = filteredTrades.reduce(
    (a, t) => ({
      qty: a.qty + t.quantity,
      proceeds: a.proceeds + t.proceeds,
      fee: a.fee + t.fee,
      realisedPL: a.realisedPL + t.realisedPL,
    }),
    { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
  );

  /* ------------------ UI ------------------ */

  return (
    <div className="ledger-page">
      <h2>Ledger</h2>

      <div className="ledger-entry-box">
        <h4>Add New Trade</h4>
        <div className="ledger-entry-fields">
          <input placeholder="Ticker" value={newTrade.ticker}
            onChange={e => setNewTrade({ ...newTrade, ticker: e.target.value.toUpperCase() })} />
          <input type="date" value={newTrade.date}
            onChange={e => setNewTrade({ ...newTrade, date: e.target.value })} />
          <input type="number" placeholder="Qty" value={newTrade.quantity}
            onChange={e => setNewTrade({ ...newTrade, quantity: e.target.value })} />
          <input type="number" placeholder="Price" value={newTrade.price}
            onChange={e => setNewTrade({ ...newTrade, price: e.target.value })} />
          <input type="number" placeholder="Fee" value={newTrade.fee}
            onChange={e => setNewTrade({ ...newTrade, fee: e.target.value })} />
          <select value={newTrade.broker}
            onChange={e => setNewTrade({ ...newTrade, broker: e.target.value })}>
            <option>IBKR</option>
            <option>CMC</option>
            <option>Stake</option>
          </select>
          <button onClick={addTrade}>Add Trade</button>
        </div>
      </div>

      <table className="ledger-table">
        <thead>
          <tr>
            <th onClick={() => handleSort("ticker")}>Ticker</th>
            <th onClick={() => handleSort("date")}>Date</th>
            <th onClick={() => handleSort("quantity")}>Qty</th>
            <th onClick={() => handleSort("price")}>Price</th>
            <th>Proceeds</th>
            <th>Fee</th>
            <th>P/L</th>
            <th>Broker</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {Object.entries(groupedTrades).map(([ticker, rows]) => {
            const subtotal = rows.reduce(
              (a, t) => ({
                qty: a.qty + t.quantity,
                proceeds: a.proceeds + t.proceeds,
                fee: a.fee + t.fee,
                realisedPL: a.realisedPL + t.realisedPL,
              }),
              { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
            );

            return (
              <React.Fragment key={ticker}>
                <tr className="ledger-subtotal"
                  onClick={() => setCollapsed(p => ({ ...p, [ticker]: !p[ticker] }))}>
                  <td><strong>{ticker}</strong></td>
                  <td></td>
                  <td>{subtotal.qty}</td>
                  <td></td>
                  <td>{subtotal.proceeds.toFixed(2)}</td>
                  <td>{subtotal.fee.toFixed(2)}</td>
                  <td>{subtotal.realisedPL.toFixed(2)}</td>
                  <td colSpan="2">{collapsed[ticker] ? "▼" : "▲"}</td>
                </tr>

                {!collapsed[ticker] && rows.map(t => (
                  <tr key={t._id}>
                    <td>{t.ticker}</td>
                    <td>{t.date}</td>
                    <td>{t.quantity}</td>
                    <td>{t.price}</td>
                    <td>{t.proceeds.toFixed(2)}</td>
                    <td>{t.fee.toFixed(2)}</td>
                    <td>{t.realisedPL.toFixed(2)}</td>
                    <td>{t.broker}</td>
                    <td>
                      <button className="icon-btn" onClick={() => deleteTrade(t._id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}

          <tr className="ledger-grand-total">
            <td><strong>Total</strong></td>
            <td></td>
            <td>{grandTotal.qty}</td>
            <td></td>
            <td>{grandTotal.proceeds.toFixed(2)}</td>
            <td>{grandTotal.fee.toFixed(2)}</td>
            <td>{grandTotal.realisedPL.toFixed(2)}</td>
            <td colSpan="2"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
