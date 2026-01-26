// src/pages/budget/Budget.jsx
import React, { useMemo, useState } from "react";
import "../../css/budget.css";

import KpiCard from "./components/KpiCard";
import TimeScaleToggle from "./components/TimeScaleToggle";

import ExpensesPieChart from "./components/charts/ExpensesPieChart";
import IncomeVsExpensesChart from "./components/charts/IncomeVsExpensesChart";
import BudgetVsActualChart from "./components/charts/BudgetVsActualChart";
import SavingsChart from "./components/charts/SavingsChart";
import CashBalanceChart from "./components/charts/CashBalanceChart";

import { fmtMoney } from "./utils/money";
import { WEEKS_PER_MONTH, makePeriodLabels } from "./utils/time";
import { expandStreamsToPeriods } from "./utils/projection";
import { computeIncomeFreeRunwayPeriods } from "./utils/runway";
import { makeFakeBudgetCharts } from "./data/fakeBudgetData";

export default function Budget() {
  const [timeScale, setTimeScale] = useState("monthly"); // weekly | monthly
  const [overviewTab, setOverviewTab] = useState("breakdowns"); // breakdowns | tracking

  const currentCash = 24500;

  const streams = useMemo(
    () => [
      { id: "inc-salary", type: "income", category: "Salary", amount: 6200, frequency: "monthly", startDate: "2025-01-01", endDate: null },
      { id: "inc-divs", type: "income", category: "Dividends (est.)", amount: 420, frequency: "monthly", startDate: "2025-01-01", endDate: null },

      { id: "exp-rent", type: "expense", category: "Rent", amount: 2200, frequency: "monthly", startDate: "2025-01-01", endDate: null },
      { id: "exp-bills", type: "expense", category: "Bills & subs", amount: 380, frequency: "monthly", startDate: "2025-01-01", endDate: null },
      { id: "exp-food", type: "expense", category: "Food & groceries", amount: 900, frequency: "monthly", startDate: "2025-01-01", endDate: null },
      { id: "exp-fun", type: "expense", category: "Discretionary", amount: 650, frequency: "monthly", startDate: "2025-01-01", endDate: null },
      { id: "exp-ins", type: "expense", category: "Insurance", amount: 240, frequency: "monthly", startDate: "2025-01-01", endDate: null },
    ],
    []
  );

  const projectionRows = useMemo(() => {
    const start = new Date();
    const periods = 12;
    const rows = expandStreamsToPeriods(streams, start, periods, timeScale);

    let cash = currentCash;
    for (const r of rows) {
      cash += r.net;
      r.endCash = cash;
    }
    return rows;
  }, [streams, timeScale]);

  const totals = useMemo(() => {
    const p0 = projectionRows[0] || { income: 0, expense: 0, net: 0, endCash: currentCash };

    const next3 = projectionRows.slice(0, 3).reduce(
      (acc, r) => ({ income: acc.income + r.income, expense: acc.expense + r.expense, net: acc.net + r.net }),
      { income: 0, expense: 0, net: 0 }
    );

    return { p0, next3 };
  }, [projectionRows]);

  const incomeFreeRunwayPeriods = useMemo(() => {
    return computeIncomeFreeRunwayPeriods({
      currentCash,
      streams,
      timeScale,
      primaryIncomeCategory: "Salary",
      periodsToSimulate: timeScale === "weekly" ? 104 : 60,
    });
  }, [currentCash, streams, timeScale]);

  const incomeFreeRunwayLabel = incomeFreeRunwayPeriods == null ? "∞" : `${incomeFreeRunwayPeriods} ${timeScale === "monthly" ? "mo" : "wks"}`;

  const scaleWord = timeScale === "monthly" ? "Monthly" : "Weekly";
  const next3Label = timeScale === "monthly" ? "Next 3 months net" : "Next 3 weeks net";

  // Recharts “chart friendly” data
  const charts = useMemo(() => makeFakeBudgetCharts(timeScale), [timeScale]);

  const cashChartData = useMemo(() => {
    // label cash chart with friendly labels
    const labels = makePeriodLabels(timeScale, projectionRows.length);
    return projectionRows.map((r, i) => ({
      label: labels[i] ?? r.key,
      endCash: r.endCash,
    }));
  }, [projectionRows, timeScale]);

  const periodNetLabel = timeScale === "monthly" ? "Net monthly cashflow" : "Net weekly cashflow";

  return (
    <div className="b-wrap">
      <div className="b-head">
        <div>
          <h1 className="b-h1">Budget</h1>
          <div className="b-subtle">Forward-looking cashflow model</div>
        </div>

        <TimeScaleToggle timeScale={timeScale} setTimeScale={setTimeScale} />
      </div>

      {/* KPIs */}
      <div className="b-grid4">
        <KpiCard label="Current cash" value={fmtMoney(currentCash)} hint="From your cash ledger later" />
        <KpiCard
          label={periodNetLabel}
          value={fmtMoney(totals.p0.net)}
          hint="Income − expenses (period 1)"
          tone={totals.p0.net < 0 ? "neg" : "pos"}
        />
        <KpiCard
          label="Income-free runway"
          value={incomeFreeRunwayLabel}
          hint="Time until cash hits $0 if Salary stops today"
        />
        <KpiCard
          label={next3Label}
          value={fmtMoney(totals.next3.net)}
          hint="Sum of first 3 projected periods"
          tone={totals.next3.net < 0 ? "neg" : "pos"}
        />
      </div>

      {/* Main */}
      <div className="b-grid2">
        <CashBalanceChart
          title="Cash balance projection"
          subtitle={`${scaleWord} end-of-period cash`}
          data={cashChartData}
        />

        <div className="b-card">
          <div className="b-card__head">
            <div>
              <div className="b-title">This {timeScale === "monthly" ? "month" : "week"} (drivers)</div>
              <div className="b-subtle">Streams are stored as monthly amounts for now</div>
            </div>
          </div>

          <div className="b-split">
            <div>
              <div className="b-minihead">Income</div>
              <ul className="b-list">
                {streams.filter((s) => s.type === "income").map((s) => (
                  <li key={s.id} className="b-list__row">
                    <span className="b-list__name">{s.category}</span>
                    <span className="b-list__val">{fmtMoney(timeScale === "monthly" ? s.amount : Math.round(s.amount / WEEKS_PER_MONTH))}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="b-minihead">Expenses</div>
              <ul className="b-list">
                {streams.filter((s) => s.type === "expense").map((s) => (
                  <li key={s.id} className="b-list__row">
                    <span className="b-list__name">{s.category}</span>
                    <span className="b-list__val">{fmtMoney(timeScale === "monthly" ? s.amount : Math.round(s.amount / WEEKS_PER_MONTH))}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="b-totalrow">
            <div>
              <div className="b-subtle">Net (period 1)</div>
              <div className={`b-total ${totals.p0.net < 0 ? "is-neg" : "is-pos"}`}>{fmtMoney(totals.p0.net)}</div>
            </div>
            <button className="b-btn" type="button" disabled title="Wire this to a modal later">
              + Add stream
            </button>
          </div>
        </div>
      </div>

      {/* Overview tabs */}
      <div className="b-overviewHead">
        <div>
          <div className="b-title">Overview</div>
          <div className="b-subtle">Breakdowns & tracking</div>
        </div>

        <div className="b-tabs">
          <button className={`b-tab ${overviewTab === "breakdowns" ? "is-on" : ""}`} onClick={() => setOverviewTab("breakdowns")}>
            Breakdowns
          </button>
          <button className={`b-tab ${overviewTab === "tracking" ? "is-on" : ""}`} onClick={() => setOverviewTab("tracking")}>
            Tracking
          </button>
        </div>
      </div>

      {overviewTab === "breakdowns" ? (
        <div className="b-grid2">
          <ExpensesPieChart
            title={`Expenses distribution (${scaleWord})`}
            subtitle={`Share of ${timeScale === "monthly" ? "monthly" : "weekly"} spend by category`}
            data={charts.pie}
          />
          <IncomeVsExpensesChart
            title="Annual income vs expenses"
            subtitle="Income columns + expenses line"
            data={charts.incomeVsExpensesAnnual}
          />
        </div>
      ) : (
        <div className="b-grid2">
          <BudgetVsActualChart
            title="Annual budget vs actual"
            subtitle="Planned vs real (annual expenses)"
            data={charts.budgetVsActualAnnual}
          />
          <SavingsChart
            title={`${scaleWord} savings`}
            subtitle={`Net by ${timeScale === "monthly" ? "month" : "week"} (first 8 periods)`}
            data={charts.savings}
          />
        </div>
      )}

      {/* Projection table */}
      <div className="b-card">
        <div className="b-card__head">
          <div>
            <div className="b-title">12-period projection (table)</div>
            <div className="b-subtle">{timeScale === "monthly" ? "12 months" : "12 weeks"}</div>
          </div>
        </div>

        <div className="b-tablewrap">
          <table className="b-table">
            <thead>
              <tr>
                <th>{timeScale === "monthly" ? "Month" : "Week"}</th>
                <th>Income</th>
                <th>Expenses</th>
                <th>Net</th>
                <th>End cash</th>
              </tr>
            </thead>
            <tbody>
              {projectionRows.map((r) => (
                <tr key={r.key}>
                  <td>{r.key}</td>
                  <td>{fmtMoney(r.income)}</td>
                  <td>{fmtMoney(r.expense)}</td>
                  <td className={r.net < 0 ? "is-neg" : "is-pos"}>{fmtMoney(r.net)}</td>
                  <td>{fmtMoney(r.endCash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="b-note">Next: swap fake charts + mock streams for DB-driven cashflows.</div>
      </div>
    </div>
  );
}
