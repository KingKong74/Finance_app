// src/pages/transactions/components/TransactionImportModal.jsx

import React, { useState } from "react";

function fmtMoney(n) {
  const val = Number(n || 0);
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  return sign + "$" + abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TransactionImportModal({ previewData, onClose, onImported }) {
  const [selected, setSelected] = useState(() => {
    // Auto-select all transactions by default
    const sel = {};
    (previewData?.transactions || []).forEach((tx, idx) => {
      sel[idx] = true;
    });
    return sel;
  });

  const transactions = previewData?.transactions || [];
  const provider = previewData?.provider || "UNKNOWN";
  const accountId = previewData?.accountId || "UNKNOWN";
  const warnings = previewData?.warnings || [];

  const selectedCount = Object.values(selected).filter(Boolean).length;

  function toggleAll(value) {
    const next = {};
    transactions.forEach((_, idx) => {
      next[idx] = value;
    });
    setSelected(next);
  }

  function toggleOne(idx) {
    setSelected((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  function handleImport() {
    if (selectedCount === 0) {
      alert("Please select at least one transaction");
      return;
    }
    onImported();
  }

  return (
    <div className="tx-modal-overlay" onClick={onClose}>
      <div className="tx-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tx-modal-header">
          <div>
            <h2 className="tx-modal-title">Review Import</h2>
            <div className="tx-modal-subtitle">
              {provider} · {accountId} · {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
              {previewData?.period && (
                <> · {fmtDate(previewData.period.from)} to {fmtDate(previewData.period.to)}</>
              )}
            </div>
          </div>
          <button className="tx-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {warnings.length > 0 && (
          <div className="tx-modal-warnings">
            {warnings.map((w, i) => (
              <div key={i} className="tx-modal-warning">⚠️ {w}</div>
            ))}
          </div>
        )}

        <div className="tx-modal-actions">
          <div className="tx-modal-info">
            {selectedCount} of {transactions.length} selected
          </div>
          <div className="tx-modal-buttons">
            <button
              className="tx-btn tx-btn--secondary"
              onClick={() => toggleAll(true)}
              type="button"
            >
              Select All
            </button>
            <button
              className="tx-btn tx-btn--secondary"
              onClick={() => toggleAll(false)}
              type="button"
            >
              Deselect All
            </button>
            <button
              className="tx-btn tx-btn--primary"
              onClick={handleImport}
              disabled={selectedCount === 0}
              type="button"
            >
              Import {selectedCount} Transaction{selectedCount !== 1 ? "s" : ""}
            </button>
          </div>
        </div>

        <div className="tx-modal-table-wrap">
          <table className="tx-modal-table">
            <thead>
              <tr>
                <th className="tx-modal-th tx-modal-th--check">
                  <input
                    type="checkbox"
                    checked={selectedCount === transactions.length && transactions.length > 0}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th className="tx-modal-th">Date</th>
                <th className="tx-modal-th">Description</th>
                <th className="tx-modal-th tx-modal-th--num">Amount</th>
                <th className="tx-modal-th tx-modal-th--num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, idx) => (
                <tr
                  key={idx}
                  className={selected[idx] ? "is-selected" : ""}
                  onClick={() => toggleOne(idx)}
                >
                  <td className="tx-modal-td tx-modal-td--check">
                    <input
                      type="checkbox"
                      checked={!!selected[idx]}
                      onChange={() => toggleOne(idx)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="tx-modal-td">
                    <div>{fmtDate(tx.postedAt || tx.occurredAt)}</div>
                    {tx.occurredAt && tx.occurredAt !== tx.postedAt && (
                      <div className="tx-modal-sub">Occurred: {fmtDate(tx.occurredAt)}</div>
                    )}
                  </td>
                  <td className="tx-modal-td">
                    <div className="tx-modal-desc">{tx.description}</div>
                    {tx.cardLast4 && (
                      <div className="tx-modal-sub">Card: **** {tx.cardLast4}</div>
                    )}
                  </td>
                  <td className="tx-modal-td tx-modal-td--num">
                    <span className={tx.amount < 0 ? "tx-modal-negative" : "tx-modal-positive"}>
                      {fmtMoney(tx.amount)}
                    </span>
                  </td>
                  <td className="tx-modal-td tx-modal-td--num">
                    {tx.balance != null ? fmtMoney(tx.balance) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="tx-modal-footer">
          <div className="tx-modal-footnote">
            Click rows to select/deselect. In production, duplicates will be automatically detected.
          </div>
        </div>
      </div>
    </div>
  );
}