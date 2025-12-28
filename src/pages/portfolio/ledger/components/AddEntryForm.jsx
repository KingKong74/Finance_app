import React from "react";

export default function AddEntryForm({ activeTab, newEntry, setNewEntry, onAdd }) {
  return (
    <div className="ledger-entry-box">
      <h4>Add New {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h4>

      <div className="ledger-entry-fields">
        {activeTab !== "cash" ? (
          <>
            <input
              placeholder="Ticker"
              value={newEntry.ticker}
              onChange={(e) =>
                setNewEntry((p) => ({ ...p, ticker: e.target.value.toUpperCase() }))
              }
            />
            <input
              type="date"
              value={newEntry.date}
              onChange={(e) => setNewEntry((p) => ({ ...p, date: e.target.value }))}
            />
            <input
              type="number"
              placeholder="Qty"
              value={newEntry.quantity}
              onChange={(e) => setNewEntry((p) => ({ ...p, quantity: e.target.value }))}
            />
            <input
              type="number"
              placeholder="Price"
              value={newEntry.price}
              onChange={(e) => setNewEntry((p) => ({ ...p, price: e.target.value }))}
            />
            <input
              type="number"
              placeholder="Fee"
              value={newEntry.fee}
              onChange={(e) => setNewEntry((p) => ({ ...p, fee: e.target.value }))}
            />

            <select
              value={newEntry.currency}
              onChange={(e) => setNewEntry((p) => ({ ...p, currency: e.target.value }))}
            >
              <option>USD</option>
              <option>AUD</option>
              <option>EUR</option>
            </select>

            <select
              value={newEntry.broker}
              onChange={(e) => setNewEntry((p) => ({ ...p, broker: e.target.value }))}
            >
              <option>IBKR</option>
              <option>CMC</option>
              <option>Stake</option>
            </select>
          </>
        ) : (
          <>
            <input
              type="date"
              value={newEntry.date}
              onChange={(e) => setNewEntry((p) => ({ ...p, date: e.target.value }))}
            />
            <input
              type="number"
              placeholder="Amount"
              value={newEntry.amount}
              onChange={(e) => setNewEntry((p) => ({ ...p, amount: e.target.value }))}
            />
            <select
              value={newEntry.entryType}
              onChange={(e) => setNewEntry((p) => ({ ...p, entryType: e.target.value }))}
            >
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
            <select
              value={newEntry.currency}
              onChange={(e) => setNewEntry((p) => ({ ...p, currency: e.target.value }))}
            >
              <option>USD</option>
              <option>AUD</option>
              <option>EUR</option>
            </select>
          </>
        )}

        <button onClick={onAdd}>Add {activeTab}</button>
      </div>
    </div>
  );
}
