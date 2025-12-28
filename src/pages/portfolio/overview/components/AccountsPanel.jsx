import React from "react";
import StatCard from "./StatCard";

export default function AccountsPanel({
  accounts,
  panelOpen,
  onTogglePanel,
  selectedAccount,
  setSelectedAccount,
  expandedAccount,
  setExpandedAccount,
}) {
  return (
    <div className="accounts-panel-wrapper">
      <aside className={`accounts-panel ${panelOpen ? "open" : "closed"}`}>
        <div className="panel-header">
          <h3>Accounts</h3>
        </div>

        {accounts.map((acc) => {
          const isSelected = selectedAccount === acc.name;
          const isExpanded = expandedAccount === acc.name;

          return (
            <div
              key={acc.name}
              className={`account-wrapper ${isSelected ? "selected" : ""}`}
            >
              <div className="account-row">
                <button
                  className="account"
                  onClick={() => {
                    setSelectedAccount(acc.name);
                    setExpandedAccount(isExpanded ? null : acc.name);
                  }}
                >
                  <span className="account-name">{acc.name}</span>

                  <div className="account-values">
                    <span className="account-total">
                      ${acc.total.toLocaleString()}
                    </span>

                    <span
                      className={`account-day-pl ${acc.dayPL >= 0 ? "pos" : "neg"}`}
                    >
                      {acc.dayPL >= 0 ? "+" : "-"}$
                      {Math.abs(acc.dayPL).toLocaleString()}
                    </span>
                  </div>
                </button>

                <button
                  className={`expand-indicator ${isExpanded ? "open" : ""}`}
                  onClick={() => setExpandedAccount(isExpanded ? null : acc.name)}
                >
                  <span className="chevron" />
                </button>
              </div>

              {isExpanded && (
                <div className="account-details">
                  <StatCard title="Total" value={`$${acc.total.toLocaleString()}`} />
                  <StatCard title="Cash" value={`$${acc.cash.toLocaleString()}`} />
                  <StatCard
                    title="P/L"
                    value={`${acc.pl >= 0 ? "+" : ""}$${acc.pl.toLocaleString()}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </aside>

      <button className="panel-collapse-btn" onClick={onTogglePanel}>
        {panelOpen ? "←" : "→"}
      </button>
    </div>
  );
}
