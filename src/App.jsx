import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Menu from "./components/layout/Menu";
import Landing from "./pages/Landing";
import Portfolio from "./pages/porfolio/Portfolio";
import Budget from "./pages/Budget";
import Assets from "./pages/Assets";
import Transactions from "./pages/Transactions";


export default function App() {
  return (
    <BrowserRouter>
      <Menu>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/transactions" element={<Transactions />} />
        </Routes>
      </Menu>
    </BrowserRouter>
  );
}
