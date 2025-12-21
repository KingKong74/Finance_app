import React from "react";

export default function StatCard({ title, value }) {
  return (
    <div
      style={{
        padding: "1rem",
        borderRadius: "8px",
        background: "#f5f5f5",
        minWidth: "200px",
        boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
      }}
    >
      <p style={{ margin: 0, color: "#555" }}>{title}</p>
      <h2 style={{ margin: "0.5rem 0 0" }}>{value}</h2>
    </div>
  );
}
