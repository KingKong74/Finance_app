import React from "react";
import { NavLink } from "react-router-dom";
import "../../css/sidebar.css";

export default function Sidebar({ isOpen }) {
  const navItems = ["Portfolio", "Budget", "Assets", "Transactions"];

  return (
    <div className="sidebar-wrapper">
      <aside className={`dashboard-sidebar ${isOpen ? "" : "sb-collapsed"}`}>
        <div className="dashboard-profile">
          <div className="dashboard-avatar-fallback">👤</div>
          <div className="dashboard-username">User</div>
        </div>
        <ul className="dashboard-nav">
          {navItems.map(item => (
            <li key={item}>
              <NavLink
                to={`/${item.toLowerCase()}`}
                className={({ isActive }) =>
                  "dashboard-link" + (isActive ? " active" : "")
                }
              >
                {item}
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
