import React, { useState, useEffect } from "react";
import "../../../css/ledgerTab.css";

const EXCHANGE_RATES = { USD: 1.65, EUR: 1.80, AUD: 1 };

export default function Ledger() {
  const [activeTab, setActiveTab] = useState("trades");
  const [rowLimit, setRowLimit] = useState(25);
  const [collapsed, setCollapsed] = useState({});
  const [trades, setTrades] = useState([]);
  const [cash, setCash] = useState([]);
  const [forex, setForex] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState("AUD");

  const [newEntry, setNewEntry] = useState({
    ticker: "",
    date: "",
    quantity: "",
    price: "",
    fee: "",
    broker: "IBKR",
    currency: "USD",
    type: "stock", // stock / crypto / cash / forex
    entryType: "deposit", // cash: deposit / withdrawal, forex: buy / sell
  });

  // Filters
  const [filters, setFilters] = useState({
    ticker: "",
    date: "",
    qty: "",
    broker: "",
    currency: "",
  });

  // Sorting
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "asc" });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [resTrades, resCash, resForex] = await Promise.all([
        fetch("/api/trades"),
        fetch("/api/cash"),
        fetch("/api/forex"),
      ]);
      const [tradesData, cashData, forexData] = await Promise.all([
        resTrades.json(),
        resCash.json(),
        resForex.json(),
      ]);

      setTrades(normalizeTrades(tradesData));
      setCash(normalizeCash(cashData));
      setForex(normalizeTrades(forexData));
    } catch (err) {
      console.error("Failed to fetch ledger data", err);
    }
  };

  const normalizeTrades = (data) =>
    data.map((t) => ({
      ...t,
      quantity: Number(t.quantity || 0),
      price: Number(t.price || 0),
      fee: Number(t.fee || 0),
      realisedPL: Number(t.realisedPL || 0),
      type: t.type || "stock",
    })).map(calcTrade);

  const normalizeCash = (data) =>
    data.map((c) => ({
      ...c,
      amount: Number(c.amount || 0),
      currency: c.currency || "AUD",
      entryType: c.entryType || "deposit",
    }));

  const calcTrade = (t) => ({
    ...t,
    proceeds: (t.quantity || 0) * (t.price || 0),
    basis: (t.quantity || 0) * (t.price || 0) - (t.fee || 0),
  });

  const toggleRow = (key) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const deleteEntry = async (id, tab) => {
    try {
      await fetch(`/api/${tab}/${id}`, { method: "DELETE" });
      if (tab === "trades" || tab === "forex") setTrades(trades.filter(t => t._id !== id));
      if (tab === "cash") setCash(cash.filter(c => c._id !== id));
    } catch (err) {
      console.error("Failed to delete entry", err);
    }
  };

  const addEntry = async () => {
    const tab = activeTab === "crypto" || activeTab === "trades" ? "trades" : activeTab;
    let payload = { ...newEntry };
    if (tab !== "cash") {
      payload.quantity = Number(payload.quantity);
      payload.price = Number(payload.price);
      payload.fee = Number(payload.fee);
    } else {
      payload.amount = Number(payload.amount);
    }

    try {
      const res = await fetch(`/api/${tab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saved = tab === "cash" ? payload : calcTrade({ ...payload, _id: (await res.json())._id });
      if (tab === "trades" || tab === "forex") setTrades((prev) => [saved, ...prev]);
      if (tab === "cash") setCash((prev) => [saved, ...prev]);
      setCurrentPage(1);
    } catch (err) {
      console.error("Failed to add entry", err);
    }
  };

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") direction = "desc";
    setSortConfig({ key, direction });
  };

  const applySortAndFilter = (data) => {
    let filtered = data.filter((t) => {
      if (activeTab !== "cash") {
        return (
          (!filters.ticker || t.ticker.includes(filters.ticker.toUpperCase())) &&
          (!filters.date || t.date === filters.date) &&
          (!filters.qty || t.quantity === Number(filters.qty)) &&
          (!filters.broker || t.broker === filters.broker) &&
          (!filters.currency || t.currency === filters.currency)
        );
      } else {
        return (!filters.date || t.date === filters.date) &&
          (!filters.currency || t.currency === filters.currency);
      }
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const valA = a[sortConfig.key] ?? 0;
        const valB = b[sortConfig.key] ?? 0;
        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  };

  const currentData = () => {
    if (activeTab === "cash") return applySortAndFilter(cash);
    if (activeTab === "forex") return applySortAndFilter(forex);
    return applySortAndFilter(trades.filter(t => t.type === activeTab));
  };

  const groupedByCurrency = currentData().reduce((acc, t) => {
    const key = activeTab === "cash" ? t.currency : `${t.ticker}_${t.currency}`;
    acc[key] = acc[key] || [];
    acc[key].push(t);
    return acc;
  }, {});

  const totalsByCurrency = Object.values(groupedByCurrency).reduce((acc, rows) => {
    const currency = rows[0].currency;
    const subtotal = rows.reduce((a, t) => {
      if (activeTab === "cash") {
        return { qty: 0, proceeds: a.proceeds + t.amount, fee: 0, realisedPL: 0 };
      } else {
        return {
          qty: a.qty + (t.quantity || 0),
          proceeds: a.proceeds + (t.proceeds || 0),
          fee: a.fee + (t.fee || 0),
          realisedPL: a.realisedPL + (t.realisedPL || 0),
        };
      }
    }, { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 });

    acc[currency] = acc[currency] || { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 };
    acc[currency].qty += subtotal.qty;
    acc[currency].proceeds += subtotal.proceeds;
    acc[currency].fee += subtotal.fee;
    acc[currency].realisedPL += subtotal.realisedPL;
    return acc;
  }, {});

  const grandTotalInBase = Object.entries(totalsByCurrency).reduce((acc, [currency, totals]) => {
    const rate = EXCHANGE_RATES[currency] ?? 1;
    const convert = (val) => (val * rate) / EXCHANGE_RATES[baseCurrency];
    return {
      qty: acc.qty + totals.qty,
      proceeds: acc.proceeds + convert(totals.proceeds),
      fee: acc.fee + convert(totals.fee),
      realisedPL: acc.realisedPL + convert(totals.realisedPL),
    };
  }, { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 });

  // Pagination
  const totalPages = Math.ceil(currentData().length / rowLimit);
  const paginatedData = currentData().slice((currentPage - 1) * rowLimit, currentPage * rowLimit);

  return (
    <div className="ledger-page">
      {/* Tabs */}
      <div className="ledger-tabs">
        <button className={activeTab === "trades" ? "active" : ""} onClick={() => setActiveTab("trades")}>Trades</button>
        <button className={activeTab === "crypto" ? "active" : ""} onClick={() => setActiveTab("crypto")}>Crypto</button>
        <button className={activeTab === "forex" ? "active" : ""} onClick={() => setActiveTab("forex")}>Forex</button>
        <button className={activeTab === "cash" ? "active" : ""} onClick={() => setActiveTab("cash")}>Cash</button>
      </div>

      {/* Base currency */}
      <div className="base-currency-selector-container">
        Base currency:{" "}
        <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)} className="base-currency-selector">
          {Object.keys(EXCHANGE_RATES).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Add Entry Box */}
      {(activeTab !== "cash" || activeTab === "cash") && (
        <div className="ledger-entry-box">
          <h4>Add New {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h4>
          <div className="ledger-entry-fields">
            {activeTab !== "cash" && <input placeholder="Ticker" value={newEntry.ticker} onChange={e => setNewEntry({ ...newEntry, ticker: e.target.value.toUpperCase(), type: activeTab })} />}
            <input type="date" value={newEntry.date} onChange={e => setNewEntry({ ...newEntry, date: e.target.value })} />
            {activeTab !== "cash" && <>
              <input type="number" placeholder="Qty" value={newEntry.quantity} onChange={e => setNewEntry({ ...newEntry, quantity: e.target.value })} />
              <div className="price-fee-wrapper">
                <input type="number" placeholder="Price" value={newEntry.price} onChange={e => setNewEntry({ ...newEntry, price: e.target.value })} />
                <select value={newEntry.currency} onChange={e => setNewEntry({ ...newEntry, currency: e.target.value })}>
                  <option>USD</option><option>AUD</option><option>EUR</option>
                </select>
              </div>
              <div className="price-fee-wrapper">
                <input type="number" placeholder="Fee" value={newEntry.fee} onChange={e => setNewEntry({ ...newEntry, fee: e.target.value })} />
                <select value={newEntry.currency} onChange={e => setNewEntry({ ...newEntry, currency: e.target.value })}>
                  <option>USD</option><option>AUD</option><option>EUR</option>
                </select>
              </div>
              <select value={newEntry.broker} onChange={e => setNewEntry({ ...newEntry, broker: e.target.value })}>
                <option>IBKR</option><option>CMC</option><option>Stake</option>
              </select>
            </>}
            {activeTab === "cash" && <select value={newEntry.entryType} onChange={e => setNewEntry({ ...newEntry, entryType: e.target.value })}>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>}
            <button onClick={addEntry}>Add {activeTab}</button>
          </div>
        </div>
      )}

      {/* Ledger Table */}
      <table className="ledger-table">
        <thead>
          <tr>
            {activeTab !== "cash" && <th onClick={() => handleSort("ticker")}>Ticker {sortConfig.key === "ticker" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>}
            <th onClick={() => handleSort("date")}>Date {sortConfig.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>
            {activeTab !== "cash" && <th onClick={() => handleSort("quantity")}>Qty {sortConfig.key === "quantity" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>}
            {activeTab !== "cash" && <th onClick={() => handleSort("price")}>Price {sortConfig.key === "price" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>}
            <th onClick={() => handleSort("proceeds")}>{activeTab==="cash"?"Amount":"Proceeds"} {sortConfig.key === "proceeds" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>
            {activeTab !== "cash" && <th onClick={() => handleSort("fee")}>Fee {sortConfig.key === "fee" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>}
            {activeTab !== "cash" && <th onClick={() => handleSort("realisedPL")}>Realised P/L {sortConfig.key === "realisedPL" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>}
            {activeTab !== "cash" && <th onClick={() => handleSort("broker")}>Broker {sortConfig.key === "broker" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}</th>}
            <th>Currency</th>
            <th></th>
          </tr>
          {/* Filter row */}
          <tr className="ledger-filter-row">
            {activeTab !== "cash" && <td><input type="text" placeholder="Filter Ticker" value={filters.ticker} onChange={e => setFilters({...filters, ticker: e.target.value})} /></td>}
            <td><input type="date" value={filters.date} onChange={e => setFilters({...filters, date: e.target.value})} /></td>
            {activeTab !== "cash" && <td><input type="number" placeholder="Qty" value={filters.qty} onChange={e => setFilters({...filters, qty: e.target.value})} /></td>}
            {activeTab !== "cash" && <td></td>}
            <td></td>
            {activeTab !== "cash" && <td></td>}
            {activeTab !== "cash" && <td></td>}
            {activeTab !== "cash" && <td>
              <select value={filters.broker} onChange={e => setFilters({...filters, broker: e.target.value})}>
                <option value="">All</option>
                <option>IBKR</option>
                <option>CMC</option>
                <option>Stake</option>
              </select>
            </td>}
            <td>
              <select value={filters.currency} onChange={e => setFilters({...filters, currency: e.target.value})}>
                <option value="">All</option>
                <option>USD</option>
                <option>AUD</option>
                <option>EUR</option>
              </select>
            </td>
            <td></td>
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupedByCurrency).map(([key, rows]) => {
            const currency = rows[0].currency;
            const subtotal = rows.reduce((a, t) => {
              if (activeTab === "cash") return { qty: 0, proceeds: a.proceeds + t.amount, fee: 0, realisedPL: 0 };
              return { qty: a.qty + (t.quantity || 0), proceeds: a.proceeds + t.proceeds, fee: a.fee + t.fee, realisedPL: a.realisedPL + t.realisedPL };
            }, { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 });

            return (
              <React.Fragment key={key}>
                <tr className="ledger-subtotal" onClick={() => toggleRow(key)}>
                  {activeTab !== "cash" && <td><strong>{rows[0].ticker}</strong></td>}
                  <td colSpan={activeTab !== "cash"?1:0}>{/* empty */}</td>
                  {activeTab !== "cash" && <td><strong>{subtotal.qty}</strong></td>}
                  {activeTab !== "cash" && <td></td>}
                  <td>{subtotal.proceeds.toFixed(2)}</td>
                  {activeTab !== "cash" && <td>{subtotal.fee.toFixed(2)}</td>}
                  {activeTab !== "cash" && <td>{subtotal.realisedPL.toFixed(2)}</td>}
                  {activeTab !== "cash" && <td></td>}
                  <td>{currency}</td>
                  <td>{collapsed[key] ? "▼" : "▲"}</td>
                </tr>

                {!collapsed[key] && rows.slice((currentPage - 1) * rowLimit, currentPage * rowLimit).map(t => (
                  <tr key={t._id}>
                    {activeTab !== "cash" && <td>{t.ticker}</td>}
                    <td>{t.date}</td>
                    {activeTab !== "cash" && <td>{t.quantity || 0}</td>}
                    {activeTab !== "cash" && <td>{t.price || 0}</td>}
                    <td>{activeTab === "cash" ? t.amount.toFixed(2) : t.proceeds.toFixed(2)}</td>
                    {activeTab !== "cash" && <td>{t.fee.toFixed(2)}</td>}
                    {activeTab !== "cash" && <td>{t.realisedPL.toFixed(2)}</td>}
                    {activeTab !== "cash" && <td><span className={`broker-tag ${t.broker?.toLowerCase()}`}>{t.broker}</span></td>}
                    <td>{t.currency}</td>
                    <td><button className="icon-btn" onClick={() => deleteEntry(t._id, activeTab === "crypto" || activeTab === "trades"?"trades":activeTab)}>✕</button></td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}

          <tr className="ledger-grand-total">
            <td colSpan={activeTab !== "cash"? (activeTab!=="cash"?4:1):1}><strong>Grand Total ({baseCurrency})</strong></td>
            <td>{grandTotalInBase.proceeds.toFixed(2)}</td>
            {activeTab !== "cash" && <td>{grandTotalInBase.fee.toFixed(2)}</td>}
            {activeTab !== "cash" && <td>{grandTotalInBase.realisedPL.toFixed(2)}</td>}
            <td colSpan="3"></td>
          </tr>
        </tbody>
      </table>

      {/* Pagination & Rows per page */}
      <div className="ledger-controls-bottom">
        <label>
          Rows per page:
          <select value={rowLimit} onChange={e => { setRowLimit(Number(e.target.value)); setCurrentPage(1); }}>
            {[25,50,100,500,1000].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="ledger-pagination">
          <button disabled={currentPage===1} onClick={()=>setCurrentPage(currentPage-1)}>Prev</button>
          {Array.from({length:totalPages},(_,i)=><button key={i+1} className={currentPage===i+1?"active":""} onClick={()=>setCurrentPage(i+1)}>{i+1}</button>)}
          <button disabled={currentPage===totalPages} onClick={()=>setCurrentPage(currentPage+1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
