// src/components/layout/Menu.jsx
import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function Menu({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true); // sidebar starts open

  const toggleSidebar = () => setSidebarOpen(prev => !prev);

  return (
    <div className={`dashboard-main ${sidebarOpen ? "" : "sb-collapsed"}`} style={{ display: "flex", flexDirection: "column", minHeight: "100svh" }}>
      {/* Header stays full width and fixed on top */}
      <Header onHamburger={toggleSidebar} />

      {/* Main layout: sidebar + page content */}
      <div style={{ display: "flex", flex: 1 }}>
        {/* Sidebar collapses via CSS */}
        <Sidebar isOpen={sidebarOpen} />

        {/* Page content shifts only when sidebar is open */}
        <div
          className="dashboard-content"
          style={{
            flex: 1,
            transition: "margin-left 0.3s ease",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
