import React from "react";

export default function Stratergy() {
  const testInsert = async () => {
    try {
      const dummyTrade = {
        symbol: "BTC",
        price: 50000,
        amount: 0.1,
        fee: 5,
      };

      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dummyTrade),
      });

      // Check for non-2xx responses
      if (!res.ok) {
        const text = await res.text();
        console.error("API responded with an error:", text);
        return;
      }

      const data = await res.json();
      console.log("Inserted trade:", data);
      alert("Trade inserted! Check console for details.");
    } catch (err) {
      console.error("Error calling API:", err);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Trade Insert Test</h1>
      <button onClick={testInsert}>Insert Dummy Trade</button>
    </div>
  );
}
