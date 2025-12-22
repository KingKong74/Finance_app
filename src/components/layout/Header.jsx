import React from "react";

export default function Header({ onHamburger }) {
  return (
    <header
      className="app-header"
      style={{
        display: "flex",
        position: "sticky",  // keeps it at the top
        top: 0,              // distance from top
        zIndex: 100,         // stays above other content
        alignItems: "center",
        padding: "0.5rem 1rem",
        background: "#094c90ff",
        color: "#fff",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)" // optional shadow for separation
      }}
    >
      <button
        className="nav-toggle"
        onClick={onHamburger}
        style={{
          fontSize: "1.5rem",
          marginRight: "1rem",
          background: "transparent",
          border: "none",
          color: "#fff",
          cursor: "pointer"
        }}
      >
        ☰
      </button>
      <h1 style={{ margin: 0, fontSize: "1.2rem" }}>Finance Dashboard</h1>
    </header>
  );
}
