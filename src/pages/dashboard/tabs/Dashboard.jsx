import React, { useState } from "react";
import StatCard from "../../porfolio/overview/components/StatCard";
import "../../../css/dashboardTab.css";

export default function Dashboard() {
  const [range, setRange] = useState("YTD");
  const [selectedAccount, setSelectedAccount] = useState("All Accounts");
  const [expandedAccount, setExpandedAccount] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const accounts = [
    { name: "All Accounts", total: 125000, cash: 18500, pl: 6200, dayPL: 420 },
    { name: "Brokerage", total: 65000, cash: 10000, pl: 2500, dayPL: -120 },
    { name: "Super", total: 40000, cash: 5000, pl: 3000, dayPL: 180 },
    { name: "Crypto", total: 20000, cash: 3500, pl: 700, dayPL: -60 },
  ];

  const perfData = {
    "7D": [1, 2, 0.5, -1, 1.2, 0.8, 1.5],
    "MTD": [2, 1.5, 2.2, 3, 2.8, 3.2, 3.5],
    "YTD": [10, 12, 15, 13, 14, 16, 18],
    "1Y": [25, 28, 30, 27, 26, 32, 35],
    "ALL": [50, 55, 60, 58, 62, 65, 70],
  };

  return (
    <div className="overview-grid-wrapper" style={{ position: "relative" }}>
      {/* Panel */}
      <aside className={`accounts-panel ${panelOpen ? "open" : "closed"}`}>
        <div className="panel-header">
          <h3>Accounts</h3>
        </div>

        {accounts.map((acc) => (
          <div className="account-wrapper" key={acc.name}>
            <div className="account-row">
              <button
                className={`account ${selectedAccount === acc.name ? "active" : ""}`}
                onClick={() => setSelectedAccount(acc.name)}
              >
                <span className="account-name">{acc.name}</span>
                <div className="account-values">
                  <span className="account-total">
                    ${acc.total.toLocaleString()}
                  </span>
                  <span
                    className={`account-day-pl ${
                      acc.dayPL >= 0 ? "pos" : "neg"
                    }`}
                  >
                    {acc.dayPL >= 0 ? "+" : "-"}$
                    {Math.abs(acc.dayPL).toLocaleString()}
                  </span>
                </div>
              </button>

              <button
                className="expand-indicator"
                onClick={() =>
                  setExpandedAccount(expandedAccount === acc.name ? null : acc.name)
                }
              >
                {expandedAccount === acc.name ? "▲" : "▼"}
              </button>
            </div>

            {expandedAccount === acc.name && (
              <div className="account-details">
                <StatCard title="Total" value={`$${acc.total.toLocaleString()}`} />
                <StatCard title="Cash" value={`$${acc.cash.toLocaleString()}`} />
                <StatCard title="P/L" value={`${acc.pl >= 0 ? "+" : ""}$${acc.pl.toLocaleString()}`} />
              </div>
            )}
          </div>
        ))}
      </aside>

      {/* Collapse Button */}
      <button
        className="panel-collapse-btn"
        onClick={() => setPanelOpen(prev => !prev)}
      >
        {panelOpen ? "←" : "→"}
      </button>

      {/* Main Content */}
      <section className="overview-main">
        <div className="performance-card">
          <div className="performance-header">
            <h3>Performance: {selectedAccount}</h3>
            <div className="range-tabs">
              {["7D", "MTD", "YTD", "1Y", "ALL"].map((r) => (
                <button
                  key={r}
                  className={r === range ? "active" : ""}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="chart-placeholder">
            {perfData[range].map((val, i) => (
              <div
                key={i}
                style={{
                  display: "inline-block",
                  width: 20,
                  height: val * 2,
                  margin: "0 2px",
                  backgroundColor: val >= 0 ? "green" : "red",
                  opacity: 0.5,
                }}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
