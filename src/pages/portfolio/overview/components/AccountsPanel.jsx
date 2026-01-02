// src/pages/portfolio/overview/components/AccountsPanel.jsx
import React from "react";
import StatCard from "./StatCard";

const money = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

          const dayPL = Number(acc.dayPL || 0);
          const total = Number(acc.total || 0);

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
                    <span className="account-total">${money(total)}</span>

                    <span
                      className={`account-day-pl ${dayPL >= 0 ? "pos" : "neg"}`}
                    >
                      {dayPL >= 0 ? "+" : "-"}${money(Math.abs(dayPL))}
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
                  <StatCard title="Total" value={`$${money(acc.total)}`} />
                  <StatCard title="Cash" value={`$${money(acc.cash)}`} />
                  <StatCard
                    title="P/L (Unrealised)"
                    value={`${Number(acc.pl || 0) >= 0 ? "+" : "-"}$${money(
                      Math.abs(acc.pl || 0)
                    )}`}
                  />

                  {/* ---- DEBUG BREAKDOWN ---- */}
                  {acc.debug && (
                    <>
                      <div style={{ height: 10 }} />

                      <StatCard
                        title="Debug: Positions MV (AUD)"
                        value={`$${money(acc.debug.positionsMvAud)}`}
                      />
                      <StatCard
                        title="Debug: Cash (AUD) from flows"
                        value={`$${money(acc.debug.cashAud)}`}
                      />
                      <StatCard
                        title="Debug: FX Unrealised (AUD)"
                        value={`${acc.debug.fxUpnlAud >= 0 ? "+" : "-"}$${money(
                          Math.abs(acc.debug.fxUpnlAud)
                        )}`}
                      />
                      <StatCard
                        title="Debug: Positions Unrealised (AUD)"
                        value={`${
                          acc.debug.posUpnlAud >= 0 ? "+" : "-"
                        }$${money(Math.abs(acc.debug.posUpnlAud))}`}
                      />

                      {acc.debug.cashByCcy && (
                        <>
                          <div style={{ height: 10 }} />
                          <StatCard
                            title="Cash basket"
                            value=""
                          />
                          {Object.entries(acc.debug.cashByCcy)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([ccy, bal]) => (
                              <StatCard
                                key={`${acc.name}_${ccy}`}
                                title={` • ${ccy}`}
                                value={`${Number(bal) >= 0 ? "" : "-"}${Math.abs(
                                  Number(bal || 0)
                                ).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`}
                              />
                            ))}
                        </>
                      )}
                    </>
                  )}
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
