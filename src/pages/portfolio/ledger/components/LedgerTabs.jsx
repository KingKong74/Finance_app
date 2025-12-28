import React from "react";

export default function LedgerTabs({ activeTab, setActiveTab }) {
  return (
    <div className="ledger-tabs">
      {["trades", "crypto", "forex", "cash"].map((tab) => (
        <button
          key={tab}
          className={activeTab === tab ? "active" : ""}
          onClick={() => setActiveTab(tab)}
        >
          {tab.charAt(0).toUpperCase() + tab.slice(1)}
        </button>
      ))}
    </div>
  );
}
