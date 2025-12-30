// src/pages/portfolio/overview/Overview.jsx
import React, { useEffect, useMemo, useState } from "react";
import "../../../css/overviewTab.css";

import { overviewTabs } from "./dashboard/components/overviewData";
import AccountsPanel from "./components/AccountsPanel";
import Dashboard from "./dashboard/Dashboard";
import Positions from "./positions/Positions";

import { toBase } from "./positions/utils/money";
import { buildPositionsFIFO } from "./positions/utils/positionsMath";

export default function Overview() {
  const [range, setRange] = useState("YTD");
  const [selectedAccount, setSelectedAccount] = useState("All Accounts");
  const [expandedAccount, setExpandedAccount] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [overviewTab, setOverviewTab] = useState("Dashboard");

  const [accounts, setAccounts] = useState([
    { name: "All Accounts", total: 0, cash: 0, pl: 0, dayPL: 0 },
  ]);

  const [fxRates, setFxRates] = useState({ AUD: 1 });
  const [fxReady, setFxReady] = useState(false);

  // ─────────────────────────────────────────────
  // 1️⃣ Fetch FX (AUD base, DB-backed)
  // ─────────────────────────────────────────────
  useEffect(() => {
    const loadFx = async () => {
      try {
        const r = await fetch("/api/fx?base=AUD");
        if (!r.ok) throw new Error("FX failed");
        const json = await r.json();

        const rates = { ...(json.rates || {}) };
        rates.AUD = 1;

        setFxRates(rates);
        setFxReady(true);
      } catch (e) {
        console.warn("FX unavailable, totals may be inaccurate");
        setFxRates({ AUD: 1 });
        setFxReady(true);
      }
    };

    loadFx();
  }, []);

  // ─────────────────────────────────────────────
  // 2️⃣ Build accounts from ledger data
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!fxReady) return;

    const run = async () => {
      try {
        const [rTrades, rCrypto, rDivs] = await Promise.all([
          fetch("/api/ledger?tab=trades"),
          fetch("/api/ledger?tab=crypto"),
          fetch("/api/ledger?tab=dividends"),
        ]);

        const [trades, crypto, divs] = await Promise.all([
          rTrades.ok ? rTrades.json() : [],
          rCrypto.ok ? rCrypto.json() : [],
          rDivs.ok ? rDivs.json() : [],
        ]);

        const allTrades = [
          ...(Array.isArray(trades) ? trades : []),
          ...(Array.isArray(crypto) ? crypto : []),
        ];

        // Normalise trades (broker-aware)
        const normalisedTrades = allTrades
          .map((t) => ({
            broker: String(t.broker || "").trim() || "Unknown",
            ticker: String(t.ticker || "").toUpperCase(),
            date: String(t.date || ""),
            quantity: Number(t.quantity || 0),
            price: Number(t.price || 0),
            fee: Number(t.fee || 0),
            currency: String(t.currency || "USD"),
            type: t.type || "trades",
            realisedPL: Number(t.realisedPL || 0),
          }))
          .filter((t) => t.ticker && t.date);

        normalisedTrades.sort((a, b) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0
        );

        // Build FIFO open positions
        const positions = buildPositionsFIFO(normalisedTrades, {
          useLastTradeAsMarketPrice: true,
        });

        // Fetch prices once
        const symbols = Array.from(
          new Set(positions.map((p) => p.ticker))
        ).filter(Boolean);

        let priceMap = {};
        if (symbols.length) {
          const rPrices = await fetch(
            `/api/prices?symbols=${symbols.join(",")}&ttl=60`
          );
          priceMap = rPrices.ok ? await rPrices.json() : {};
        }

        // ─────────────────────────────────────────
        // 3️⃣ Market value per broker (AUD)
        // ─────────────────────────────────────────
        const totalByBroker = new Map();

        for (const p of positions) {
          const info = priceMap?.[p.ticker];
          const px =
            info?.price != null
              ? Number(info.price)
              : Number(p.marketPrice || 0);

          if (!px) continue;

          const mv = Number(p.quantity || 0) * px;

          const mvAud = toBase(
            mv,
            p.currency,
            "AUD",
            fxRates // ✅ THIS WAS THE BUG
          );

          const broker = String(p.broker || "").trim() || "Unknown";
          totalByBroker.set(
            broker,
            (totalByBroker.get(broker) || 0) + mvAud
          );
        }

        // Realised P/L per broker
        const realisedByBroker = new Map();
        for (const t of normalisedTrades) {
          realisedByBroker.set(
            t.broker,
            (realisedByBroker.get(t.broker) || 0) +
              Number(t.realisedPL || 0)
          );
        }

        // Dividends per broker (still simple for now)
        const divByBroker = new Map();
        (Array.isArray(divs) ? divs : []).forEach((d) => {
          const broker = String(d.broker || "").trim() || "Unknown";
          divByBroker.set(
            broker,
            (divByBroker.get(broker) || 0) + Number(d.amount || 0)
          );
        });

        const brokers = Array.from(
          new Set([
            ...totalByBroker.keys(),
            ...realisedByBroker.keys(),
            ...divByBroker.keys(),
          ])
        ).sort();

        const brokerAccounts = brokers.map((b) => ({
          name: b,
          total: Number(totalByBroker.get(b) || 0),
          cash: 0,
          pl:
            Number(realisedByBroker.get(b) || 0) +
            Number(divByBroker.get(b) || 0),
          dayPL: 0,
        }));

        const all = brokerAccounts.reduce(
          (acc, a) => {
            acc.total += a.total;
            acc.cash += a.cash;
            acc.pl += a.pl;
            acc.dayPL += a.dayPL;
            return acc;
          },
          { name: "All Accounts", total: 0, cash: 0, pl: 0, dayPL: 0 }
        );

        setAccounts([all, ...brokerAccounts]);

        if (![all.name, ...brokers].includes(selectedAccount)) {
          setSelectedAccount("All Accounts");
        }
      } catch (e) {
        console.error("Overview accounts build failed:", e);
      }
    };

    run();
  }, [fxReady, fxRates, selectedAccount]);

  const activeAccount = useMemo(
    () => accounts.find((a) => a.name === selectedAccount) || accounts[0],
    [accounts, selectedAccount]
  );

  const rateOfReturn = useMemo(() => {
    const base = activeAccount.total - activeAccount.pl;
    if (!base) return 0;
    return (activeAccount.pl / base) * 100;
  }, [activeAccount]);

  return (
    <div className="overview-grid-wrapper">
      <AccountsPanel
        accounts={accounts}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((p) => !p)}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        expandedAccount={expandedAccount}
        setExpandedAccount={setExpandedAccount}
      />

      <section className="overview-main">
        <div className="overview-secondary-tabs">
          {overviewTabs.map((tab) => (
            <button
              key={tab}
              className={`overview-tab ${
                overviewTab === tab ? "active" : ""
              }`}
              onClick={() => setOverviewTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {overviewTab === "Dashboard" && (
          <Dashboard
            range={range}
            onRangeChange={setRange}
            selectedAccount={selectedAccount}
            activeAccount={activeAccount}
            rateOfReturn={rateOfReturn}
          />
        )}

        {overviewTab === "Positions" && <Positions />}

        {overviewTab !== "Dashboard" &&
          overviewTab !== "Positions" && (
            <p style={{ padding: "2rem" }}>
              {overviewTab} content coming soon
            </p>
          )}
      </section>
    </div>
  );
}
