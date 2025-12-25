import React, { useState } from "react";
import StatCard from "../../../../components/StatCard";
import "../../../../css/overviewTab.css";
import { accounts, overviewTabs } from "./overviewData";
import OverviewChart from "./overviewChart";
import PortfolioPie from "./portfolioPie";
import PortfolioValue from "./portfolioValue";
import DividendsColumn from "./dividendsColumn";
import CashflowStacked from "./cashflowStacked";

export default function Overview() {
  const [range, setRange] = useState("YTD");
  const [selectedAccount, setSelectedAccount] = useState("All Accounts");
  const [expandedAccount, setExpandedAccount] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [overviewTab, setOverviewTab] = useState("Dashboard");

  const activeAccount =
    accounts.find((a) => a.name === selectedAccount) || accounts[0];

  const rateOfReturn =
    activeAccount.total - activeAccount.pl !== 0
      ? (activeAccount.pl / (activeAccount.total - activeAccount.pl)) * 100
      : 0;

  return (
    <div className="overview-grid-wrapper">
      {/* Accounts Panel Wrapper for sticky */}
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
                    className={`expand-indicator ${isExpanded ? "open" : ""}`}
                    onClick={() =>
                      setExpandedAccount(isExpanded ? null : acc.name)
                    }
                  >
                    <span className="chevron" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="account-details">
                    <StatCard
                      title="Total"
                      value={`$${acc.total.toLocaleString()}`}
                    />
                    <StatCard
                      title="Cash"
                      value={`$${acc.cash.toLocaleString()}`}
                    />
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

        {/* Collapse Button */}
        <button
          className="panel-collapse-btn"
          onClick={() => setPanelOpen((prev) => !prev)}
        >
          {panelOpen ? "←" : "→"}
        </button>
      </div>

      {/* Main Content */}
      <section className="overview-main">
        {/* Secondary Tabs */}
        <div className="overview-secondary-tabs">
          {overviewTabs.map((tab) => (
            <button
              key={tab}
              className={`overview-tab ${overviewTab === tab ? "active" : ""}`}
              onClick={() => setOverviewTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Dashboard Content */}
        {overviewTab === "Dashboard" && (
          <>
            <OverviewChart
              range={range}
              selectedAccount={selectedAccount}
              accountTotal={activeAccount.total}
              rateOfReturn={rateOfReturn}
              onRangeChange={setRange}
            />

            {selectedAccount === "All Accounts" && (
              <div className="overview-dashboard">
                <div className="dashboard-charts-grid">
                  <PortfolioPie />
                  <PortfolioValue />
                  <DividendsColumn />
                  <CashflowStacked />
                </div>
              </div>
            )}
          </>
        )}

        {overviewTab !== "Dashboard" && (
          <p style={{ padding: "2rem" }}>
            {overviewTab} content coming soon
          </p>
        )}
      </section>
    </div>
  );
}
