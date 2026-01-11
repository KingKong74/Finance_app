export function fmtMoney(n, ccy = "AUD") {
  const x = Number(n || 0);
  return x.toLocaleString("en-AU", {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: 0,
  });
}
