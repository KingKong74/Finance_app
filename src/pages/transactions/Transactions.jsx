// src/pages/transactions/Transactions.jsx

import React, { useMemo, useState } from "react";
import "../../css/transactions.css";

import BankingToolbar from "./components/BankingToolbar";
import TransactionsTable from "./components/TransactionsTable";
import TransactionImportModal from "./components/TransactionImportModal";
import { mockTransactions, mockAccounts } from "./data/mockTransactions";
import { parseAnzPdf } from "./utils/parseAnzPdf";

export default function Transactions() {
  // UI state
  const [accountId, setAccountId] = useState("ALL");
  const [matchTab, setMatchTab] = useState("all");
  const [dateFrom, setDateFrom] = useState("2025-10-11");
  const [dateTo, setDateTo] = useState("2026-01-11");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [filterOpen, setFilterOpen] = useState(false);

  // Preview modal state
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const rows = useMemo(() => {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const q = search.trim().toLowerCase();

    return mockTransactions
      .filter((t) => {
        if (accountId !== "ALL" && t.accountId !== accountId) return false;

        const dt = new Date(t.date);
        if (dt < from || dt > to) return false;

        if (matchTab === "matched" && !t.matched) return false;
        if (matchTab === "notMatched" && t.matched) return false;

        if (q) {
          const hay = `${t.description} ${t.accountName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [accountId, matchTab, dateFrom, dateTo, search]);

  function toggleSelectAll() {
    const ids = rows.slice(0, 50).map((r) => r.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds(
      allSelected
        ? selectedIds.filter((id) => !ids.includes(id))
        : Array.from(new Set([...selectedIds, ...ids]))
    );
  }

  function toggleSelectOne(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 50)
    );
  }

  // Parse PDF and show preview
  async function onImportFile(file) {
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    
    if (ext !== "pdf") {
      setError("Please select a PDF file");
      setTimeout(() => setError(null), 3000);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("Parsing PDF:", file.name);
      
      // Parse the PDF file
      const parsed = await parseAnzPdf(file);
      
      console.log("Parsed result:", parsed);

      if (!parsed.transactions || parsed.transactions.length === 0) {
        throw new Error("No transactions found in PDF. Make sure this is an ANZ credit card statement.");
      }

      // Show preview modal with parsed data
      setPreviewData({
        ...parsed,
        count: parsed.transactions.length,
      });

    } catch (err) {
      console.error("Parse error:", err);
      setError(err.message || "Failed to parse PDF");
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    setPreviewData(null);
  }

  function onImported() {
    alert(`Successfully imported ${previewData?.transactions?.length || 0} transactions!\n\n(Demo mode - not saved to database yet)`);
    setPreviewData(null);
  }

  return (
    <div className="tx-wrap">
      <div className="tx-titleRow">
        <h1 className="tx-h1">Bank transactions</h1>
        <div className="tx-actions">
          <button className="tx-btn tx-btn--primary" type="button">
            Reconcile
          </button>
          <button className="tx-btn" type="button" aria-label="More options">
            ⋯
          </button>
        </div>
      </div>

      <BankingToolbar
        accounts={mockAccounts}
        accountId={accountId}
        setAccountId={setAccountId}
        matchTab={matchTab}
        setMatchTab={setMatchTab}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        search={search}
        setSearch={setSearch}
        filterOpen={filterOpen}
        setFilterOpen={setFilterOpen}
        onImportFile={onImportFile}
      />

      {/* Loading/Error Messages */}
      {loading && (
        <div className="tx-import-status tx-import-status--loading">
          📄 Parsing PDF...
        </div>
      )}
      
      {error && (
        <div className="tx-import-status tx-import-status--error">
          ❌ {error}
        </div>
      )}

      <div className="tx-subRow">
        <div className="tx-subText">
          {selectedIds.length} transactions selected (max 50)
        </div>
      </div>

      <TransactionsTable
        rows={rows}
        accounts={mockAccounts}
        selectedIds={selectedIds}
        toggleSelectAll={toggleSelectAll}
        toggleSelectOne={toggleSelectOne}
      />

      {/* Import Preview Modal */}
      {previewData && (
        <TransactionImportModal
          previewData={previewData}
          onClose={closeModal}
          onImported={onImported}
        />
      )}
    </div>
  );
}