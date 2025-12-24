import React from "react";

const sizeFont = "0.9rem";

export default function StatCard({ title, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.3rem 0rem",
        borderRadius: "0px",
        background: "#ffffffff",
        minWidth: "180px",
        paddingRight: "1.6rem",
        // boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
      }}
    >
      <p style={{ margin: 0, color: "#555", fontSize: sizeFont}}>{title}</p>
      <p style={{ margin: 0, fontSize: sizeFont }}>{value}</p>
    </div>
  );
}
