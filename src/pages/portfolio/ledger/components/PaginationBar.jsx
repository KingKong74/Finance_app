import React from "react";

export default function PaginationBar({
  rowLimit,
  setRowLimit,
  currentPage,
  setCurrentPage,
  totalPages,
}) {
  return (
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
          {[5, 10, 25, 50, 100, 1000].map((n) => (
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
        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(currentPage + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
