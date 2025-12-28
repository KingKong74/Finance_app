// src/pages/portfolio/ledger/Ledger.jsx

import React, { useEffect, useMemo, useState } from "react";
import "../../../css/ledgerTab.css";
import ImportModal from "./components/ImportModal.jsx";

import { useLedgerData } from "./hooks/useLedgerData";
import {
  applySort,
  calcGrandTotalInBase,
  calcTotalsByCurrency,
  groupRows,
} from "./utils/ledgerMath";
import { safeUpper } from "./utils/ledgerNormalise";

import LedgerTabs from "./components/LedgerTabs";
import BaseCurrencyBar from "./components/BaseCurrencyBar";
import AddEntryForm from "./components/AddEntryForm";
import LedgerTable from "./components/LedgerTable";
import PaginationBar from "./components/PaginationBar";

export default function Ledger() {
  const [activeTab, setActiveTab] = useState("trades");
  const [baseCurrency, setBaseCurrency] = useState("AUD");

  const [fxRates, setFxRates] = useState({ AUD: 1 });
  const [fxMeta, setFxMeta] = useState({ fetchedAt: "" });

  // 🔁 Fetch FX whenever base currency changes
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/fx?base=${baseCurrency}`);
        if (!res.ok) throw new Error("fx failed");
        const json = await res.json();

        const rates = { ...(json?.rates || {}) };
        rates[baseCurrency] = 1;

        setFxRates(rates);
        setFxMeta({ fetchedAt: json.fetchedAt || "" });
      } catch (e) {
        console.warn("FX fetch failed, using fallback rates.");
        setFxRates({ AUD: 1, USD: 1.65, EUR: 1.8 });
      }
    })();
  }, [baseCurrency]);

  const [rowLimit, setRowLimit] = useState(10);
  const [collapsed, setCollapsed] = useState({});
  const [showImport, setShowImport] = useState(false);

  const [filters, setFilters] = useState({
    ticker: "",
    date: "",
    qty: "",
    broker: "",
    currency: "",
  });

  const [sortConfig, setSortConfig] = useState({ key: "", direction: "asc" });
  const [currentPage, setCurrentPage] = useState(1);

  const [newEntry, setNewEntry] = useState({
    ticker: "",
    date: "",
    ts: "",
    quantity: "",
    price: "",
    fee: "",
    broker: "IBKR",
    currency: "USD",
    amount: "",
    entryType: "deposit",
    note: "",
  });

  const { entries, fetchData, addEntry, deleteEntry } =
    useLedgerData(activeTab);

  useEffect(() => {
    (async () => {
      try {
        await fetchData();
      } catch (e) {
        console.error("Failed to fetch ledger data:", e);
      }
    })();

    setCollapsed({});
    setCurrentPage(1);
    setFilters({ ticker: "", date: "", qty: "", broker: "", currency: "" });
    setSortConfig({ key: "", direction: "asc" });
  }, [activeTab, fetchData]);

  const handleSort = (key) => {
    setSortConfig((prev) => {
      const direction =
        prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      return { key, direction };
    });
  };

  const sortArrow = (key) =>
    sortConfig.key === key
      ? sortConfig.direction === "asc"
        ? "↑"
        : "↓"
      : "";

  const filteredAndSorted = useMemo(() => {
    const f = filters;
    const isCashLike = activeTab === "cash" || activeTab === "dividends";

    let out = entries.filter((r) => {
      if (isCashLike) {
        const tickerOk =
          activeTab === "dividends"
            ? (!f.ticker ||
                safeUpper(r.ticker).includes(safeUpper(f.ticker)))
            : true;

        return (
          tickerOk &&
          (!f.date || String(r.date) === f.date) &&
          (!f.currency || r.currency === f.currency)
        );
      }

      return (
        (!f.ticker ||
          safeUpper(r.ticker).includes(safeUpper(f.ticker))) &&
        (!f.date || String(r.date) === f.date) &&
        (!f.qty || Number(r.quantity) === Number(f.qty)) &&
        (!f.broker || r.broker === f.broker) &&
        (!f.currency || r.currency === f.currency)
      );
    });

    return applySort(out, sortConfig, activeTab);
  }, [entries, filters, sortConfig, activeTab]);

  const grouped = useMemo(
    () => groupRows(filteredAndSorted, activeTab),
    [filteredAndSorted, activeTab]
  );

  const totalsByCurrency = useMemo(
    () => calcTotalsByCurrency(grouped, activeTab),
    [grouped, activeTab]
  );

  const grandTotalInBase = useMemo(
    () =>
      calcGrandTotalInBase(
        totalsByCurrency,
        baseCurrency,
        fxRates
      ),
    [totalsByCurrency, baseCurrency, fxRates]
  );

  const groupEntriesAll = useMemo(
    () => Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)),
    [grouped]
  );

  const totalPages = Math.max(
    1,
    Math.ceil(groupEntriesAll.length / rowLimit)
  );

  const groupedEntriesPage = useMemo(() => {
    const start = (currentPage - 1) * rowLimit;
    return groupEntriesAll.slice(start, start + rowLimit);
  }, [groupEntriesAll, currentPage, rowLimit]);

  const toggleRow = (key) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const onAdd = async () => {
    try {
      await addEntry(newEntry);
      setCurrentPage(1);
      setNewEntry((prev) => ({
        ...prev,
        ticker: "",
        date: "",
        ts: "",
        quantity: "",
        price: "",
        fee: "",
        amount: "",
        note: "",
      }));
    } catch (e) {
      console.error("Failed to add entry:", e);
    }
  };

  return (
    <div className="ledger-page">
      <LedgerTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      <BaseCurrencyBar
        baseCurrency={baseCurrency}
        setBaseCurrency={setBaseCurrency}
        onOpenImport={() => setShowImport(true)}
      />

      <AddEntryForm
        activeTab={activeTab}
        newEntry={newEntry}
        setNewEntry={setNewEntry}
        onAdd={onAdd}
      />

      <LedgerTable
        activeTab={activeTab}
        groupedEntries={groupedEntriesPage}
        collapsed={collapsed}
        toggleRow={toggleRow}
        deleteEntry={deleteEntry}
        filters={filters}
        setFilters={setFilters}
        handleSort={handleSort}
        sortArrow={sortArrow}
        grandTotalInBase={grandTotalInBase}
        baseCurrency={baseCurrency}
      />

      <PaginationBar
        rowLimit={rowLimit}
        setRowLimit={setRowLimit}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        totalPages={totalPages}
      />

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={async () => {
            try {
              await fetchData();
            } finally {
              setShowImport(false);
            }
          }}
        />
      )}
    </div>
  );
}
