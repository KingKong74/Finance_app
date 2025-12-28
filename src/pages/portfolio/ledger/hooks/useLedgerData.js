// src/pages/portfolio/ledger/hooks/useLedgerData.js
import { useCallback, useState } from "react";
import { normaliseRow, safeUpper } from "../utils/ledgerNormalise";

export function useLedgerData(activeTab) {
  const [entries, setEntries] = useState([]);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/ledger?tab=${activeTab}`);
    if (!res.ok) throw new Error(`GET failed: ${res.status}`);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [];
    setEntries(arr.map((row) => normaliseRow(row, activeTab)));
  }, [activeTab]);

  const addEntry = useCallback(
    async (newEntry) => {
      const payload =
        activeTab === "cash"
          ? {
              date: newEntry.date,
              amount: Number(newEntry.amount || 0),
              currency: newEntry.currency,
              entryType: newEntry.entryType,
              note: newEntry.note || "",
            }
          : {
              ticker: safeUpper(newEntry.ticker),
              date: newEntry.date,
              quantity: Number(newEntry.quantity || 0),
              price: Number(newEntry.price || 0),
              fee: Math.abs(Number(newEntry.fee || 0)),
              broker: newEntry.broker,
              currency: newEntry.currency,
              realisedPL: 0,
            };

      const res = await fetch(`/api/ledger?tab=${activeTab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`POST failed: ${res.status}`);

      const json = await res.json();
      const saved = normaliseRow({ ...payload, _id: json._id }, activeTab);

      setEntries((prev) => [saved, ...prev]);
      return saved;
    },
    [activeTab]
  );

  const deleteEntry = useCallback(
    async (id) => {
      const res = await fetch(`/api/ledger/${id}?tab=${activeTab}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
      setEntries((prev) => prev.filter((x) => x._id !== id));
    },
    [activeTab]
  );

  return { entries, fetchData, addEntry, deleteEntry, setEntries };
}
