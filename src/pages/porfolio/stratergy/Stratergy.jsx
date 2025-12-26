import React, { useState } from "react";

export default function Stratergy() {
  const [log, setLog] = useState("");

  const testInsert = async () => {
    const testTrade = {
      symbol: "AAPL",
      price: 170,
      qty: 10,
      side: "BUY",
      timestamp: new Date(),
    };

    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testTrade),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API responded with status ${res.status}: ${text}`);
      }

      const data = await res.json();
      setLog(`✅ Trade inserted with ID: ${data.insertedId}`);
    } catch (err) {
      console.error("Error inserting trade:", err);
      setLog(`❌ ${err.message}`);
    }
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Test Trade Insert</h2>
      <button onClick={testInsert} style={{ marginBottom: "1rem" }}>
        Insert Test Trade
      </button>
      <pre>{log}</pre>
    </div>
  );
}
