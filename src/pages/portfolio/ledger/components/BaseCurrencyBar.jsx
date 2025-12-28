import React from "react";
import { EXCHANGE_RATES } from "../utils/ledgerNormalise";

export default function BaseCurrencyBar({ baseCurrency, setBaseCurrency, onOpenImport }) {
  return (
    <div className="base-currency-selector-container">
      Base currency:{" "}
      <select
        value={baseCurrency}
        onChange={(e) => setBaseCurrency(e.target.value)}
        className="base-currency-selector"
      >
        {Object.keys(EXCHANGE_RATES).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <button style={{ marginLeft: 10 }} onClick={onOpenImport}>
        Import (IBKR)
      </button>
    </div>
  );
}
