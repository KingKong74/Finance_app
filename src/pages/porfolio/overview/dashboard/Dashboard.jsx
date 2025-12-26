import React from "react";
import OverviewChart from "./components/overviewChart";
import PortfolioPie from "./components/portfolioPie";
import PortfolioValue from "./components/portfolioValue";
import DividendsColumn from "./components/dividendsColumn";
import CashflowStacked from "./components/cashflowStacked";

export default function Dashboard({
  range,
  onRangeChange,
  selectedAccount,
  activeAccount,
  rateOfReturn,
}) {
  return (
    <>
      <OverviewChart
        range={range}
        selectedAccount={selectedAccount}
        accountTotal={activeAccount.total}
        rateOfReturn={rateOfReturn}
        onRangeChange={onRangeChange}
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
  );
}
