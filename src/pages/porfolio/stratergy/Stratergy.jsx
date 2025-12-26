import React, { useState } from "react";

export default function Strategy() {
  const [status, setStatus] = useState("");

  const testInsert = async () => {
    setStatus("Testing insert...");
    const dummyTrade = {
      symbol: "AAPL",
      type: "BUY",
      amount: 10,
      price: 150,
      fee: 1.5,
      date: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dummyTrade),
      });

      if (!res.ok) {
        const text = await res.text(); // get raw error text from server
        throw new Error(`API responded with status ${res.status}: ${text}`);
      }

      const data = await res.json();
      setStatus(`Insert successful! Trade ID: ${data._id}`);
    } catch (err) {
      console.error("API insert error:", err);
      setStatus(`Error inserting trade: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Test Trade Insert</h1>
      <button onClick={testInsert} style={{ padding: "0.5rem 1rem" }}>
        Insert Dummy Trade
      </button>
      <p>{status}</p>
    </div>
  );
}
