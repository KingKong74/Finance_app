// src/pages/portfolio/ledger/components/BaseCurrencyBar.jsx
import React, { useMemo, useState } from "react";

function fmtRate(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / (1000 * 60));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function BaseCurrencyBar({
  baseCurrency,
  setBaseCurrency,
  onOpenImport,
  fxRates = {},           // ✅ from FxContext via Ledger.jsx
  fxMeta = { fetchedAt: "" },
}) {
  // Optional: allow user to preview a pair (Base -> Quote)
  const [quote, setQuote] = useState("USD");

  const currencies = useMemo(() => {
    const set = new Set([
      baseCurrency,
      ...Object.keys(fxRates || {}),
      "AUD",
      "USD",
      "EUR",
    ]);
    return Array.from(set).sort();
  }, [baseCurrency, fxRates]);

  const quoteSafe = currencies.includes(quote) ? quote : currencies[0] || "USD";
  const rate = fxRates?.[quoteSafe]; // provider returns: 1 base = rate quote

  return (
    <div className="base-currency-selector-container">
      <span>Base currency:&nbsp;</span>

      <select
        value={baseCurrency}
        onChange={(e) => setBaseCurrency(e.target.value)}
        className="base-currency-selector"
      >
        {currencies.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {/* tiny FX display */}
      <span style={{ marginLeft: 14, opacity: 0.85, fontSize: 13 }}>
        1&nbsp;{baseCurrency}&nbsp;=&nbsp;
        <select
          value={quoteSafe}
          onChange={(e) => setQuote(e.target.value)}
          style={{ margin: "0 6px" }}
        >
          {currencies
            .filter((c) => c !== baseCurrency)
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>
        {fmtRate(rate)}
        {fxMeta?.fetchedAt ? (
          <span style={{ marginLeft: 8, opacity: 0.7 }}>
            · {timeAgo(fxMeta.fetchedAt)}
          </span>
        ) : null}
      </span>

      <button style={{ marginLeft: "auto" }} onClick={onOpenImport}>
        Import (IBKR)
      </button>
    </div>
  );
}
