import React, { useMemo, useState } from "react";
import "../../css/transactions.css";

import BankingToolbar from "./components/BankingToolbar";
import TransactionsTable from "./components/TransactionsTable";
import { mockTransactions, mockAccounts } from "./data/mockTransactions";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const base64 = s.split(",")[1] || "";
      resolve(base64);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function Transactions() {
  // UI state
  const [accountId, setAccountId] = useState("ALL");
  const [matchTab, setMatchTab] = useState("all");
  const [dateFrom, setDateFrom] = useState("2025-10-11");
  const [dateTo, setDateTo] = useState("2026-01-11");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [filterOpen, setFilterOpen] = useState(false);

  // NEW: import state for toolbar
  const [importState, setImportState] = useState({
    status: "idle", // idle | importing | preview | error
    lastSyncAt: null,
    lastFilename: "",
    lastCount: null,
    message: "",
  });

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
    setSelectedIds(allSelected ? selectedIds.filter((id) => !ids.includes(id)) : Array.from(new Set([...selectedIds, ...ids])));
  }

  function toggleSelectOne(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 50)));
  }

  async function onImportFile(file) {
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "csv", "txt"].includes(ext)) {
      setImportState((s) => ({
        ...s,
        status: "error",
        message: "Unsupported file type. Use .csv, .pdf, or .txt",
      }));
      return;
    }

    try {
      setImportState({
        status: "importing",
        lastSyncAt: importState.lastSyncAt,
        lastFilename: file.name,
        lastCount: null,
        message: "Uploading and parsing…",
      });

      const base64 = await fileToBase64(file);

      const res = await fetch("/api?action=transactions&sub=importPreview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mime: file.type,
          base64,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setImportState({
          status: "error",
          lastSyncAt: Date.now(),
          lastFilename: file.name,
          lastCount: null,
          message: data?.error || "Import failed",
        });
        return;
      }

      // For now: just show preview in console; next step we’ll render a preview modal + “Save to DB”
      console.log("Import preview:", data);

      setImportState({
        status: "preview",
        lastSyncAt: Date.now(),
        lastFilename: file.name,
        lastCount: data?.count ?? (Array.isArray(data?.transactions) ? data.transactions.length : null),
        message: "Preview ready. Next: review + save to DB with dedupe.",
      });
    } catch (e) {
      setImportState({
        status: "error",
        lastSyncAt: Date.now(),
        lastFilename: file?.name || "",
        lastCount: null,
        message: e?.message || "Import failed",
      });
    }
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
        importState={importState}
      />

      <div className="tx-subRow">
        <div className="tx-subText">{selectedIds.length} transactions selected (max 50)</div>
      </div>

      <TransactionsTable
        rows={rows}
        accounts={mockAccounts}
        selectedIds={selectedIds}
        toggleSelectAll={toggleSelectAll}
        toggleSelectOne={toggleSelectOne}
      />
    </div>
  );
}
