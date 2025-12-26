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

  /* ------------------ helpers ------------------ */

  const calcTrade = (t) => {
    const proceeds = (t.quantity || 0) * (t.price || 0);
    const basis = proceeds - (t.fee || 0);
    return { ...t, proceeds, basis };
  };

  /* ------------------ fetch ------------------ */

  useEffect(() => {
    fetchTrades();
  }, []);

  const fetchTrades = async () => {
    try {
      const res = await fetch("/api/trades");
      const data = await res.json();

      const normalised = data.map(t =>
        calcTrade({
          ...t,
          quantity: Number(t.quantity) || 0,
          price: Number(t.price) || 0,
          fee: Number(t.fee) || 0,
          realisedPL: Number(t.realisedPL) || 0,
        })
      );

      setTrades(normalised);
    } catch (err) {
      console.error("Failed to fetch trades", err);
    }
  };

  /* ------------------ actions ------------------ */

  const toggleTicker = (ticker) =>
    setCollapsed(prev => ({ ...prev, [ticker]: !prev[ticker] }));

  const deleteTrade = async (id) => {
    try {
      await fetch(`/api/trades/${id}`, { method: "DELETE" });
      setTrades(prev => prev.filter(t => t._id !== id));
    } catch (err) {
      console.error("Failed to delete trade", err);
    }
  };

  const addTrade = async () => {
    try {
      const payload = {
        ticker: newTrade.ticker.trim(),
        date: newTrade.date,
        quantity: Number(newTrade.quantity),
        price: Number(newTrade.price),
        fee: Number(newTrade.fee || 0),
        broker: newTrade.broker,
        currency: newTrade.currency,
      };

      if (
        !payload.ticker ||
        !payload.date ||
        payload.quantity <= 0 ||
        payload.price <= 0
      ) {
        alert("Invalid trade");
        return;
      }

      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const saved = await res.json();
      setTrades(prev => [calcTrade(saved), ...prev]);
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

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  /* ------------------ filter + sort ------------------ */

  let filteredTrades = trades.filter(t =>
    (!filterTicker || t.ticker.includes(filterTicker)) &&
    (!filterDate || t.date === filterDate) &&
    (!filterQty || t.quantity === Number(filterQty)) &&
    (!filterBroker || t.broker === filterBroker)
  );

  if (sortConfig.key) {
    filteredTrades.sort((a, b) => {
      const A = a[sortConfig.key] ?? 0;
      const B = b[sortConfig.key] ?? 0;
      if (A < B) return sortConfig.direction === "asc" ? -1 : 1;
      if (A > B) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }

  /* ------------------ pagination ------------------ */

  const totalPages = Math.ceil(filteredTrades.length / rowLimit);

  const paginated = filteredTrades.slice(
    (currentPage - 1) * rowLimit,
    currentPage * rowLimit
  );

  /* ------------------ grouping ------------------ */

  const groupedTrades = paginated.reduce((acc, t) => {
    acc[t.ticker] = acc[t.ticker] || [];
    acc[t.ticker].push(t);
    return acc;
  }, {});

  const grandTotal = filteredTrades.reduce(
    (a, t) => ({
      qty: a.qty + t.quantity,
      proceeds: a.proceeds + t.proceeds,
      fee: a.fee + t.fee,
      realisedPL: a.realisedPL + (t.realisedPL || 0),
    }),
    { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
  );

  const renderPagination = () => (
    <div className="ledger-pagination">
      <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Prev</button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
        <button
          key={p}
          className={p === currentPage ? "active" : ""}
          onClick={() => setCurrentPage(p)}
        >
          {p}
        </button>
      ))}
      <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
    </div>
  );

  /* ------------------ UI ------------------ */

  return (
    <div className="ledger-page">
      <h2>Ledger</h2>

      <div className="ledger-tabs">
        <button className={activeTab === "trades" ? "active" : ""} onClick={() => setActiveTab("trades")}>Trades</button>
        <button className={activeTab === "cash" ? "active" : ""} onClick={() => setActiveTab("cash")}>Cash</button>
      </div>

      {activeTab === "trades" && (
        <>
          {/* Add Trade */}
          <div className="ledger-entry-box">
            <h4>Add New Trade</h4>
            <div className="ledger-entry-fields">
              <input placeholder="Ticker" value={newTrade.ticker} onChange={e => setNewTrade({ ...newTrade, ticker: e.target.value.toUpperCase() })} />
              <input type="date" value={newTrade.date} onChange={e => setNewTrade({ ...newTrade, date: e.target.value })} />
              <input type="number" placeholder="Qty" value={newTrade.quantity} onChange={e => setNewTrade({ ...newTrade, quantity: e.target.value })} />
              <input type="number" placeholder="Price" value={newTrade.price} onChange={e => setNewTrade({ ...newTrade, price: e.target.value })} />
              <input type="number" placeholder="Fee" value={newTrade.fee} onChange={e => setNewTrade({ ...newTrade, fee: e.target.value })} />
              <select value={newTrade.broker} onChange={e => setNewTrade({ ...newTrade, broker: e.target.value })}>
                <option>IBKR</option>
                <option>CMC</option>
                <option>Stake</option>
              </select>
              <button onClick={addTrade}>Add Trade</button>
            </div>
          </div>

          {/* Table */}
          <table className="ledger-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("ticker")}>Ticker</th>
                <th onClick={() => handleSort("date")}>Date</th>
                <th onClick={() => handleSort("quantity")}>Qty</th>
                <th onClick={() => handleSort("price")}>Price</th>
                <th>Proceeds</th>
                <th>Fee</th>
                <th>Realised P/L</th>
                <th>Broker</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {Object.entries(groupedTrades).map(([ticker, rows]) => (
                <React.Fragment key={ticker}>
                  <tr className="ledger-subtotal" onClick={() => toggleTicker(ticker)}>
                    <td><strong>{ticker}</strong></td>
                    <td></td>
                    <td><strong>{rows.reduce((a, t) => a + t.quantity, 0)}</strong></td>
                    <td></td>
                    <td>{rows.reduce((a, t) => a + t.proceeds, 0).toFixed(2)}</td>
                    <td>{rows.reduce((a, t) => a + t.fee, 0).toFixed(2)}</td>
                    <td>{rows.reduce((a, t) => a + (t.realisedPL || 0), 0).toFixed(2)}</td>
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
                      <td>{(t.realisedPL || 0).toFixed(2)}</td>
                      <td>{t.broker}</td>
                      <td><button onClick={() => deleteTrade(t._id)}>✕</button></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}

              <tr className="ledger-grand-total">
                <td><strong>Grand Total</strong></td>
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

          <div className="ledger-controls-bottom">
            <label>
              Rows per page:
              <select value={rowLimit} onChange={e => { setRowLimit(Number(e.target.value)); setCurrentPage(1); }}>
                {[25, 50, 100, 500].map(n => <option key={n}>{n}</option>)}
              </select>
            </label>
            {renderPagination()}
          </div>
        </>
      )}
    </div>
  );
}
