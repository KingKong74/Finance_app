// components/layout/Header.jsx
import React from "react";

export default function Header({ onHamburger }) {
  return (
    <header className="app-header" style={{ display: "flex", alignItems: "center", padding: "1rem", background: "#1976d2", color: "#fff" }}>
      <button
        className="nav-toggle"
        onClick={onHamburger}
        style={{ fontSize: "1.5rem", marginRight: "1rem", background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}
      >
        ☰
      </button>
      <h1 style={{ margin: 0, fontSize: "1.2rem" }}>Finance Dashboard</h1>
    </header>
  );
}
