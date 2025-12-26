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

  // Fetch trades from MongoDB on mount
  useEffect(() => {
    fetchTrades();
  }, []);

  const fetchTrades = async () => {
    try {
      const res = await fetch("/api/trades");
      const data = await res.json();

      const normalised = data.map(t => ({
        ...t,
        quantity: Number(t.quantity) || 0,
        price: Number(t.price) || 0,
        fee: Number(t.fee) || 0,
        realisedPL: Number(t.realisedPL) || 0,
      })).map(calcTrade);

      setTrades(normalised);
    } catch (err) {
      console.error("Failed to fetch trades", err);
    }
  };


  const calcTrade = (t) => {
    const proceeds = (t.quantity || 0) * (t.price || 0);
    const basis = proceeds - (t.fee || 0);
    return { ...t, proceeds, basis };
  };

  const toggleTicker = (key) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const deleteTrade = async (id) => {
    try {
      await fetch(`/api/trades/${id}`, { method: "DELETE" });
      setTrades(trades.filter((t) => t._id !== id));
    } catch (err) {
      console.error("Failed to delete trade", err);
    }
  };

  const addTrade = async () => {
    try {
      const payload = {
        ...newTrade,
        quantity: Number(newTrade.quantity),
        price: Number(newTrade.price),
        fee: Number(newTrade.fee),
      };

      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const saved = calcTrade({
        ...payload,
        _id: (await res.json())._id,
      });

      setTrades(prev => [saved, ...prev]);
      setCurrentPage(1);

      setNewTrade({
        ticker: newTrade.ticker,
        date: newTrade.date,
        quantity: newTrade.quantity,
        price: newTrade.price,
        fee: newTrade.fee,
        broker: newTrade.broker,
        currency: newTrade.currency,
      });
    } catch (err) {
      console.error("Failed to add trade", err);
    }
  };


  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") direction = "desc";
    setSortConfig({ key, direction });
  };

  // Filtered and sorted trades
  let filteredTrades = trades.filter((t) => {
    return (
      (!filterTicker || t.ticker.includes(filterTicker)) &&
      (!filterDate || t.date === filterDate) &&
      (!filterQty || t.quantity === Number(filterQty)) &&
      (!filterBroker || t.broker === filterBroker)
    );
  });

  if (sortConfig.key) {
    filteredTrades.sort((a, b) => {
      const valA = a[sortConfig.key] ?? 0;
      const valB = b[sortConfig.key] ?? 0;
      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }

  // Pagination
  const totalPages = Math.ceil(filteredTrades.length / rowLimit);
  const paginatedTrades = filteredTrades.slice(
    (currentPage - 1) * rowLimit,
    currentPage * rowLimit
  );

  // Grouped trades for subtotal
  const groupedTrades = filteredTrades.reduce((acc, t) => {
    const key = `${t.ticker}_${t.currency}`; // group by ticker + currency
    acc[key] = acc[key] || [];
    acc[key].push(calcTrade(t));
    return acc;
  }, {});


  const grandTotal = filteredTrades.reduce(
    (a, t) => ({
      qty: a.qty + (t.quantity || 0),
      proceeds: a.proceeds + (t.quantity || 0) * (t.price || 0),
      fee: a.fee + (t.fee || 0),
      realisedPL: a.realisedPL + (t.realisedPL || 0),
    }),
    { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
  );

  const renderPagination = () => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) pages.push(i);

    return (
      <div className="ledger-pagination">
        <button disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>Prev</button>
        {pages.map((p) => (
          <button
            key={p}
            className={p === currentPage ? "active" : ""}
            onClick={() => setCurrentPage(p)}
          >
            {p}
          </button>
        ))}
        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(currentPage + 1)}>Next</button>
      </div>
    );
  };

  return (
    <div className="ledger-page">
      <h2>Ledger</h2>
      <div className="ledger-tabs">
        <button className={activeTab === "trades" ? "active" : ""} onClick={() => setActiveTab("trades")}>Trades</button>
        <button className={activeTab === "cash" ? "active" : ""} onClick={() => setActiveTab("cash")}>Cash</button>
      </div>

      {activeTab === "trades" && (
        <>
          {/* Add Trade Box */}
          <div className="ledger-entry-box">
            <h4>Add New Trade</h4>
            <div className="ledger-entry-fields">
              <input placeholder="Ticker" value={newTrade.ticker} onChange={e => setNewTrade({ ...newTrade, ticker: e.target.value.toUpperCase() })} />
              <input type="date" value={newTrade.date} onChange={e => setNewTrade({ ...newTrade, date: e.target.value })} />
              <input type="number" placeholder="Qty" value={newTrade.quantity} onChange={e => setNewTrade({ ...newTrade, quantity: e.target.value })} />
              <div className="price-fee-wrapper">
                <input type="number" placeholder="Price" value={newTrade.price} onChange={e => setNewTrade({ ...newTrade, price: e.target.value })} />
                <select value={newTrade.currency} onChange={e => setNewTrade({ ...newTrade, currency: e.target.value })}>
                  <option>USD</option>
                  <option>AUD</option>
                  <option>EUR</option>
                </select>
              </div>
              <div className="price-fee-wrapper">
                <input type="number" placeholder="Fee" value={newTrade.fee} onChange={e => setNewTrade({ ...newTrade, fee: e.target.value })} />
                <select value={newTrade.currency} onChange={e => setNewTrade({ ...newTrade, currency: e.target.value })}>
                  <option>USD</option>
                  <option>AUD</option>
                  <option>EUR</option>
                </select>
              </div>
              <select value={newTrade.broker} onChange={e => setNewTrade({ ...newTrade, broker: e.target.value })}>
                <option>IBKR</option>
                <option>CMC</option>
                <option>Stake</option>
              </select>
              <button onClick={addTrade}>Add Trade</button>
            </div>
          </div>

          {/* Trades Table */}
          <table className="ledger-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("ticker")}>Ticker {sortConfig.key === "ticker" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>
                <th onClick={() => handleSort("date")}>Date {sortConfig.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>
                <th onClick={() => handleSort("quantity")}>Qty {sortConfig.key === "quantity" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>
                <th onClick={() => handleSort("price")}>Price {sortConfig.key === "price" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>
                <th onClick={() => handleSort("proceeds")}>Proceeds {sortConfig.key === "proceeds" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>
                <th onClick={() => handleSort("fee")}>Fee {sortConfig.key === "fee" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>
                <th onClick={() => handleSort("realisedPL")}>Realised P/L {sortConfig.key === "realisedPL" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>
                <th onClick={() => handleSort("broker")}>Broker {sortConfig.key === "broker" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>
                <th></th>
              </tr>
              <tr className="ledger-filters-row">
                <td><input type="text" placeholder="Ticker" value={filterTicker} onChange={e => setFilterTicker(e.target.value.toUpperCase())} /></td>
                <td><input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} /></td>
                <td><input type="number" placeholder="Qty" value={filterQty} onChange={e => setFilterQty(e.target.value)} /></td>
                <td></td><td></td><td></td><td></td>
                <td>
                  <select value={filterBroker} onChange={e => setFilterBroker(e.target.value)}>
                    <option value="">All</option>
                    <option>IBKR</option>
                    <option>CMC</option>
                    <option>Stake</option>
                  </select>
                </td>
                <td></td>
              </tr>
            </thead>

            <tbody>
              {Object.entries(groupedTrades).map(([ticker, rows]) => {
                const currency = rows[0]?.currency || "";
                const subtotal = rows.reduce(
                  (a, t) => ({
                    qty: a.qty + (t.quantity || 0),
                    proceeds: a.proceeds + (t.proceeds || 0),
                    fee: a.fee + (t.fee || 0),
                    realisedPL: a.realisedPL + (t.realisedPL || 0),
                  }),
                  { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
                );

                return (
                  <React.Fragment key={ticker}>
                    <tr className="ledger-currency-row"><td colSpan="9">{currency}</td></tr>
                    <tr className="ledger-subtotal" onClick={() => toggleTicker(key)}>
                      <td><strong>{rows[0].ticker}</strong></td>
                      <td colSpan="2">{rows[0].currency}</td>
                      <td><strong>{subtotal.qty}</strong></td>
                      <td>{subtotal.proceeds?.toFixed(2)}</td>
                      <td>{subtotal.fee?.toFixed(2)}</td>
                      <td>{subtotal.realisedPL?.toFixed(2)}</td>
                      <td colSpan="2">{collapsed[key] ? "▼" : "▲"}</td>
                    </tr>
                    {!collapsed[key] && rows
                      .slice(
                        (currentPage - 1) * rowLimit,
                        currentPage * rowLimit
                      )
                      .map(t => (
                        <tr key={t._id}>
                          <td>{t.ticker}</td>
                          <td>{t.date}</td>
                          <td>{t.quantity || 0}</td>
                          <td>{t.price || 0}</td>
                          <td>{t.proceeds?.toFixed(2)}</td>
                          <td>{t.fee?.toFixed(2)}</td>
                          <td>{(t.realisedPL || 0).toFixed(2)}</td>
                          <td><span className={`broker-tag ${t.broker?.toLowerCase()}`}>{t.broker}</span></td>
                          <td><button className="icon-btn" onClick={() => deleteTrade(t._id)}>✕</button></td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}

              <tr className="ledger-grand-total">
                <td><strong>Grand Total</strong></td>
                <td></td>
                <td><strong>{grandTotal.qty}</strong></td>
                <td></td>
                <td>{grandTotal.proceeds.toFixed(2)}</td>
                <td>{grandTotal.fee.toFixed(2)}</td>
                <td>{grandTotal.realisedPL.toFixed(2)}</td>
                <td colSpan="2"></td>
              </tr>
            </tbody>
          </table>

          {/* Pagination & Rows per page */}
          <div className="ledger-controls-bottom">
            <label>
              Rows per page:
              <select value={rowLimit} onChange={e => { setRowLimit(Number(e.target.value)); setCurrentPage(1); }}>
                {[25, 50, 100, 500, 1000].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            {renderPagination()}
          </div>
        </>
      )}
    </div>
  );
}
