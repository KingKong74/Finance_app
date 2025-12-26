import React, { useEffect, useMemo, useState } from "react";
import "../../../css/ledgerTab.css";
import ImportModal from "./components/ImportModal.jsx";

const EXCHANGE_RATES = { USD: 1.65, EUR: 1.8, AUD: 1 };

function normaliseRow(row, tab) {
  if (tab === "cash") {
    const amount = Number(row.amount || 0);
    return {
      ...row,
      amount,
      currency: row.currency || "AUD",
      entryType: row.entryType || (amount >= 0 ? "deposit" : "withdrawal"),
    };
  }

  const quantity = Number(row.quantity || 0);
  const price = Number(row.price || 0);
  const fee = Number(row.fee || 0);
  const realisedPL = Number(row.realisedPL || 0);

  const proceeds = quantity * price;
  const basis = proceeds - fee;

  return {
    ...row,
    ticker: row.ticker || row.symbol || "",
    quantity,
    price,
    fee,
    realisedPL,
    proceeds,
    basis,
    currency: row.currency || "USD",
    broker: row.broker || "IBKR",
  };
}

function safeUpper(s) {
  return String(s || "").toUpperCase();
}

export default function Ledger() {
  const [activeTab, setActiveTab] = useState("trades");
  const [rowLimit, setRowLimit] = useState(25);
  const [collapsed, setCollapsed] = useState({});
  const [entries, setEntries] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState("AUD");

  const [showImport, setShowImport] = useState(false);

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

  const [newEntry, setNewEntry] = useState({
    ticker: "",
    date: "",
    quantity: "",
    price: "",
    fee: "",
    broker: "IBKR",
    currency: "USD",
    // cash fields
    amount: "",
    entryType: "deposit",
  });

  useEffect(() => {
    fetchData();
    // reset UI bits when switching tabs
    setCollapsed({});
    setCurrentPage(1);
    setFilters({ ticker: "", date: "", qty: "", broker: "", currency: "" });
    setSortConfig({ key: "", direction: "asc" });
  }, [activeTab]);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/ledger?tab=${activeTab}`);
      if (!res.ok) throw new Error(`GET failed: ${res.status}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      setEntries(arr.map((row) => normaliseRow(row, activeTab)));
    } catch (err) {
      console.error("Failed to fetch ledger data:", err);
    }
  };

  const addEntry = async () => {
    try {
      const payload =
        activeTab === "cash"
          ? {
              date: newEntry.date,
              amount: Number(newEntry.amount || 0),
              currency: newEntry.currency,
              entryType: newEntry.entryType,
              note: newEntry.note || "",
            }
          : {
              ticker: safeUpper(newEntry.ticker),
              date: newEntry.date,
              quantity: Number(newEntry.quantity || 0),
              price: Number(newEntry.price || 0),
              fee: Math.abs(Number(newEntry.fee || 0)),
              broker: newEntry.broker,
              currency: newEntry.currency,
              realisedPL: 0,
            };

      const res = await fetch(`/api/ledger?tab=${activeTab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`POST failed: ${res.status}`);

      const json = await res.json();
      const saved = normaliseRow({ ...payload, _id: json._id }, activeTab);

      setEntries((prev) => [saved, ...prev]);
      setCurrentPage(1);

      // keep currency/broker, clear the rest
      setNewEntry((prev) => ({
        ...prev,
        ticker: "",
        date: "",
        quantity: "",
        price: "",
        fee: "",
        amount: "",
      }));
    } catch (err) {
      console.error("Failed to add entry:", err);
    }
  };

  const deleteEntry = async (id) => {
    try {
      const res = await fetch(`/api/ledger/${id}?tab=${activeTab}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
      setEntries((prev) => prev.filter((x) => x._id !== id));
    } catch (err) {
      console.error("Failed to delete entry:", err);
    }
  };

  const handleSort = (key) => {
    setSortConfig((prev) => {
      const direction =
        prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      return { key, direction };
    });
  };

  const filteredAndSorted = useMemo(() => {
    const f = filters;

    let out = entries.filter((r) => {
      if (activeTab === "cash") {
        return (
          (!f.date || String(r.date) === f.date) &&
          (!f.currency || r.currency === f.currency)
        );
      }

      return (
        (!f.ticker || safeUpper(r.ticker).includes(safeUpper(f.ticker))) &&
        (!f.date || String(r.date) === f.date) &&
        (!f.qty || Number(r.quantity) === Number(f.qty)) &&
        (!f.broker || r.broker === f.broker) &&
        (!f.currency || r.currency === f.currency)
      );
    });

    if (sortConfig.key) {
      out.sort((a, b) => {
        const va = a[sortConfig.key];
        const vb = b[sortConfig.key];

        // string compare for ticker/broker/date
        const isString =
          typeof va === "string" || typeof vb === "string" || sortConfig.key === "date";
        if (isString) {
          const sa = String(va ?? "");
          const sb = String(vb ?? "");
          if (sa < sb) return sortConfig.direction === "asc" ? -1 : 1;
          if (sa > sb) return sortConfig.direction === "asc" ? 1 : -1;
          return 0;
        }

        const na = Number(va ?? 0);
        const nb = Number(vb ?? 0);
        if (na < nb) return sortConfig.direction === "asc" ? -1 : 1;
        if (na > nb) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return out;
  }, [entries, filters, sortConfig, activeTab]);

  const grouped = useMemo(() => {
    return filteredAndSorted.reduce((acc, r) => {
      const key = activeTab === "cash" ? r.currency : `${r.ticker}_${r.currency}`;
      (acc[key] ||= []).push(r);
      return acc;
    }, {});
  }, [filteredAndSorted, activeTab]);

  const totalsByCurrency = useMemo(() => {
    return Object.values(grouped).reduce((acc, rows) => {
      const currency = rows[0]?.currency || "AUD";

      const subtotal = rows.reduce(
        (a, r) => {
          if (activeTab === "cash") {
            return { qty: 0, proceeds: a.proceeds + (r.amount || 0), fee: 0, realisedPL: 0 };
          }
          return {
            qty: a.qty + (r.quantity || 0),
            proceeds: a.proceeds + (r.proceeds || 0),
            fee: a.fee + (r.fee || 0),
            realisedPL: a.realisedPL + (r.realisedPL || 0),
          };
        },
        { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
      );

      acc[currency] ||= { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 };
      acc[currency].qty += subtotal.qty;
      acc[currency].proceeds += subtotal.proceeds;
      acc[currency].fee += subtotal.fee;
      acc[currency].realisedPL += subtotal.realisedPL;
      return acc;
    }, {});
  }, [grouped, activeTab]);

  const grandTotalInBase = useMemo(() => {
    return Object.entries(totalsByCurrency).reduce(
      (acc, [currency, totals]) => {
        const rate = EXCHANGE_RATES[currency] ?? 1;
        const baseRate = EXCHANGE_RATES[baseCurrency] ?? 1;
        const convert = (val) => (Number(val || 0) * rate) / baseRate;

        return {
          qty: acc.qty + Number(totals.qty || 0),
          proceeds: acc.proceeds + convert(totals.proceeds),
          fee: acc.fee + convert(totals.fee),
          realisedPL: acc.realisedPL + convert(totals.realisedPL),
        };
      },
      { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
    );
  }, [totalsByCurrency, baseCurrency]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / rowLimit));

  const toggleRow = (key) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sortArrow = (key) =>
    sortConfig.key === key ? (sortConfig.direction === "asc" ? "↑" : "↓") : "";

  return (
    <div className="ledger-page">
      {/* Tabs */}
      <div className="ledger-tabs">
        {["trades", "crypto", "forex", "cash"].map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Base currency (below tabs) */}
      <div className="base-currency-selector-container">
        Base currency:{" "}
        <select
          value={baseCurrency}
          onChange={(e) => setBaseCurrency(e.target.value)}
          className="base-currency-selector"
        >
          {Object.keys(EXCHANGE_RATES).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <button
          style={{ marginLeft: 10 }}
          onClick={() => setShowImport(true)}
        >
          Import (IBKR)
        </button>
      </div>

      {/* Add Entry */}
      <div className="ledger-entry-box">
        <h4>Add New {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h4>
        <div className="ledger-entry-fields">
          {activeTab !== "cash" ? (
            <>
              <input
                placeholder="Ticker"
                value={newEntry.ticker}
                onChange={(e) =>
                  setNewEntry((p) => ({ ...p, ticker: e.target.value.toUpperCase() }))
                }
              />
              <input
                type="date"
                value={newEntry.date}
                onChange={(e) => setNewEntry((p) => ({ ...p, date: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Qty"
                value={newEntry.quantity}
                onChange={(e) => setNewEntry((p) => ({ ...p, quantity: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Price"
                value={newEntry.price}
                onChange={(e) => setNewEntry((p) => ({ ...p, price: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Fee"
                value={newEntry.fee}
                onChange={(e) => setNewEntry((p) => ({ ...p, fee: e.target.value }))}
              />

              <select
                value={newEntry.currency}
                onChange={(e) => setNewEntry((p) => ({ ...p, currency: e.target.value }))}
              >
                <option>USD</option>
                <option>AUD</option>
                <option>EUR</option>
              </select>

              <select
                value={newEntry.broker}
                onChange={(e) => setNewEntry((p) => ({ ...p, broker: e.target.value }))}
              >
                <option>IBKR</option>
                <option>CMC</option>
                <option>Stake</option>
              </select>
            </>
          ) : (
            <>
              <input
                type="date"
                value={newEntry.date}
                onChange={(e) => setNewEntry((p) => ({ ...p, date: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Amount"
                value={newEntry.amount}
                onChange={(e) => setNewEntry((p) => ({ ...p, amount: e.target.value }))}
              />
              <select
                value={newEntry.entryType}
                onChange={(e) => setNewEntry((p) => ({ ...p, entryType: e.target.value }))}
              >
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
              <select
                value={newEntry.currency}
                onChange={(e) => setNewEntry((p) => ({ ...p, currency: e.target.value }))}
              >
                <option>USD</option>
                <option>AUD</option>
                <option>EUR</option>
              </select>
            </>
          )}

          <button onClick={addEntry}>Add {activeTab}</button>
        </div>
      </div>

      {/* Table */}
      <table className="ledger-table">
        <thead>
          <tr>
            {activeTab !== "cash" && (
              <th onClick={() => handleSort("ticker")}>
                Ticker {sortArrow("ticker")}
              </th>
            )}
            <th onClick={() => handleSort("date")}>Date {sortArrow("date")}</th>
            {activeTab !== "cash" && (
              <th onClick={() => handleSort("quantity")}>
                Qty {sortArrow("quantity")}
              </th>
            )}
            {activeTab !== "cash" && (
              <th onClick={() => handleSort("price")}>
                Price {sortArrow("price")}
              </th>
            )}
            <th onClick={() => handleSort(activeTab === "cash" ? "amount" : "proceeds")}>
              {activeTab === "cash" ? "Amount" : "Proceeds"}{" "}
              {sortArrow(activeTab === "cash" ? "amount" : "proceeds")}
            </th>
            {activeTab !== "cash" && (
              <th onClick={() => handleSort("fee")}>Fee {sortArrow("fee")}</th>
            )}
            {activeTab !== "cash" && (
              <th onClick={() => handleSort("realisedPL")}>
                Realised P/L {sortArrow("realisedPL")}
              </th>
            )}
            {activeTab !== "cash" && (
              <th onClick={() => handleSort("broker")}>
                Broker {sortArrow("broker")}
              </th>
            )}
            <th>Currency</th>
            <th></th>
          </tr>

          {/* Filter row */}
          <tr className="ledger-filter-row">
            {activeTab !== "cash" && (
              <td>
                <input
                  placeholder="Filter Ticker"
                  value={filters.ticker}
                  onChange={(e) => setFilters((p) => ({ ...p, ticker: e.target.value }))}
                />
              </td>
            )}
            <td>
              <input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters((p) => ({ ...p, date: e.target.value }))}
              />
            </td>
            {activeTab !== "cash" && (
              <td>
                <input
                  type="number"
                  placeholder="Qty"
                  value={filters.qty}
                  onChange={(e) => setFilters((p) => ({ ...p, qty: e.target.value }))}
                />
              </td>
            )}
            {activeTab !== "cash" && <td></td>}
            <td></td>
            {activeTab !== "cash" && <td></td>}
            {activeTab !== "cash" && <td></td>}
            {activeTab !== "cash" && (
              <td>
                <select
                  value={filters.broker}
                  onChange={(e) => setFilters((p) => ({ ...p, broker: e.target.value }))}
                >
                  <option value="">All</option>
                  <option>IBKR</option>
                  <option>CMC</option>
                  <option>Stake</option>
                </select>
              </td>
            )}
            <td>
              <select
                value={filters.currency}
                onChange={(e) => setFilters((p) => ({ ...p, currency: e.target.value }))}
              >
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
          {Object.entries(grouped).map(([key, rows]) => {
            const currency = rows[0]?.currency || "";
            const subtotal = rows.reduce(
              (a, r) => {
                if (activeTab === "cash") {
                  return { qty: 0, proceeds: a.proceeds + (r.amount || 0), fee: 0, realisedPL: 0 };
                }
                return {
                  qty: a.qty + (r.quantity || 0),
                  proceeds: a.proceeds + (r.proceeds || 0),
                  fee: a.fee + (r.fee || 0),
                  realisedPL: a.realisedPL + (r.realisedPL || 0),
                };
              },
              { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
            );

            return (
              <React.Fragment key={key}>
                <tr className="ledger-subtotal" onClick={() => toggleRow(key)}>
                  {activeTab !== "cash" && (
                    <td>
                      <strong>{rows[0].ticker}</strong>
                    </td>
                  )}
                  <td colSpan={activeTab !== "cash" ? 1 : 0}></td>
                  {activeTab !== "cash" && <td><strong>{subtotal.qty}</strong></td>}
                  {activeTab !== "cash" && <td></td>}
                  <td>{subtotal.proceeds.toFixed(2)}</td>
                  {activeTab !== "cash" && <td>{subtotal.fee.toFixed(2)}</td>}
                  {activeTab !== "cash" && <td>{subtotal.realisedPL.toFixed(2)}</td>}
                  {activeTab !== "cash" && <td></td>}
                  <td>{currency}</td>
                  <td>{collapsed[key] ? "▼" : "▲"}</td>
                </tr>

                {!collapsed[key] &&
                  rows
                    .slice((currentPage - 1) * rowLimit, currentPage * rowLimit)
                    .map((r) => (
                      <tr key={r._id}>
                        {activeTab !== "cash" && <td>{r.ticker}</td>}
                        <td>{r.date}</td>
                        {activeTab !== "cash" && <td>{r.quantity}</td>}
                        {activeTab !== "cash" && <td>{r.price}</td>}
                        <td>
                          {activeTab === "cash"
                            ? Number(r.amount || 0).toFixed(2)
                            : Number(r.proceeds || 0).toFixed(2)}
                        </td>
                        {activeTab !== "cash" && <td>{Number(r.fee || 0).toFixed(2)}</td>}
                        {activeTab !== "cash" && <td>{Number(r.realisedPL || 0).toFixed(2)}</td>}
                        {activeTab !== "cash" && (
                          <td>
                            <span className={`broker-tag ${String(r.broker || "").toLowerCase()}`}>
                              {r.broker}
                            </span>
                          </td>
                        )}
                        <td>{r.currency}</td>
                        <td>
                          <button className="icon-btn" onClick={() => deleteEntry(r._id)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
              </React.Fragment>
            );
          })}

          <tr className="ledger-grand-total">
            <td colSpan={activeTab !== "cash" ? 4 : 1}>
              <strong>Grand Total ({baseCurrency})</strong>
            </td>
            <td>{grandTotalInBase.proceeds.toFixed(2)}</td>
            {activeTab !== "cash" && <td>{grandTotalInBase.fee.toFixed(2)}</td>}
            {activeTab !== "cash" && <td>{grandTotalInBase.realisedPL.toFixed(2)}</td>}
            <td colSpan="3"></td>
          </tr>
        </tbody>
      </table>

      {/* Pagination */}
      <div className="ledger-controls-bottom">
        <label>
          Rows per page:
          <select
            value={rowLimit}
            onChange={(e) => {
              setRowLimit(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            {[25, 50, 100, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div className="ledger-pagination">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>
            Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i + 1}
              className={currentPage === i + 1 ? "active" : ""}
              onClick={() => setCurrentPage(i + 1)}
            >
              {i + 1}
            </button>
          ))}
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {/* Import modal */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={async () => {
            await fetchData();
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}
