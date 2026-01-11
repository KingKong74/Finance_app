import { WEEKS_PER_MONTH, makeYearLabels, makePeriodLabels } from "../utils/time";

// seeded random
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function jitter(rand, pct = 0.08) {
  return 1 + (rand() * 2 - 1) * pct;
}

export function makeFakeBudgetCharts(timeScale) {
  const seed = timeScale === "weekly" ? 4242 : 2026;
  const rand = mulberry32(seed);

  // Base monthly levels (feel free to tune)
  const baseMonthlyIncome = 6500;
  const baseMonthlyExpense = 4300;

  const baseIncomePerPeriod = timeScale === "monthly" ? baseMonthlyIncome : baseMonthlyIncome / WEEKS_PER_MONTH;
  const baseExpensePerPeriod = timeScale === "monthly" ? baseMonthlyExpense : baseMonthlyExpense / WEEKS_PER_MONTH;

  // Pie (current period distribution)
  const pie = [
    { name: "Rent", value: Math.round(baseExpensePerPeriod * 0.46 * jitter(rand, 0.12)) },
    { name: "Food", value: Math.round(baseExpensePerPeriod * 0.16 * jitter(rand, 0.12)) },
    { name: "Bills & subs", value: Math.round(baseExpensePerPeriod * 0.10 * jitter(rand, 0.12)) },
    { name: "Transport", value: Math.round(baseExpensePerPeriod * 0.08 * jitter(rand, 0.12)) },
    { name: "Insurance", value: Math.round(baseExpensePerPeriod * 0.06 * jitter(rand, 0.12)) },
    { name: "Discretionary", value: Math.round(baseExpensePerPeriod * 0.10 * jitter(rand, 0.12)) },
    { name: "Other", value: Math.round(baseExpensePerPeriod * 0.04 * jitter(rand, 0.12)) },
  ];

  // Annual income vs expenses
  const years = makeYearLabels(6);
  const incomeVsExpensesAnnual = years.map((yy, i) => {
    const growth = 1 + i * 0.03;
    const income = baseMonthlyIncome * 12 * growth * jitter(rand, 0.05);
    const expenses = baseMonthlyExpense * 12 * (1 + i * 0.025) * jitter(rand, 0.06);
    return { label: yy, income: Math.round(income), expenses: Math.round(expenses) };
  });

  // Annual budget vs actual (expenses)
  const budgetVsActualAnnual = years.map((yy, i) => {
    const budget = baseMonthlyExpense * 12 * (1 + i * 0.02) * jitter(rand, 0.03);
    const actual = budget * (0.92 + rand() * 0.18);
    return { label: yy, budget: Math.round(budget), actual: Math.round(actual) };
  });

  // Period savings (8)
  const labels = makePeriodLabels(timeScale, 8);
  const savings = labels.map((label, i) => {
    const season = 1 + Math.sin((i / 12) * Math.PI * 2) * 0.05;
    const inc = baseIncomePerPeriod * season * jitter(rand, 0.06);
    const exp = baseExpensePerPeriod * (1 + i * 0.01) * jitter(rand, 0.08);
    return { label, savings: Math.round(inc - exp) };
  });

  return { pie, incomeVsExpensesAnnual, budgetVsActualAnnual, savings };
}
