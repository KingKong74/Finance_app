import React, { useState, useEffect, useRef } from "react";
import "../../css/dashboard.css";
import OverviewTab from "./tabs/Overview";

export default function Dashboard() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const tabs = ["Dashboard", "Positions", "Performance", "Dividends", "Account Management"];

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
          <button
            className="options-button"
            onClick={() => setOpen(prev => !prev)}
          >
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
        {tabs.map(tab => (
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
        {activeTab === "Dashboard" && <OverviewTab />}
        {activeTab !== "Dashboard" && (
          <p style={{ padding: "2rem" }}>
            {activeTab} tab coming soon
          </p>
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
      <span className={`market-value ${positive ? "pos" : "neg"}`}>
        {value}
      </span>
    </div>
  );
}
