// Overview.jsx
import React, { useState } from "react";
import "../../../css/overviewTab.css";

import { accounts, overviewTabs } from "./dashboard/overviewData";
import AccountsPanel from "./components/AccountsPanel";
import Dashboard from "./dashboard/Dashboard";
import Positions from "./positions/Positions";

export default function Overview({ data, loading }) {
  const [range, setRange] = useState("YTD");
  const [selectedAccount, setSelectedAccount] = useState("All Accounts");
  const [expandedAccount, setExpandedAccount] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [overviewTab, setOverviewTab] = useState("Dashboard");

  // Basic loading state for the entire Overview tab
  if (loading) {
    return (
      <div className="overview-grid-wrapper">
        <p style={{ padding: "2rem" }}>Loading…</p>
      </div>
    );
  }

  // If you haven't wired /api/overview yet, data may be null.
  // Keep rendering the UI (accounts/overviewData are static for now).
  const activeAccount =
    accounts.find((a) => a.name === selectedAccount) || accounts[0];

  const rateOfReturn =
    activeAccount.total - activeAccount.pl !== 0
      ? (activeAccount.pl / (activeAccount.total - activeAccount.pl)) * 100
      : 0;

  return (
    <div className="overview-grid-wrapper">
      <AccountsPanel
        accounts={accounts}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((prev) => !prev)}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        expandedAccount={expandedAccount}
        setExpandedAccount={setExpandedAccount}
      />

      <section className="overview-main">
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

        {overviewTab === "Dashboard" && (
          <Dashboard
            range={range}
            onRangeChange={setRange}
            selectedAccount={selectedAccount}
            activeAccount={activeAccount}
            rateOfReturn={rateOfReturn}
            // Optional: pass API data down when you wire it
            overviewData={data}
          />
        )}

        {overviewTab === "Positions" && <Positions />}

        {overviewTab !== "Dashboard" && overviewTab !== "Positions" && (
          <p style={{ padding: "2rem" }}>{overviewTab} content coming soon</p>
        )}
      </section>
    </div>
  );
}
