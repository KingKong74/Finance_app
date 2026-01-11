import React, { useMemo } from "react";

function fmtMoney(n, ccy = "AUD") {
  const x = Number(n || 0);
  return x.toLocaleString("en-AU", {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: 2,
  });
}

function toYMD(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${day}/${m}/${y}`; // AU-style display
}

export default function TransactionsTable({
  rows,
  accounts,
  selectedIds,
  toggleSelectAll,
  toggleSelectOne,
}) {
  const accountNameById = useMemo(() => {
    const m = new Map();
    for (const a of accounts || []) m.set(a.id, a.name);
    return m;
  }, [accounts]);

  const headerChecked = useMemo(() => {
    const ids = (rows || []).slice(0, 50).map((r) => r.id);
    if (!ids.length) return false;
    return ids.every((id) => selectedIds.includes(id));
  }, [rows, selectedIds]);

  return (
    <div className="tx-tableCard">
      <div className="tx-tableWrap">
        <table className="tx-table">
          <thead>
            <tr>
              <th className="tx-th tx-th--check">
                <input
                  type="checkbox"
                  checked={headerChecked}
                  onChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </th>
              <th className="tx-th">Date</th>
              <th className="tx-th">Account</th>
              <th className="tx-th">Bank Transaction</th>
              <th className="tx-th tx-th--num">Withdrawal ($)</th>
              <th className="tx-th tx-th--num">Deposit ($)</th>
              <th className="tx-th">Match</th>
            </tr>
          </thead>

          <tbody>
            {(rows || []).length === 0 ? (
              <tr>
                <td className="tx-td tx-empty" colSpan={7}>
                  No transactions found for this filter.
                </td>
              </tr>
            ) : (
              rows.map((t) => {
                // Expecting your mock rows to look like:
                // { id, date, accountId, accountName, description, amount, matched }
                const isSelected = selectedIds.includes(t.id);

                // If amount is negative = withdrawal, positive = deposit.
                // If your data already has withdrawal/deposit fields, swap this logic.
                const amt = Number(t.amount || 0);
                const withdrawal = amt < 0 ? Math.abs(amt) : 0;
                const deposit = amt > 0 ? amt : 0;

                const accName =
                  t.accountName ||
                  accountNameById.get(t.accountId) ||
                  t.accountId ||
                  "—";

                return (
                  <tr key={t.id} className={isSelected ? "is-selected" : ""}>
                    <td className="tx-td tx-td--check">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(t.id)}
                        aria-label={`Select transaction ${t.id}`}
                      />
                    </td>

                    <td className="tx-td">{toYMD(t.date)}</td>
                    <td className="tx-td">{accName}</td>
                    <td className="tx-td">
                      <div className="tx-desc">{t.description || "—"}</div>
                      {t.merchant ? (
                        <div className="tx-sub">{t.merchant}</div>
                      ) : null}
                    </td>

                    <td className="tx-td tx-td--num">
                      {withdrawal ? fmtMoney(withdrawal) : ""}
                    </td>
                    <td className="tx-td tx-td--num">
                      {deposit ? fmtMoney(deposit) : ""}
                    </td>

                    <td className="tx-td">
                      <span className={`tx-badge ${t.matched ? "is-matched" : "is-unmatched"}`}>
                        {t.matched ? "Matched" : "Not matched"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="tx-footnote">
        Showing {(rows || []).length} transaction{(rows || []).length === 1 ? "" : "s"} (select up to 50)
      </div>
    </div>
  );
}
