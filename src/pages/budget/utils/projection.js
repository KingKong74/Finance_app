import { WEEKS_PER_MONTH, addMonths, addWeeks, periodKey } from "./time";

export function expandStreamsToPeriods(streams, fromDate, periods, timeScale) {
  const out = [];
  for (let i = 0; i < periods; i++) {
    const d = timeScale === "monthly" ? addMonths(fromDate, i) : addWeeks(fromDate, i);
    out.push({
      key: periodKey(d, timeScale),
      date: d,
      income: 0,
      expense: 0,
      net: 0,
      endCash: 0,
    });
  }

  const toPeriodAmount = (monthlyAmount) =>
    timeScale === "monthly" ? monthlyAmount : monthlyAmount / WEEKS_PER_MONTH;

  for (const s of streams) {
    const start = new Date(s.startDate);
    const end = s.endDate ? new Date(s.endDate) : null;

    for (const row of out) {
      const t = row.date;
      if (t < start) continue;
      if (end && t > end) continue;

      const amt = Math.round(toPeriodAmount(s.amount));
      if (s.type === "income") row.income += amt;
      if (s.type === "expense") row.expense += amt;
    }
  }

  for (const row of out) row.net = row.income - row.expense;
  return out;
}
