import React, { useEffect, useState } from "react";
import "../../../css/overviewTab.css";

import { accounts, overviewTabs } from "./dashboard/overviewData";
import AccountsPanel from "./components/AccountsPanel";
import Dashboard from "./dashboard/Dashboard";
import Positions from "./positions/Positions";

export default function Overview() {
  const [range, setRange] = useState("YTD");
  const [selectedAccount, setSelectedAccount] = useState("All Accounts");
  const [expandedAccount, setExpandedAccount] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [overviewTab, setOverviewTab] = useState("Dashboard");

  // ✅ Dashboard fetch-once cache (per visit)
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardLoaded, setDashboardLoaded] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);

  const activeAccount =
    accounts.find((a) => a.name === selectedAccount) || accounts[0];

  const rateOfReturn =
    activeAccount.total - activeAccount.pl !== 0
      ? (activeAccount.pl / (activeAccount.total - activeAccount.pl)) * 100
      : 0;

  useEffect(() => {
    // Entering Dashboard: fetch once
    if (overviewTab === "Dashboard" && !dashboardLoaded && !dashboardLoading) {
      (async () => {
        try {
          setDashboardLoading(true);

          // TODO: replace with your real endpoint(s)
          // If Dashboard currently uses local/static data, this can be a no-op for now.
          const r = await fetch("/api/overview"); // <— your future overview endpoint
          const data = await r.json();

          setDashboardData(data);
          setDashboardLoaded(true);
        } catch (e) {
          console.error("Dashboard fetch failed:", e);
          setDashboardData(null);
          setDashboardLoaded(false);
        } finally {
          setDashboardLoading(false);
        }
      })();
    }

    // Leaving Dashboard: clear cache (so next time it refetches)
    if (overviewTab !== "Dashboard" && dashboardLoaded) {
      setDashboardData(null);
      setDashboardLoaded(false);
      setDashboardLoading(false);
    }
  }, [overviewTab, dashboardLoaded, dashboardLoading]);

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
          dashboardLoading ? (
            <div style={{ padding: "2rem" }}>Loading…</div>
          ) : (
            <Dashboard
              range={range}
              onRangeChange={setRange}
              selectedAccount={selectedAccount}
              activeAccount={activeAccount}
              rateOfReturn={rateOfReturn}
              dashboardData={dashboardData} // optional: pass through
            />
          )
        )}

        {overviewTab === "Positions" && <Positions />}

        {overviewTab !== "Dashboard" && overviewTab !== "Positions" && (
          <p style={{ padding: "2rem" }}>{overviewTab} content coming soon</p>
        )}
      </section>
    </div>
  );
}
