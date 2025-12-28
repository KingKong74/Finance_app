import React, { useMemo } from "react";

function buildTs(date, time) {
  // time input gives "HH:MM" (no seconds) so we normalise to HH:MM:00
  if (!date) return "";
  const t = (time || "").trim();
  if (!t) return `${date}T00:00:00`;
  return `${date}T${t.length === 5 ? `${t}:00` : t}`; // supports HH:MM or HH:MM:SS
}

export default function AddEntryForm({ activeTab, newEntry, setNewEntry, onAdd }) {
  const isCash = activeTab === "cash";
  const isDividends = activeTab === "dividends";
  const isCashLike = isCash || isDividends;

  // we still let the user enter "time" in the UI, but store ts alongside it
  const effectiveTs = useMemo(
    () => buildTs(newEntry.date, newEntry.time),
    [newEntry.date, newEntry.time]
  );

  // keep newEntry.ts in sync (so useLedgerData can send it)
  const syncTs = (nextPartial) => {
    setNewEntry((p) => {
      const next = { ...p, ...nextPartial };
      return { ...next, ts: buildTs(next.date, next.time) };
    });
  };

  const title =
    activeTab === "dividends"
      ? "Dividends"
      : activeTab.charAt(0).toUpperCase() + activeTab.slice(1);

  return (
    <div className="ledger-entry-box">
      <h4>Add New {title}</h4>

      <div className="ledger-entry-fields">
        {/* ─────────────────────────────
            TRADES / FOREX / CRYPTO
           ───────────────────────────── */}
        {!isCashLike ? (
          <>
            <input
              placeholder="Ticker"
              value={newEntry.ticker}
              onChange={(e) => syncTs({ ticker: e.target.value.toUpperCase() })}
            />

            <input
              type="date"
              value={newEntry.date}
              onChange={(e) => syncTs({ date: e.target.value })}
            />

            <input
              type="time"
              value={newEntry.time || ""}
              onChange={(e) => syncTs({ time: e.target.value })}
            />

            <input
              type="number"
              placeholder="Qty"
              value={newEntry.quantity}
              onChange={(e) => syncTs({ quantity: e.target.value })}
            />

            <input
              type="number"
              placeholder="Price"
              value={newEntry.price}
              onChange={(e) => syncTs({ price: e.target.value })}
            />

            <input
              type="number"
              placeholder="Fee"
              value={newEntry.fee}
              onChange={(e) => syncTs({ fee: e.target.value })}
            />

            <select
              value={newEntry.currency}
              onChange={(e) => syncTs({ currency: e.target.value })}
            >
              <option>USD</option>
              <option>AUD</option>
              <option>EUR</option>
            </select>

            <select
              value={newEntry.broker}
              onChange={(e) => syncTs({ broker: e.target.value })}
            >
              <option>IBKR</option>
              <option>CMC</option>
              <option>Stake</option>
            </select>

            <button onClick={onAdd}>Add {activeTab}</button>

            {/* optional: tiny hint */}
            <div style={{ fontSize: 12, opacity: 0.7, marginLeft: 6 }}>
              Timestamp: {effectiveTs || "—"}
            </div>
          </>
        ) : (
          <>
            {/* ─────────────────────────────
                CASH
               ───────────────────────────── */}
            {isCash && (
              <>
                <input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => syncTs({ date: e.target.value })}
                />

                <input
                  type="time"
                  value={newEntry.time || ""}
                  onChange={(e) => syncTs({ time: e.target.value })}
                />

                <input
                  type="number"
                  placeholder="Amount"
                  value={newEntry.amount}
                  onChange={(e) => syncTs({ amount: e.target.value })}
                />

                <select
                  value={newEntry.entryType}
                  onChange={(e) => syncTs({ entryType: e.target.value })}
                >
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                </select>

                <select
                  value={newEntry.currency}
                  onChange={(e) => syncTs({ currency: e.target.value })}
                >
                  <option>USD</option>
                  <option>AUD</option>
                  <option>EUR</option>
                </select>

                <select
                  value={newEntry.broker}
                  onChange={(e) => syncTs({ broker: e.target.value })}
                >
                  <option value="">Select broker/exchange</option>
                  <option>IBKR</option>
                  <option>CMC</option>
                  <option>Stake</option>
                  <option>Coinbase</option>
                  <option>Binance</option>
                </select>

                <input
                  placeholder="Note (optional)"
                  value={newEntry.note || ""}
                  onChange={(e) => syncTs({ note: e.target.value })}
                />

                <button onClick={onAdd}>Add cash</button>

                <div style={{ fontSize: 12, opacity: 0.7, marginLeft: 6 }}>
                  Timestamp: {effectiveTs || "—"}
                </div>
              </>
            )}

            {/* ─────────────────────────────
                DIVIDENDS
               ───────────────────────────── */}
            {isDividends && (
              <>
                <input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => syncTs({ date: e.target.value })}
                />

                <input
                  type="time"
                  value={newEntry.time || ""}
                  onChange={(e) => syncTs({ time: e.target.value })}
                />

                <input
                  placeholder="Ticker (optional)"
                  value={newEntry.ticker || ""}
                  onChange={(e) => syncTs({ ticker: e.target.value.toUpperCase() })}
                />

                <input
                  type="number"
                  placeholder="Amount"
                  value={newEntry.amount}
                  onChange={(e) => syncTs({ amount: e.target.value })}
                />

                <select
                  value={newEntry.currency}
                  onChange={(e) => syncTs({ currency: e.target.value })}
                >
                  <option>USD</option>
                  <option>AUD</option>
                  <option>EUR</option>
                </select>

                <select
                  value={newEntry.broker}
                  onChange={(e) => syncTs({ broker: e.target.value })}
                >
                  <option>IBKR</option>
                  <option>CMC</option>
                  <option>Stake</option>
                </select>

                <input
                  placeholder="Description / note"
                  value={newEntry.note || ""}
                  onChange={(e) => syncTs({ note: e.target.value })}
                />

                <button onClick={onAdd}>Add dividend</button>

                <div style={{ fontSize: 12, opacity: 0.7, marginLeft: 6 }}>
                  Timestamp: {effectiveTs || "—"}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
