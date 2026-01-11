export const WEEKS_PER_MONTH = 52 / 12; // ~4.333

export function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function addWeeks(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n * 7);
  return d;
}

export function periodKey(date, timeScale) {
  const d = new Date(date);
  if (timeScale === "monthly") {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  const oneJan = new Date(d.getFullYear(), 0, 1);
  const day = Math.floor((d - oneJan) / 86400000);
  const week = Math.ceil((day + oneJan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function makeYearLabels(n = 6) {
  const nowY = new Date().getFullYear();
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(String(nowY - i).slice(2));
  return out;
}

export function makePeriodLabels(timeScale, n = 12) {
  if (timeScale === "monthly") {
    const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const start = new Date().getMonth();
    return Array.from({ length: n }, (_, i) => names[(start + i) % 12]);
  }
  return Array.from({ length: n }, (_, i) => `W${i + 1}`);
}
