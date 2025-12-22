import React, { useState, useEffect, useRef } from "react";
import StatCard from "../components/StatCard";
import "../css/dashboard.css";

export default function Dashboard() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const tabs = ["Dashboard", "Positions", "Performance", "Dividends", "*BLANK*"];

  return (
    <div className="dashboard-content">
      {/* Sticky dashboard subheader */}
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
            aria-label="Dashboard options"
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

      {/* Sticky tabs */}
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

      {/* Main content scrolls beneath sticky elements */}
      <div className="dashboard-page">
        <h1>{activeTab === "Dashboard" ? "Portfolio Dashboard" : activeTab}</h1>

        {activeTab === "Dashboard" && (
          <>
            <div className="dashboard-stats">
              <StatCard title="Total Portfolio Value" value="$125,000" />
              <StatCard title="Cash Balance" value="$18,500" />
              <StatCard title="Monthly Cashflow" value="+$2,300" />
            </div>

            <div className="dashboard-section">
              <h2>Portfolio overview</h2>
              <p>Charts coming soon 📊</p>
              <div style={{ height: "1000px" }} />
            </div>
          </>
        )}

        {activeTab !== "Dashboard" && (
          <div className="dashboard-section">
            <p>Content for {activeTab} tab.</p>
            <div style={{ height: "800px" }} />
          </div>
        )}
      </div>
    </div>
  );
}

function MarketStat({ label, value }) {
  const positive = value.startsWith("+");
  return (
    <div className="market-stat">
      <span className="market-label">{label}</span>
      <span className={`market-value ${positive ? "pos" : "neg"}`}>{value}</span>
    </div>
  );
}
