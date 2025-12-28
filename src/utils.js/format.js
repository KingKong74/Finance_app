export const fmtMoney = new Intl.NumberFormat("en-AU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const fmtNumber = new Intl.NumberFormat("en-AU", {
  maximumFractionDigits: 8,
});

export function money(v) {
  return fmtMoney.format(Number(v || 0));
}

export function number(v) {
  return fmtNumber.format(Number(v || 0));
}
