// src/pages/portfolio/ledger/utils/ledgerMath.js
import { EXCHANGE_RATES } from "./ledgerNormalise";

export function applySort(out, sortConfig, activeTab) {
  if (!sortConfig.key) return out;

  out.sort((a, b) => {
    const va = a[sortConfig.key];
    const vb = b[sortConfig.key];

    const isString =
      typeof va === "string" ||
      typeof vb === "string" ||
      sortConfig.key === "date";

    if (isString) {
      const sa = String(va ?? "");
      const sb = String(vb ?? "");
      if (sa < sb) return sortConfig.direction === "asc" ? -1 : 1;
      if (sa > sb) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    }

    const na = Number(va ?? 0);
    const nb = Number(vb ?? 0);
    if (na < nb) return sortConfig.direction === "asc" ? -1 : 1;
    if (na > nb) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  return out;
}

export function groupRows(rows, activeTab) {
  return rows.reduce((acc, r) => {
    const key = activeTab === "cash" ? r.currency : `${r.ticker}_${r.currency}`;
    (acc[key] ||= []).push(r);
    return acc;
  }, {});
}

export function calcTotalsByCurrency(grouped, activeTab) {
  return Object.values(grouped).reduce((acc, rows) => {
    const currency = rows[0]?.currency || "AUD";

    const subtotal = rows.reduce(
      (a, r) => {
        if (activeTab === "cash") {
          return { qty: 0, proceeds: a.proceeds + (r.amount || 0), fee: 0, realisedPL: 0 };
        }
        return {
          qty: a.qty + (r.quantity || 0),
          proceeds: a.proceeds + (r.proceeds || 0),
          fee: a.fee + (r.fee || 0),
          realisedPL: a.realisedPL + (r.realisedPL || 0),
        };
      },
      { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
    );

    acc[currency] ||= { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 };
    acc[currency].qty += subtotal.qty;
    acc[currency].proceeds += subtotal.proceeds;
    acc[currency].fee += subtotal.fee;
    acc[currency].realisedPL += subtotal.realisedPL;
    return acc;
  }, {});
}

export function calcGrandTotalInBase(totalsByCurrency, baseCurrency) {
  return Object.entries(totalsByCurrency).reduce(
    (acc, [currency, totals]) => {
      const rate = EXCHANGE_RATES[currency] ?? 1;
      const baseRate = EXCHANGE_RATES[baseCurrency] ?? 1;
      const convert = (val) => (Number(val || 0) * rate) / baseRate;

      return {
        qty: acc.qty + Number(totals.qty || 0),
        proceeds: acc.proceeds + convert(totals.proceeds),
        fee: acc.fee + convert(totals.fee),
        realisedPL: acc.realisedPL + convert(totals.realisedPL),
      };
    },
    { qty: 0, proceeds: 0, fee: 0, realisedPL: 0 }
  );
}
