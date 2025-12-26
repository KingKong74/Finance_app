import React, { useState, useEffect, useMemo } from "react";
import "../../../css/ledgerTab.css";

const EXCHANGE_RATES = { USD: 1.65, EUR: 1.8, AUD: 1 };

async function safeJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    // If Vercel returns an HTML error page, you'll see it here
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 120)}`);
  }
}

export default function Ledger() {
  const [activeTab, setActiveTab] = useState("trades");
  const [rowLimit, setRowLimit] = useState(25);
  const [collapsed, setCollapsed] = useState({});
  const [entries, setEntries] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState("AUD");

  const [newEntry, setNewEntry] = useState({
    ticker: "",
    date: "",
    quantity: "",
    price: "",
    fee: "",
    broker: "IBKR",
    currency: "USD",
    type: "stock", // stock / crypto / cash / forex (frontend only)
    entryType: "deposit", // cash: deposit / withdrawal
    amount: "",
  });

  const [filters, setFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "asc" });
  const [currentPage, setCurrentPage] = useState(1);

  // ------------------------
  // API wiring (matches /api/ledger/index.js and /api/ledger/[id].js)
  // ------------------------

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/ledger?tab=${activeTab}`);
      if (!res.ok) throw new Error(`GET failed: ${res.status}`);

      const data = await safeJson(res);
      const arr = Array.isArray(data) ? data : [];

      const normalised = arr.map((row) => normaliseRow(row, activeTab));
      setEntries(normalised);
      setCurrentPage(1);
    } catch (err) {
      console.error("Failed to fetch ledger data:", err);
    }
  };

  const addEntry = async () => {
    try {
      const payload = buildPayloadForTab(newEntry, activeTab);

      const res = await fetch(`/api/ledger?tab=${activeTab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`POST failed: ${res.status} - ${msg}`);
      }

      const json = await safeJson(res);
      const insertedId = json?._id;

      const saved = normaliseRow({ ...payload, _id: insertedId }, activeTab);
      setEntries((prev) => [saved, ...prev]);
      setCurrentPage(1);

      // Optional: clear inputs (I keep date/currency/broker to speed entry)
      setNewEntry((prev) => ({
        ...prev,
        ticker: "",
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
      // IMPORTANT: delete must hit /api/ledger/[id]?tab=...
      const res = await fetch(`/api/ledger/${id}?tab=${activeTab}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`DELETE failed: ${res.status} - ${msg}`);
      }

      setEntries((prev) => prev.filter((t) => t._id !== id));
    } catch (err) {
      console.error("Failed to delete entry:", err);
    }
  };

  // ------------------------
  // Helpers
  // ------------------------

  function buildPayloadForTab(entry, tab) {
    if (tab === "cash") {
      return {
        date: entry.date,
        amount: Number(entry.amount || 0),
        currency: entry.currency || "AUD",
        entryType: entry.entryType || "deposit",
        note: entry.note || "",
      };
    }

    // trades/crypto/forex
    return {
      ticker: (entry.ticker || "").toUpperCase(),
      date: entry.date,
      quantity: Number(entry.quantity || 0),
      price: Number(entry.price || 0),
      fee: Number(entry.fee || 0),
      broker: entry.broker || "IBKR",
      currency: entry.currency || "USD",
      realisedPL: Number(entry.realisedPL || 0),
      // backend sets "type" based on tab; but it's fine to send too
      type: tab,
    };
  }

  function normaliseRow(row, tab) {
    if (tab === "cash") {
      return {
        ...row,
        amount: Number(row.amount || 0),
        currency: row.currency || "AUD",
        entryType: row.entryType || "deposit",
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
      ticker: (row.ticker || "").toUpperCase(),
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

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") direction = "desc";
    setSortConfig({ key, direction });
  };

  const applySortAndFilter = (data) => {
    const f = filters || {};

    let filtered = data.filter((t) => {
      if (activeTab === "cash") {
        return (
          (!f.date || t.date === f.date) &&
          (!f.currency || t.currency === f.currency)
        );
      }

      return (
        (!f.ticker || (t.ticker || "").includes((f.ticker || "").toUpperCase())) &&
        (!f.date || t.date === f.date) &&
        (!f.qty || Number(t.quantity) === Number(f.qty)) &&
        (!f.broker || t.broker === f.broker) &&
        (!f.currency || t.currency === f.currency)
      );
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const valA = a[sortConfig.key] ?? 0;
        const valB = b[sortConfig.key] ?? 0;

        // string-aware sort for ticker/broker/currency/date
        const isString = typeof valA === "string" || typeof valB === "string";
        if (isString) {
          const sa = String(valA ?? "");
          const sb = String(valB ?? "");
          if (sa < sb) return sortConfig.direction === "asc" ? -1 : 1;
          if (sa > sb) return sortConfig.direction === "asc" ? 1 : -1;
          return 0;
        }

        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  };

  const currentData = useMemo(() => applySortAndFilter(entries), [entries, filters, sortConfig, activeTab]);

  const groupedByCurrency = useMemo(() => {
    return currentData.reduce((acc, t) => {
      const key = activeTab === "cash" ? t.currency : `${t.ticker}_${t.currency}`;
      acc[key] = acc[key] || [];
      acc[key].push(t);
      return acc;
    }, {});
  }, [currentData, activeTab]);

  const totalsByCurrency = useMemo(() => {
    return Object.values(groupedByCurrency).reduce((acc, rows) => {
      const currency = rows[0]?.currency || "AUD";

      const subtotal = rows.reduce(
        (a, t) => {
          if (activeTab === "cash") {
            return { qty: 0, proceeds: a.proceeds + (t.amount || 0), fee: 0, realisedPL: 0 };
          }
          return {
            qty: a.qty + (t.quantity || 0),
            proceeds: a.proceeds + (t.proceeds || 0),
            fee: a.fee + (t.fee || 0),
            realisedPL: a.realisedPL + (t.realisedPL || 0),
          };
        },
        { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
      );

      acc[currency] = acc[currency] || { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 };
      acc[currency].qty += subtotal.qty;
      acc[currency].proceeds += subtotal.proceeds;
      acc[currency].fee += subtotal.fee;
      acc[currency].realisedPL += subtotal.realisedPL;
      return acc;
    }, {});
  }, [groupedByCurrency, activeTab]);

  const grandTotalInBase = useMemo(() => {
    return Object.entries(totalsByCurrency).reduce(
      (acc, [currency, totals]) => {
        const rate = EXCHANGE_RATES[currency] ?? 1;
        const baseRate = EXCHANGE_RATES[baseCurrency] ?? 1;
        const convert = (val) => (val * rate) / baseRate;

        return {
          qty: acc.qty + (totals.qty || 0),
          proceeds: acc.proceeds + convert(totals.proceeds || 0),
          fee: acc.fee + convert(totals.fee || 0),
          realisedPL: acc.realisedPL + convert(totals.realisedPL || 0),
        };
      },
      { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
    );
  }, [totalsByCurrency, baseCurrency]);

  const totalPages = Math.max(1, Math.ceil(currentData.length / rowLimit));

  const toggleRow = (key) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

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

      {/* Base currency */}
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
      </div>

      {/* Add Entry */}
      <div className="ledger-entry-box">
        <h4>Add New {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h4>
        <div className="ledger-entry-fields">
          {activeTab !== "cash" && (
            <input
              placeholder="Ticker"
              value={newEntry.ticker}
              onChange={(e) =>
                setNewEntry({
                  ...newEntry,
                  ticker: e.target.value.toUpperCase(),
                  type: activeTab,
                })
              }
            />
          )}

          <input
            type="date"
            value={newEntry.date}
            onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
          />

          {activeTab !== "cash" ? (
            <>
              <input
                type="number"
                placeholder="Qty"
                value={newEntry.quantity}
                onChange={(e) => setNewEntry({ ...newEntry, quantity: e.target.value })}
              />
              <input
                type="number"
                placeholder="Price"
                value={newEntry.price}
                onChange={(e) => setNewEntry({ ...newEntry, price: e.target.value })}
              />
              <input
                type="number"
                placeholder="Fee"
                value={newEntry.fee}
                onChange={(e) => setNewEntry({ ...newEntry, fee: e.target.value })}
              />

              <select
                value={newEntry.currency}
                onChange={(e) => setNewEntry({ ...newEntry, currency: e.target.value })}
              >
                <option>USD</option>
                <option>AUD</option>
                <option>EUR</option>
              </select>

              <select
                value={newEntry.broker}
                onChange={(e) => setNewEntry({ ...newEntry, broker: e.target.value })}
              >
                <option>IBKR</option>
                <option>CMC</option>
                <option>Stake</option>
              </select>
            </>
          ) : (
            <>
              <input
                type="number"
                placeholder="Amount"
                value={newEntry.amount}
                onChange={(e) => setNewEntry({ ...newEntry, amount: e.target.value })}
              />

              <select
                value={newEntry.entryType}
                onChange={(e) => setNewEntry({ ...newEntry, entryType: e.target.value })}
              >
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>

              <select
                value={newEntry.currency}
                onChange={(e) => setNewEntry({ ...newEntry, currency: e.target.value })}
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

      {/* Ledger Table */}
      <table className="ledger-table">
        <thead>
          <tr>
            {activeTab !== "cash" && (
              <th onClick={() => handleSort("ticker")}>
                Ticker{" "}
                {sortConfig.key === "ticker" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
              </th>
            )}

            <th onClick={() => handleSort("date")}>
              Date{" "}
              {sortConfig.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
            </th>

            {activeTab !== "cash" && (
              <th onClick={() => handleSort("quantity")}>
                Qty{" "}
                {sortConfig.key === "quantity"
                  ? sortConfig.direction === "asc"
                    ? "↑"
                    : "↓"
                  : ""}
              </th>
            )}

            {activeTab !== "cash" && (
              <th onClick={() => handleSort("price")}>
                Price{" "}
                {sortConfig.key === "price" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
              </th>
            )}

            <th onClick={() => handleSort("proceeds")}>
              {activeTab === "cash" ? "Amount" : "Proceeds"}{" "}
              {sortConfig.key === "proceeds"
                ? sortConfig.direction === "asc"
                  ? "↑"
                  : "↓"
                : ""}
            </th>

            {activeTab !== "cash" && (
              <th onClick={() => handleSort("fee")}>
                Fee{" "}
                {sortConfig.key === "fee" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
              </th>
            )}

            {activeTab !== "cash" && (
              <th onClick={() => handleSort("realisedPL")}>
                Realised P/L{" "}
                {sortConfig.key === "realisedPL"
                  ? sortConfig.direction === "asc"
                    ? "↑"
                    : "↓"
                  : ""}
              </th>
            )}

            {activeTab !== "cash" && (
              <th onClick={() => handleSort("broker")}>
                Broker{" "}
                {sortConfig.key === "broker"
                  ? sortConfig.direction === "asc"
                    ? "↑"
                    : "↓"
                  : ""}
              </th>
            )}

            <th onClick={() => handleSort("currency")}>
              Currency{" "}
              {sortConfig.key === "currency"
                ? sortConfig.direction === "asc"
                  ? "↑"
                  : "↓"
                : ""}
            </th>

            <th></th>
          </tr>
        </thead>

        <tbody>
          {Object.entries(groupedByCurrency).map(([key, rows]) => {
            const currency = rows[0]?.currency || "";

            const subtotal = rows.reduce(
              (a, t) => {
                if (activeTab === "cash") {
                  return { qty: 0, proceeds: a.proceeds + (t.amount || 0), fee: 0, realisedPL: 0 };
                }

                return {
                  qty: a.qty + (t.quantity || 0),
                  proceeds: a.proceeds + (t.proceeds || 0),
                  fee: a.fee + (t.fee || 0),
                  realisedPL: a.realisedPL + (t.realisedPL || 0),
                };
              },
              { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
            );

            return (
              <React.Fragment key={key}>
                <tr className="ledger-subtotal" onClick={() => toggleRow(key)}>
                  {activeTab !== "cash" && (
                    <td>
                      <strong>{rows[0]?.ticker}</strong>
                    </td>
                  )}

                  <td colSpan={activeTab !== "cash" ? 1 : 0}></td>

                  {activeTab !== "cash" && (
                    <td>
                      <strong>{subtotal.qty}</strong>
                    </td>
                  )}

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
                    .map((t) => (
                      <tr key={t._id}>
                        {activeTab !== "cash" && <td>{t.ticker}</td>}
                        <td>{t.date}</td>
                        {activeTab !== "cash" && <td>{t.quantity}</td>}
                        {activeTab !== "cash" && <td>{t.price}</td>}
                        <td>
                          {activeTab === "cash"
                            ? Number(t.amount || 0).toFixed(2)
                            : Number(t.proceeds || 0).toFixed(2)}
                        </td>
                        {activeTab !== "cash" && <td>{Number(t.fee || 0).toFixed(2)}</td>}
                        {activeTab !== "cash" && <td>{Number(t.realisedPL || 0).toFixed(2)}</td>}
                        {activeTab !== "cash" && (
                          <td>
                            <span className={`broker-tag ${t.broker?.toLowerCase()}`}>{t.broker}</span>
                          </td>
                        )}
                        <td>{t.currency}</td>
                        <td>
                          <button className="icon-btn" onClick={() => deleteEntry(t._id)}>
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
    </div>
  );
}
