// Portfolio.jsx
import React, { useState, useEffect, useRef } from "react";
import "../../css/porfolio.css";
import Overview from "./overview/Overview";
import Ledger from "./ledger/Ledger";
import Strategy from "./stratergy/Stratergy";

export default function Portfolio() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("Overview"); // default tab
  const dropdownRef = useRef(null);

  // Overview "fetch once per visit" cache
  const [overviewData, setOverviewData] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewLoaded, setOverviewLoaded] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch Overview data once when entering the Overview tab,
  // keep it while Overview is active, and clear it when leaving Overview.
  useEffect(() => {
    if (activeTab === "Overview" && !overviewLoaded && !overviewLoading) {
      (async () => {
        try {
          setOverviewLoading(true);

          // TODO: Replace with your real Overview aggregator endpoint.
          // If you don't have one yet, you can also Promise.all existing endpoints here.
          const r = await fetch("/api/overview");
          const data = r.ok ? await r.json() : null;

          setOverviewData(data);
          setOverviewLoaded(true);
        } catch (e) {
          console.error("Overview fetch failed:", e);
          setOverviewData(null);
          setOverviewLoaded(false);
        } finally {
          setOverviewLoading(false);
        }
      })();
    }

    // When leaving Overview, clear state so next time you re-enter it refetches
    if (activeTab !== "Overview" && overviewLoaded) {
      setOverviewData(null);
      setOverviewLoaded(false);
      setOverviewLoading(false);
    }
  }, [activeTab, overviewLoaded, overviewLoading]);

  const tabs = ["Overview", "Ledger", "Strategy", "Calculator", "Account Management"];

  return (
    <div className="dashboard-content">
      {/* ─── Subheader ─── */}
      <div className="dashboard-subheader">
        <div className="dashboard-timeframe">
          <span>Current week</span>
          <strong>Wk 52</strong>
        </div>

        <div className="dashboard-markets">
          <MarketStat label="S&P 500" value="+1.2%" />
          <MarketStat label="NASDAQ" value="+0.9%" />
          <MarketStat label="Russell 2000" value="-0.3%" />
        </div>

        <div className="dashboard-options" ref={dropdownRef}>
          <button className="options-button" onClick={() => setOpen((prev) => !prev)}>
            ⋯
          </button>

          <div className={`options-dropdown ${open ? "open" : ""}`}>
            <button>U.S</button>
            <button>Europe</button>
            <button>Asia</button>
            <button>Forex</button>
            <button>Custom</button>
          </div>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="dashboard-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`dashboard-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ─── */}
      <div className="dashboard-page">
        {activeTab === "Overview" && (
          <Overview data={overviewData} loading={overviewLoading} />
        )}
        {activeTab === "Ledger" && <Ledger />}
        {activeTab === "Strategy" && <Strategy />}
        {activeTab !== "Overview" && activeTab !== "Ledger" && activeTab !== "Strategy" && (
          <p style={{ padding: "2rem" }}>{activeTab} tab coming soon</p>
        )}
      </div>
    </div>
  );
}

function MarketStat({ label, value }) {
  const positive = value.startsWith("+");
  return (
    <div className="market-stat horizontal">
      <span className="market-label">{label}</span>
      <span className={`market-value ${positive ? "pos" : "neg"}`}>{value}</span>
    </div>
  );
}
