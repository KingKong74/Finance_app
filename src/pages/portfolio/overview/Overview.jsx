// src/pages/portfolio/overview/Overview.jsx
import React, { useEffect, useMemo, useState } from "react";
import "../../../css/overviewTab.css";

import { overviewTabs } from "./dashboard/components/overviewData";
import AccountsPanel from "./components/AccountsPanel";
import Dashboard from "./dashboard/Dashboard";
import Positions from "./positions/Positions";

import { toBase } from "./positions/utils/money";
import { buildPositionsFIFO } from "./positions/utils/positionsMath";

function safeUpper(s) {
  return String(s || "").trim().toUpperCase();
}
function num(x) {
  if (typeof x === "string") x = x.replace(/,/g, "");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export default function Overview() {
  const [range, setRange] = useState("YTD");
  const [selectedAccount, setSelectedAccount] = useState("All Accounts");
  const [expandedAccount, setExpandedAccount] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [overviewTab, setOverviewTab] = useState("Dashboard");

  const [accounts, setAccounts] = useState([
    { name: "All Accounts", total: 0, cash: 0, pl: 0, dayPL: 0 },
  ]);

  useEffect(() => {
    const run = async () => {
      try {
        // FX (AUD base)
        const rFx = await fetch("/api?action=fx&base=AUD&ttl=21600");
        const fxJson = rFx.ok ? await rFx.json() : null;
        const fxRates =
          fxJson?.rates && typeof fxJson.rates === "object"
            ? { ...fxJson.rates, AUD: 1 }
            : { AUD: 1 };

        // Ledger (positions inputs)
        const [rTrades, rCrypto, rForex] = await Promise.all([
          fetch("/api?action=ledger&tab=trades"),
          fetch("/api?action=ledger&tab=crypto"),
          fetch("/api?action=ledger&tab=forex"),
        ]);

        const [trades, crypto, forex] = await Promise.all([
          rTrades.ok ? rTrades.json() : [],
          rCrypto.ok ? rCrypto.json() : [],
          rForex.ok ? rForex.json() : [],
        ]);

        // -----------------------------
        // 1) POSITIONS (exclude forex)
        // -----------------------------
        const allTradeRows = [
          ...(Array.isArray(trades) ? trades : []),
          ...(Array.isArray(crypto) ? crypto : []),
        ];

        const normalisedForPositions = allTradeRows
          .map((t) => ({
            broker: String(t.broker || "").trim() || "Unknown",
            ticker: safeUpper(t.ticker),
            date: String(t.date || ""),
            quantity: num(t.quantity),
            price: num(t.price),
            fee: num(t.fee),
            currency: safeUpper(t.currency || "USD"),
            type: t.type || "trades",
          }))
          .filter((t) => t.ticker && t.date && safeUpper(t.type) !== "FOREX");

        normalisedForPositions.sort((a, b) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0
        );

        const positions = buildPositionsFIFO(normalisedForPositions, {
          useLastTradeAsMarketPrice: true,
        });

        const symbols = Array.from(new Set(positions.map((p) => p.ticker))).filter(Boolean);

        let priceMap = {};
        if (symbols.length) {
          const rPrices = await fetch(
            `/api?action=prices&symbols=${symbols.join(",")}&ttl=60`
          );
          priceMap = rPrices.ok ? await rPrices.json() : {};
        }

        // broker -> { mvAud, upnlAud }
        const posAgg = new Map();

        for (const p of positions) {
          const broker = String(p.broker || "").trim() || "Unknown";
          const info = priceMap?.[p.ticker];

          const px = info?.price != null ? num(info.price) : num(p.marketPrice);
          const mv = px ? num(p.quantity) * px : 0;

          const mvAud = toBase(mv, p.currency, "AUD", fxRates);
          const cbAud = toBase(num(p.costBasis), p.currency, "AUD", fxRates);
          const upnlAud = mvAud - cbAud;

          const cur = posAgg.get(broker) || { mvAud: 0, upnlAud: 0 };
          cur.mvAud += mvAud;
          cur.upnlAud += upnlAud;
          posAgg.set(broker, cur);
        }

        // ------------------------------------
        // 2) CASH (source of truth = cash-report endpoint)
        // ------------------------------------
        const brokers = Array.from(
          new Set([
            ...Array.from(posAgg.keys()),
            ...((Array.isArray(trades) ? trades : []).map((t) => String(t.broker || "").trim() || "Unknown")),
            ...((Array.isArray(crypto) ? crypto : []).map((t) => String(t.broker || "").trim() || "Unknown")),
            ...((Array.isArray(forex) ? forex : []).map((t) => String(t.broker || "").trim() || "Unknown")),
          ])
        )
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));

        const cashByBroker = new Map();

        await Promise.all(
          brokers.map(async (b) => {
            try {
              const r = await fetch(
                `/api?action=overview/cash-report&broker=${encodeURIComponent(b)}`
              );
              const j = r.ok ? await r.json() : null;

              const balancesRaw =
                j?.balances && typeof j.balances === "object" ? j.balances : {};

              const balances = {
                AUD: num(balancesRaw.AUD),
                USD: num(balancesRaw.USD),
                EUR: num(balancesRaw.EUR),
              };

              const cashAud =
                toBase(balances.AUD, "AUD", "AUD", fxRates) +
                toBase(balances.USD, "USD", "AUD", fxRates) +
                toBase(balances.EUR, "EUR", "AUD", fxRates);

              cashByBroker.set(b, {
                balances,
                cashAud,
                asOf: j?.asOf || "",
                source: j?.source || "db",
              });
            } catch {
              cashByBroker.set(b, {
                balances: { AUD: 0, USD: 0, EUR: 0 },
                cashAud: 0,
                asOf: "",
                source: "missing",
              });
            }
          })
        );

        // ------------------------------------
        // 3) BUILD ACCOUNTS (Panel)
        // ------------------------------------
        const brokerAccounts = brokers.map((b) => {
          const positionsMvAud = num(posAgg.get(b)?.mvAud || 0);
          const posUpnlAud = num(posAgg.get(b)?.upnlAud || 0);

          const cashInfo = cashByBroker.get(b) || {
            balances: { AUD: 0, USD: 0, EUR: 0 },
            cashAud: 0,
            asOf: "",
            source: "missing",
          };

          const cashAud = num(cashInfo.cashAud || 0);

          return {
            name: b,
            total: positionsMvAud + cashAud,
            cash: cashAud,
            pl: posUpnlAud, // unrealised positions only
            dayPL: 0,
            debug: {
              positionsMvAud,
              posUpnlAud,
              cashReport: {
                balances: cashInfo.balances,
                asOf: cashInfo.asOf,
                source: cashInfo.source,
                cashAud,
              },
            },
          };
        });

        const all = brokerAccounts.reduce(
          (acc, a) => {
            acc.total += num(a.total);
            acc.cash += num(a.cash);
            acc.pl += num(a.pl);
            acc.dayPL += num(a.dayPL);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeAccount = useMemo(
    () => accounts.find((a) => a.name === selectedAccount) || accounts[0],
    [accounts, selectedAccount]
  );

  const rateOfReturn = useMemo(() => {
    const base = num(activeAccount.total) - num(activeAccount.pl);
    if (!base) return 0;
    return (num(activeAccount.pl) / base) * 100;
  }, [activeAccount]);

  return (
    <div className="overview-grid-wrapper">
      <AccountsPanel
        accounts={accounts}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((prev) => !prev)}
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
              className={`overview-tab ${overviewTab === tab ? "active" : ""}`}
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

        {overviewTab !== "Dashboard" && overviewTab !== "Positions" && (
          <p style={{ padding: "2rem" }}>{overviewTab} content coming soon</p>
        )}
      </section>
    </div>
  );
}
