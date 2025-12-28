import React from "react";

export default function LedgerTable({
  activeTab,
  groupedEntries, // <-- array of [key, rows] for the current page
  collapsed,
  toggleRow,
  deleteEntry,
  filters,
  setFilters,
  handleSort,
  sortArrow,
  grandTotalInBase,
  baseCurrency,
}) {
  return (
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

          <th
            onClick={() =>
              handleSort(activeTab === "cash" ? "amount" : "proceeds")
            }
          >
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
                onChange={(e) =>
                  setFilters((p) => ({ ...p, ticker: e.target.value }))
                }
              />
            </td>
          )}

          <td>
            <input
              type="date"
              value={filters.date}
              onChange={(e) =>
                setFilters((p) => ({ ...p, date: e.target.value }))
              }
            />
          </td>

          {activeTab !== "cash" && (
            <td>
              <input
                type="number"
                placeholder="Qty"
                value={filters.qty}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, qty: e.target.value }))
                }
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
                onChange={(e) =>
                  setFilters((p) => ({ ...p, broker: e.target.value }))
                }
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
              onChange={(e) =>
                setFilters((p) => ({ ...p, currency: e.target.value }))
              }
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
        {groupedEntries.map(([key, rows]) => {
          const currency = rows[0]?.currency || "";

          const subtotal = rows.reduce(
            (a, r) => {
              if (activeTab === "cash") {
                return {
                  qty: 0,
                  proceeds: a.proceeds + (r.amount || 0),
                  fee: 0,
                  realisedPL: 0,
                };
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

          const isCollapsed = !!collapsed[key];

          return (
            <React.Fragment key={key}>
              <tr className="ledger-subtotal" onClick={() => toggleRow(key)}>
                {activeTab !== "cash" && (
                  <td>
                    <strong>{rows[0].ticker}</strong>
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

                {activeTab !== "cash" && (
                  <td>{subtotal.realisedPL.toFixed(2)}</td>
                )}

                {activeTab !== "cash" && <td></td>}

                <td>{currency}</td>
                <td>{isCollapsed ? "▼" : "▲"}</td>
              </tr>

              {/* ✅ Expanded shows ALL rows (no pagination slicing) */}
              {!isCollapsed &&
                rows.map((r) => (
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

                    {activeTab !== "cash" && (
                      <td>{Number(r.fee || 0).toFixed(2)}</td>
                    )}

                    {activeTab !== "cash" && (
                      <td>{Number(r.realisedPL || 0).toFixed(2)}</td>
                    )}

                    {activeTab !== "cash" && (
                      <td>
                        <span
                          className={`broker-tag ${String(
                            r.broker || ""
                          ).toLowerCase()}`}
                        >
                          {r.broker}
                        </span>
                      </td>
                    )}

                    <td>{r.currency}</td>

                    <td>
                      <button
                        className="icon-btn"
                        onClick={() => deleteEntry(r._id)}
                      >
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

          <td>{Number(grandTotalInBase.proceeds || 0).toFixed(2)}</td>

          {activeTab !== "cash" && (
            <td>{Number(grandTotalInBase.fee || 0).toFixed(2)}</td>
          )}

          {activeTab !== "cash" && (
            <td>{Number(grandTotalInBase.realisedPL || 0).toFixed(2)}</td>
          )}

          <td colSpan="3"></td>
        </tr>
      </tbody>
    </table>
  );
}
