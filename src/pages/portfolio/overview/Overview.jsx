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

function computeFxPositionAndUpnlAud(forexTrades, fxRates, broker) {
  // AUD.USD:
  // qty = AUD amount (signed), price = USD per AUD
  // proceeds = -(qty*price) in USD
  const r = fxRates || {};
  const lots = []; // USD lots: [{ usd, costAud }]
  const bKey = safeUpper(broker);

  const trades = (Array.isArray(forexTrades) ? forexTrades : [])
    .filter((t) => safeUpper(t.type) === "FOREX")
    .filter((t) => safeUpper(t.ticker) === "AUD.USD")
    .filter((t) => safeUpper(t.broker) === bKey)
    .map((t) => {
      const qtyAud = num(t.quantity);
      const price = num(t.price);
      const proceedsUsd =
        t.proceeds != null ? num(t.proceeds) : -(qtyAud * price);

      const fee = num(t.fee);
      const feeCurrency = safeUpper(t.feeCurrency || "AUD");

      return {
        date: String(t.date || ""),
        ts: String(t.ts || ""),
        qtyAud,
        proceedsUsd,
        fee,
        feeCurrency,
      };
    })
    .filter((t) => t.date);

  trades.sort((a, b) => {
    const ka = a.ts || `${a.date}T00:00:00`;
    const kb = b.ts || `${b.date}T00:00:00`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  for (const t of trades) {
    const feeAud =
      t.feeCurrency === "AUD" ? t.fee : toBase(t.fee, t.feeCurrency, "AUD", r);

    if (t.qtyAud < 0) {
      // sell AUD, receive USD => BUY USD lot
      const usdBought = Math.max(0, t.proceedsUsd);
      const audCost = Math.abs(t.qtyAud) + feeAud;

      if (usdBought > 0) lots.push({ usd: usdBought, costAud: audCost });
      continue;
    }

    if (t.qtyAud > 0) {
      // buy AUD, spend USD => SELL USD lots FIFO
      const usdSpent = Math.max(0, -t.proceedsUsd);
      let remaining = usdSpent;

      while (remaining > 1e-12 && lots.length) {
        const lot = lots[0];
        const take = Math.min(remaining, lot.usd);

        const lotUsdBefore = lot.usd;
        lot.usd -= take;

        const ratio = take / (lotUsdBefore || 1);
        lot.costAud -= lot.costAud * ratio;

        remaining -= take;

        if (lot.usd <= 1e-12) lots.shift();
      }

      // fee drags remaining position (approx)
      if (feeAud > 0 && lots.length) lots[0].costAud += feeAud;
    }
  }

  const usdOpen = lots.reduce((a, l) => a + l.usd, 0);
  const costAudOpen = lots.reduce((a, l) => a + l.costAud, 0);
  const valueAudOpen = toBase(usdOpen, "USD", "AUD", r);
  const upnlAud = valueAudOpen - costAudOpen;

  return { usdOpen, upnlAud };
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
        // FX rates (AUD base) — from your cached API
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

        // ---- POSITIONS (exclude forex conversions) ----
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

        // prices
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

        // broker aggregates
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

        // ---- CASH (derived) ----
        // IMPORTANT: DO NOT add dividends into cash (for now)
        const cashByBroker = new Map(); // broker -> { CCY: bal }

        const addCash = (broker, ccy, delta) => {
          const b = String(broker || "").trim() || "Unknown";
          const C = safeUpper(ccy || "AUD");
          if (!cashByBroker.has(b)) cashByBroker.set(b, {});
          const obj = cashByBroker.get(b);
          obj[C] = num(obj[C]) + num(delta);
        };

        // ✅ FIX 1: cash entries MUST respect entryType (withdrawals subtract)
        (Array.isArray(cash) ? cash : []).forEach((c) => {
          const amt = num(c.amount);
          const sign =
            safeUpper(c.entryType) === "WITHDRAWAL" ? -1 : 1; // deposit/default +1
          addCash(c.broker, c.currency, sign * amt);
        });

        // trade proceeds + fees (no realised PL)
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

        // forex legs affect cash:
        // USD leg = proceeds (USD cashflow)
        // AUD leg = quantity (AUD amount)
        (Array.isArray(forex) ? forex : []).forEach((t) => {
          const broker = t.broker;
          const proceedsUsd =
            t.proceeds != null
              ? num(t.proceeds)
              : -(num(t.quantity) * num(t.price));
          addCash(broker, "USD", proceedsUsd);
          addCash(broker, "AUD", num(t.quantity));

          const fee = num(t.fee);
          if (fee) addCash(broker, t.feeCurrency || "AUD", -fee);
        });

        // convert cash baskets to AUD totals
        const cashAudByBroker = new Map();
        for (const [broker, basket] of cashByBroker.entries()) {
          let aud = 0;
          for (const [ccy, bal] of Object.entries(basket || {})) {
            aud += toBase(num(bal), ccy, "AUD", fxRates);
          }
          cashAudByBroker.set(broker, aud);
        }

        // ---- FX UNREALISED (AUD) ----
        const fxUpnlAudByBroker = new Map();
        const fxUsdOpenByBroker = new Map();

        const forexBrokers = Array.from(
          new Set(
            (Array.isArray(forex) ? forex : []).map(
              (t) => String(t.broker || "").trim() || "Unknown"
            )
          )
        );

        for (const b of forexBrokers) {
          const { usdOpen, upnlAud } = computeFxPositionAndUpnlAud(
            forex,
            fxRates,
            b
          );
          fxUsdOpenByBroker.set(b, usdOpen);
          fxUpnlAudByBroker.set(b, upnlAud);
        }

        // ---- BUILD ACCOUNTS ----
        const brokers = Array.from(
          new Set([
            ...posAgg.keys(),
            ...cashAudByBroker.keys(),
            ...fxUpnlAudByBroker.keys(),
          ])
        ).sort((a, b) => a.localeCompare(b));

        const brokerAccounts = brokers.map((b) => {
          const positionsMvAud = num(posAgg.get(b)?.mvAud || 0);
          const posUpnlAud = num(posAgg.get(b)?.upnlAud || 0);

          const cashAud = num(cashAudByBroker.get(b) || 0);

          const fxUpnlAud = num(fxUpnlAudByBroker.get(b) || 0);

          // ✅ FIX 2: P/L shown in panel should be UNREALISED POSITIONS ONLY
          // (NOT FX unrealised — per your latest requirement)
          const plAud = posUpnlAud;

          return {
            name: b,
            total: positionsMvAud + cashAud,
            cash: cashAud,
            pl: plAud,
            dayPL: 0,
            debug: {
              positionsMvAud,
              cashAud,
              fxUpnlAud, // still tracked for later UI
              posUpnlAud,
              fxUsdOpen: num(fxUsdOpenByBroker.get(b) || 0),
              cashByCcy: cashByBroker.get(b) || {},
              // divsCount: (Array.isArray(divs) ? divs : []).filter((d) => safeUpper(d.broker) === safeUpper(b)).length,
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

        // Build a combined debug for "All Accounts"
        const allDebug = brokerAccounts.reduce(
          (d, a) => {
            d.positionsMvAud += num(a.debug?.positionsMvAud);
            d.cashAud += num(a.debug?.cashAud);
            d.fxUpnlAud += num(a.debug?.fxUpnlAud);
            d.posUpnlAud += num(a.debug?.posUpnlAud);
            d.fxUsdOpen += num(a.debug?.fxUsdOpen);

            const basket = a.debug?.cashByCcy || {};
            for (const [ccy, bal] of Object.entries(basket)) {
              d.cashByCcy[ccy] = num(d.cashByCcy[ccy]) + num(bal);
            }
            return d;
          },
          {
            positionsMvAud: 0,
            cashAud: 0,
            fxUpnlAud: 0,
            posUpnlAud: 0,
            fxUsdOpen: 0,
            cashByCcy: {},
          }
        );

        setAccounts([{ ...all, debug: allDebug }, ...brokerAccounts]);

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
