// src/pages/ledger/Strategy.jsx
import React from "react";

export default function Strategy() {
  const testInsert = async () => {
    const dummyTrade = {
      ticker: "TEST",
      date: new Date().toISOString().slice(0, 10),
      quantity: 10,
      price: 100,
      fee: 1,
      broker: "IBKR",
      currency: "USD",
      realisedPL: 10 * 100 - 1,
    };

    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dummyTrade),
      });

      // Safe JSON parsing
      let data;
      try {
        data = await res.json();
      } catch (err) {
        const text = await res.text();
        console.error("Response is not JSON:", text);
        alert(`API returned non-JSON. Check console.`);
        return;
      }

      if (res.ok) {
        console.log("Trade inserted:", data);
        alert("Trade inserted successfully! Check console.");
      } else {
        console.error("Failed to insert trade:", data);
        alert("Failed to insert trade. Check console for details.");
      }
    } catch (err) {
      console.error("Error calling API:", err);
      alert("Error calling API. Check console.");
    }
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Database Test</h2>
      <p>Click the button to try inserting a dummy trade.</p>
      <button onClick={testInsert}>Insert Dummy Trade</button>
    </div>
  );
}
