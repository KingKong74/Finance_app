import { expandStreamsToPeriods } from "./projection";

export function computeIncomeFreeRunwayPeriods({
  currentCash,
  streams,
  timeScale,
  primaryIncomeCategory = "Salary",
  periodsToSimulate = 104,
}) {
  const filtered = streams.filter(
    (s) =>
      !(
        s.type === "income" &&
        String(s.category).toLowerCase() === String(primaryIncomeCategory).toLowerCase()
      )
  );

  const rows = expandStreamsToPeriods(filtered, new Date(), periodsToSimulate, timeScale);

  let cash = currentCash;
  for (let i = 0; i < rows.length; i++) {
    cash += rows[i].net;
    if (cash <= 0) return i + 1;
  }
  return null;
}
