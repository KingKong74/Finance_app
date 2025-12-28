import React from "react";

export default function LedgerTable({
  activeTab,
  groupedEntries, // array of [key, rows] for the current page
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
  const isCashLike = activeTab === "cash" || activeTab === "dividends";
  const showTicker = activeTab !== "cash"; // dividends should show ticker too, cash doesn't
  const showTradeCols = !isCashLike; // qty/price/fee/realised/broker

  return (
    <table className="ledger-table">
      <thead>
        <tr>
          {showTicker && (
            <th onClick={() => handleSort("ticker")}>
              Ticker {sortArrow("ticker")}
            </th>
          )}

          <th onClick={() => handleSort("date")}>Date {sortArrow("date")}</th>

          {showTradeCols && (
            <th onClick={() => handleSort("quantity")}>
              Qty {sortArrow("quantity")}
            </th>
          )}

          {showTradeCols && (
            <th onClick={() => handleSort("price")}>
              Price {sortArrow("price")}
            </th>
          )}

          <th onClick={() => handleSort(isCashLike ? "amount" : "proceeds")}>
            {isCashLike ? "Amount" : "Proceeds"}{" "}
            {sortArrow(isCashLike ? "amount" : "proceeds")}
          </th>

          {showTradeCols && (
            <th onClick={() => handleSort("fee")}>Fee {sortArrow("fee")}</th>
          )}

          {showTradeCols && (
            <th onClick={() => handleSort("realisedPL")}>
              Realised P/L {sortArrow("realisedPL")}
            </th>
          )}

          {showTradeCols && (
            <th onClick={() => handleSort("broker")}>
              Broker {sortArrow("broker")}
            </th>
          )}

          <th>Currency</th>
          <th></th>
        </tr>

        {/* Filter row */}
        <tr className="ledger-filter-row">
          {showTicker && (
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

          {showTradeCols && (
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

          {showTradeCols && <td></td>}
          <td></td>
          {showTradeCols && <td></td>}
          {showTradeCols && <td></td>}

          {showTradeCols && (
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
              if (isCashLike) {
                return {
                  qty: 0,
                  proceeds: a.proceeds + (Number(r.amount || 0)),
                  fee: 0,
                  realisedPL: 0,
                };
              }

              return {
                qty: a.qty + (Number(r.quantity || 0)),
                proceeds: a.proceeds + (Number(r.proceeds || 0)),
                fee: a.fee + (Number(r.fee || 0)),
                realisedPL: a.realisedPL + (Number(r.realisedPL || 0)),
              };
            },
            { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
          );

          const isCollapsed = !!collapsed[key];

          // Group header label:
          // - trades/forex/crypto group by ticker
          // - dividends could group by ticker (nice)
          // - cash groups by date (likely)
          const headerTicker =
            activeTab === "dividends" ? (rows[0]?.ticker || "—") : rows[0]?.ticker;

          return (
            <React.Fragment key={key}>
              <tr className="ledger-subtotal" onClick={() => toggleRow(key)}>
                {showTicker && (
                  <td>
                    <strong>{headerTicker}</strong>
                  </td>
                )}

                <td colSpan={showTicker ? 1 : 0}></td>

                {showTradeCols && (
                  <td>
                    <strong>{subtotal.qty}</strong>
                  </td>
                )}

                {showTradeCols && <td></td>}

                <td>{subtotal.proceeds.toFixed(2)}</td>

                {showTradeCols && <td>{subtotal.fee.toFixed(2)}</td>}

                {showTradeCols && (
                  <td>{subtotal.realisedPL.toFixed(2)}</td>
                )}

                {showTradeCols && <td></td>}

                <td>{currency}</td>
                <td>{isCollapsed ? "▼" : "▲"}</td>
              </tr>

              {!isCollapsed &&
                rows.map((r) => (
                  <tr key={r._id}>
                    {showTicker && <td>{r.ticker || ""}</td>}
                    <td>{r.date}</td>

                    {showTradeCols && <td>{r.quantity}</td>}
                    {showTradeCols && <td>{r.price}</td>}

                    <td>
                      {isCashLike
                        ? Number(r.amount || 0).toFixed(2)
                        : Number(r.proceeds || 0).toFixed(2)}
                    </td>

                    {showTradeCols && (
                      <td>{Number(r.fee || 0).toFixed(2)}</td>
                    )}

                    {showTradeCols && (
                      <td>{Number(r.realisedPL || 0).toFixed(2)}</td>
                    )}

                    {showTradeCols && (
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
          <td colSpan={showTicker ? 4 : 1}>
            <strong>Grand Total ({baseCurrency})</strong>
          </td>

          <td>{Number(grandTotalInBase.proceeds || 0).toFixed(2)}</td>

          {showTradeCols && (
            <td>{Number(grandTotalInBase.fee || 0).toFixed(2)}</td>
          )}

          {showTradeCols && (
            <td>{Number(grandTotalInBase.realisedPL || 0).toFixed(2)}</td>
          )}

          <td colSpan="3"></td>
        </tr>
      </tbody>
    </table>
  );
}
