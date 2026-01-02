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
        // FX rates (AUD base) — from cached API (live + DB fallback)
        const rFx = await fetch("/api/fx?base=AUD&ttl=21600");
        const fxJson = rFx.ok ? await rFx.json() : null;
        const fxRates =
          fxJson?.rates && typeof fxJson.rates === "object"
            ? { ...fxJson.rates, AUD: 1 }
            : { AUD: 1 };

        const [rTrades, rCrypto, rForex, rCash, rDivs] = await Promise.all([
          fetch("/api/ledger?tab=trades"),
          fetch("/api/ledger?tab=crypto"),
          fetch("/api/ledger?tab=forex"),
          fetch("/api/ledger?tab=cash"),
          fetch("/api/ledger?tab=dividends"),
        ]);

        const [trades, crypto, forex, cash, divs] = await Promise.all([
          rTrades.ok ? rTrades.json() : [],
          rCrypto.ok ? rCrypto.json() : [],
          rForex.ok ? rForex.json() : [],
          rCash.ok ? rCash.json() : [],
          rDivs.ok ? rDivs.json() : [],
        ]);

        // -----------------------------
        // 1) POSITIONS (exclude FOREX)
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

        // Prices for open positions
        const symbols = Array.from(new Set(positions.map((p) => p.ticker))).filter(Boolean);
        let priceMap = {};
        if (symbols.length) {
          const rPrices = await fetch(`/api/prices?symbols=${symbols.join(",")}&ttl=60`);
          priceMap = rPrices.ok ? await rPrices.json() : {};
        }

        // Aggregate positions per broker: MV + UPNL (AUD)
        const posAgg = new Map(); // broker -> { mvAud, upnlAud }

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
        // 2) CASH (derived cash basket by CCY)
        // ------------------------------------
        // We build a basket per broker: { AUD: x, USD: y, EUR: z }
        const cashByBroker = new Map();

        const addCash = (broker, ccy, delta) => {
          const b = String(broker || "").trim() || "Unknown";
          const C = safeUpper(ccy || "AUD");
          if (!cashByBroker.has(b)) cashByBroker.set(b, {});
          const obj = cashByBroker.get(b);
          obj[C] = num(obj[C]) + num(delta);
        };

        // A) cash entries (deposit/withdrawal) — IMPORTANT: apply sign
        (Array.isArray(cash) ? cash : []).forEach((c) => {
          const entryType = safeUpper(c.entryType || "DEPOSIT");
          const amt = num(c.amount);

          const signed =
            entryType === "WITHDRAWAL" ? -Math.abs(amt) : Math.abs(amt);

          addCash(c.broker, c.currency, signed);
        });

        // B) trades + crypto cashflows (proceeds already signed in your DB)
        const applyTradeRowToCash = (t) => {
          const broker = t.broker;
          const ccy = t.currency || "USD";

          const proceeds =
            t.proceeds != null
              ? num(t.proceeds)
              : -(num(t.quantity) * num(t.price));

          addCash(broker, ccy, proceeds);

          const fee = num(t.fee);
          if (fee) addCash(broker, t.feeCurrency || "AUD", -fee);
        };

        (Array.isArray(trades) ? trades : []).forEach(applyTradeRowToCash);
        (Array.isArray(crypto) ? crypto : []).forEach(applyTradeRowToCash);

        // C) forex legs (AUD + USD)
        // AUD.USD: qty = AUD signed, proceeds = USD signed (in your DB it looks consistent)
        (Array.isArray(forex) ? forex : []).forEach((t) => {
          const broker = t.broker;

          const qtyAud = num(t.quantity);
          const proceedsUsd =
            t.proceeds != null ? num(t.proceeds) : -(qtyAud * num(t.price));

          addCash(broker, "AUD", qtyAud);
          addCash(broker, "USD", proceedsUsd);

          const fee = num(t.fee);
          if (fee) addCash(broker, t.feeCurrency || "AUD", -fee);
        });

        // D) dividends NOT included in cash (for now)
        // (Array.isArray(divs) ? divs : []).forEach(() => {})

        // Convert each broker basket into an AUD total
        const cashAudByBroker = new Map();
        for (const [broker, basket] of cashByBroker.entries()) {
          let aud = 0;
          for (const [ccy, bal] of Object.entries(basket || {})) {
            aud += toBase(num(bal), ccy, "AUD", fxRates);
          }
          cashAudByBroker.set(broker, aud);
        }

        // ------------------------------------
        // 3) BUILD ACCOUNTS (Panel)
        // ------------------------------------
        const brokers = Array.from(
          new Set([...posAgg.keys(), ...cashAudByBroker.keys()])
        ).sort((a, b) => a.localeCompare(b));

        const brokerAccounts = brokers.map((b) => {
          const positionsMvAud = num(posAgg.get(b)?.mvAud || 0);
          const posUpnlAud = num(posAgg.get(b)?.upnlAud || 0);

          const cashAud = num(cashAudByBroker.get(b) || 0);

          return {
            name: b,
            total: positionsMvAud + cashAud,
            cash: cashAud,
            // ✅ P/L = unrealised positions only (no FX unrealised, no realised)
            pl: posUpnlAud,
            dayPL: 0,
            debug: {
              fxProvider: fxJson?.provider || "",
              fxFetchedAt: fxJson?.fetchedAt || "",
              positionsMvAud,
              posUpnlAud,
              cashByCcy: cashByBroker.get(b) || {},
              cashAud,
              cashInputs: {
                cashEntriesCount: Array.isArray(cash)
                  ? cash.filter((x) => safeUpper(x.broker) === safeUpper(b)).length
                  : 0,
                tradeRowsCount: Array.isArray(trades)
                  ? trades.filter((x) => safeUpper(x.broker) === safeUpper(b)).length
                  : 0,
                cryptoRowsCount: Array.isArray(crypto)
                  ? crypto.filter((x) => safeUpper(x.broker) === safeUpper(b)).length
                  : 0,
                forexRowsCount: Array.isArray(forex)
                  ? forex.filter((x) => safeUpper(x.broker) === safeUpper(b)).length
                  : 0,
                // dividendsCount: Array.isArray(divs)
                //   ? divs.filter((x) => safeUpper(x.broker) === safeUpper(b)).length
                //   : 0,
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

        const allDebug = brokerAccounts.reduce(
          (d, a) => {
            d.positionsMvAud += num(a.debug?.positionsMvAud);
            d.posUpnlAud += num(a.debug?.posUpnlAud);
            d.cashAud += num(a.debug?.cashAud);

            const basket = a.debug?.cashByCcy || {};
            for (const [ccy, bal] of Object.entries(basket)) {
              d.cashByCcy[ccy] = num(d.cashByCcy[ccy]) + num(bal);
            }
            return d;
          },
          { positionsMvAud: 0, posUpnlAud: 0, cashAud: 0, cashByCcy: {} }
        );

        setAccounts([{ ...all, debug: allDebug }, ...brokerAccounts]);

        if (![all.name, ...brokers].includes(selectedAccount)) {
          setSelectedAccount("All Accounts");
        }

        // Optional console debug (super handy)
        // eslint-disable-next-line no-console
        console.log("Accounts debug:", [{ ...all, debug: allDebug }, ...brokerAccounts]);
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
