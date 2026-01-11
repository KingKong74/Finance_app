import React, { useRef } from "react";

export default function BankingToolbar({
  accounts,
  accountId,
  setAccountId,
  matchTab,
  setMatchTab,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  search,
  setSearch,
  filterOpen,
  setFilterOpen,
  onImportFile,
}) {
  const fileRef = useRef(null);

  function pickFile() {
    fileRef.current?.click();
  }

  return (
    <div className="tx-toolbarCard">
      <div className="tx-toolbarTop">
        <div className="tx-accountPicker">
          <label className="tx-label"> </label>
          <select className="tx-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="ALL">All bank accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div className="tx-tabGroup" role="tablist" aria-label="Match status">
          <button className={`tx-tab ${matchTab === "all" ? "is-on" : ""}`} onClick={() => setMatchTab("all")} type="button">
            All transactions
          </button>
          <button className={`tx-tab ${matchTab === "notMatched" ? "is-on" : ""}`} onClick={() => setMatchTab("notMatched")} type="button">
            Not matched
          </button>
          <button className={`tx-tab ${matchTab === "matched" ? "is-on" : ""}`} onClick={() => setMatchTab("matched")} type="button">
            Matched
          </button>
        </div>

        <div className="tx-spacer" />

        <button className="tx-btn" type="button" onClick={pickFile}>
          Import (.csv / .pdf)
        </button>
        <input
          ref={fileRef}
          type="file"
          className="tx-file"
          accept=".csv,.pdf,.txt"
          onChange={(e) => onImportFile(e.target.files?.[0])}
        />
      </div>

      <div className="tx-toolbarBottom">
        <div className="tx-dateRange">
          <input className="tx-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className="tx-arrow">→</span>
          <input className="tx-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>

        <div className="tx-search">
          <span className="tx-searchIcon">🔍</span>
          <input
            className="tx-input tx-input--search"
            placeholder="Search transactions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="tx-filter">
          <button className="tx-btn" type="button" onClick={() => setFilterOpen((v) => !v)}>
            Filter by ▾
          </button>
          {filterOpen ? (
            <div className="tx-filterMenu">
              <div className="tx-filterTitle">Filters (placeholder)</div>
              <div className="tx-filterHint">Next: category, min/max amount, matched by rule, merchant…</div>
            </div>
          ) : null}
        </div>

        <button className="tx-reset" type="button" onClick={() => { setSearch(""); setFilterOpen(false); }}>
          Reset
        </button>
      </div>
    </div>
  );
}
