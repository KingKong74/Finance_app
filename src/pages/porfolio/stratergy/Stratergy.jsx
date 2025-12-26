import React from "react";

export default function Strategy() {
  const testInsert = async () => {
    const sampleTrade = {
      symbol: "AAPL",
      price: 200,
      quantity: 1,
      type: "buy",
      date: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleTrade),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`API responded with status ${res.status}:`, text);
        return;
      }

      const data = await res.json();
      console.log("Trade inserted:", data);
    } catch (err) {
      console.error("Error calling API:", err);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>DB Test Insert</h1>
      <button onClick={testInsert}>Insert Sample Trade</button>
    </div>
  );
}
