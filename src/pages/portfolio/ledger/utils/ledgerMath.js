// src/pages/portfolio/ledger/utils/ledgerMath.js

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
  const isCash = activeTab === "cash";
  const isDividends = activeTab === "dividends";

  return rows.reduce((acc, r) => {
    if (isCash) {
      const key = r.currency || "AUD";
      (acc[key] ||= []).push(r);
      return acc;
    }

    if (isDividends) {
      const ticker = String(r.ticker || "").toUpperCase() || "—";
      const cur = r.currency || "USD";
      const key = `${ticker}_${cur}`;
      (acc[key] ||= []).push(r);
      return acc;
    }

    const ticker = String(r.ticker || "").toUpperCase();
    const cur = r.currency || "USD";
    const key = `${ticker}_${cur}`;
    (acc[key] ||= []).push(r);
    return acc;
  }, {});
}

export function calcTotalsByCurrency(grouped, activeTab) {
  const isCashLike = activeTab === "cash" || activeTab === "dividends";

  return Object.values(grouped).reduce((acc, rows) => {
    const currency = rows[0]?.currency || "AUD";

    const subtotal = rows.reduce(
      (a, r) => {
        if (isCashLike) {
          return {
            qty: 0,
            proceeds: a.proceeds + Number(r.amount || 0),
            fee: 0,
            realisedPL: 0,
          };
        }

        return {
          qty: a.qty + Number(r.quantity || 0),
          proceeds: a.proceeds + Number(r.proceeds || 0),
          fee: a.fee + Number(r.fee || 0),
          realisedPL: a.realisedPL + Number(r.realisedPL || 0),
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

export function calcGrandTotalInBase(
  totalsByCurrency,
  baseCurrency,
  fxRates
) {
  return Object.entries(totalsByCurrency).reduce(
    (acc, [currency, totals]) => {
      // fxRates is: 1 baseCurrency = fxRates[target]
      // so converting FROM target → base = divide
      const fx = Number(fxRates?.[currency]);
      const basePer1 = currency === baseCurrency ? 1 : fx ? 1 / fx : 1;

      const convert = (v) => Number(v || 0) * basePer1;

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
