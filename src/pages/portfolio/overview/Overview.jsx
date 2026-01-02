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

/**
 * FX lots from forex conversions:
 * Symbol: AUD.USD
 * quantity = AUD amount (signed)
 * price    = USD per 1 AUD
 * proceeds = -(qty * price)  (USD cashflow)
 *
 * We treat this as buying/selling USD lots with an AUD cost basis,
 * then compute unrealised using current USD->AUD conversion.
 */
function computeFxUnrealisedAud(forexTrades, fxRates, broker) {
  const r = fxRates || {};
  const lots = []; // [{ usd, costAud }]
  let usdNet = 0;

  const trades = (Array.isArray(forexTrades) ? forexTrades : [])
    .filter((t) => safeUpper(t.ticker) === "AUD.USD" && safeUpper(t.broker) === safeUpper(broker))
    .map((t) => ({
      date: String(t.date || ""),
      ts: String(t.ts || ""),
      qtyAud: num(t.quantity),
      price: num(t.price),
      proceedsUsd: t.proceeds != null ? num(t.proceeds) : -(num(t.quantity) * num(t.price)),
      fee: num(t.fee),
      feeCurrency: safeUpper(t.feeCurrency || "AUD"),
    }))
    .filter((t) => t.date);

  trades.sort((a, b) => {
    const ka = a.ts || `${a.date}T00:00:00`;
    const kb = b.ts || `${b.date}T00:00:00`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  for (const t of trades) {
    const feeAud =
      t.feeCurrency === "AUD" ? t.fee : toBase(t.fee, t.feeCurrency, "AUD", r);

    // qtyAud < 0 => sell AUD, receive USD => BUY USD lot
    if (t.qtyAud < 0) {
      const usdBought = Math.max(0, t.proceedsUsd); // should be positive
      const audCost = Math.abs(t.qtyAud) + feeAud;
      if (usdBought > 0) {
        lots.push({ usd: usdBought, costAud: audCost });
        usdNet += usdBought;
      }
      continue;
    }

    // qtyAud > 0 => buy AUD, pay USD => SELL USD lots FIFO
    if (t.qtyAud > 0) {
      const usdSpent = Math.max(0, -t.proceedsUsd); // proceeds negative on buy
      let remaining = usdSpent;

      while (remaining > 1e-12 && lots.length) {
        const lot = lots[0];
        const take = Math.min(remaining, lot.usd);

        // reduce lot
        lot.usd -= take;
        const proportion = take / (take + lot.usd || 1);
        lot.costAud -= lot.costAud * proportion;

        remaining -= take;

        if (lot.usd <= 1e-12) lots.shift();
      }

      // fee on sell USD also drags remaining position value (we just reduce unrealised by fee)
      if (feeAud > 0 && lots.length) {
        // apply fee to first remaining lot cost basis (close enough)
        lots[0].costAud += feeAud;
      } else if (feeAud > 0 && !lots.length) {
        // no open lots — ignore
      }

      usdNet -= usdSpent;
    }
  }

  const usdOpen = lots.reduce((a, l) => a + l.usd, 0);
  const costAudOpen = lots.reduce((a, l) => a + l.costAud, 0);

  const valueAudOpen = toBase(usdOpen, "USD", "AUD", r);
  const unrealisedAud = valueAudOpen - costAudOpen;

  return unrealisedAud;
}

export default function Overview() {
  const [range, setRange] = useState("YTD");
  const [selectedAccount, setSelectedAccount] = useState("All Accounts");
  const [expandedAccount, setExpandedAccount] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [overviewTab, setOverviewTab] = useState("Dashboard");

  const [accounts, setAccounts] = useState([{ name: "All Accounts", total: 0, cash: 0, pl: 0, dayPL: 0 }]);

  useEffect(() => {
    const run = async () => {
      try {
        // FX (AUD base)
        const rFx = await fetch("/api/fx?base=AUD&ttl=21600");
        const fxJson = rFx.ok ? await rFx.json() : null;
        const fxRates = fxJson?.rates && typeof fxJson.rates === "object" ? { ...fxJson.rates, AUD: 1 } : { AUD: 1 };

        // Pull everything we need
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

        const allTradeRows = [
          ...(Array.isArray(trades) ? trades : []),
          ...(Array.isArray(crypto) ? crypto : []),
        ];

        // ----- POSITIONS (exclude forex; it’s conversions) -----
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
          .filter((t) => t.ticker && t.date && t.type !== "forex");

        normalisedForPositions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

        const positions = buildPositionsFIFO(normalisedForPositions, { useLastTradeAsMarketPrice: true });

        // Prices for equities/crypto
        const symbols = Array.from(new Set(positions.map((p) => p.ticker))).filter(Boolean);
        let priceMap = {};
        if (symbols.length) {
          const rPrices = await fetch(`/api/prices?symbols=${symbols.join(",")}&ttl=60`);
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

        // ----- CASH (cash entries + dividends + trade proceeds + fees) -----
        // cashByBroker: broker -> { AUD: n, USD: n, EUR: n, ... }
        const cashByBroker = new Map();
        const addCash = (broker, ccy, delta) => {
          const b = String(broker || "").trim() || "Unknown";
          const c = safeUpper(ccy || "AUD");
          if (!cashByBroker.has(b)) cashByBroker.set(b, {});
          const obj = cashByBroker.get(b);
          obj[c] = num(obj[c]) + num(delta);
        };

        // cash entries (amount already signed in your importer)
        (Array.isArray(cash) ? cash : []).forEach((c) => {
          addCash(c.broker, c.currency, num(c.amount));
        });

        // dividends
        (Array.isArray(divs) ? divs : []).forEach((d) => {
          addCash(d.broker, d.currency, num(d.amount));
        });

        // trades + crypto: use proceeds + feeCurrency
        (Array.isArray(trades) ? trades : []).forEach((t) => {
          const broker = t.broker;
          const ccy = t.currency || "USD";
          const proceeds = t.proceeds != null ? num(t.proceeds) : -(num(t.quantity) * num(t.price));
          addCash(broker, ccy, proceeds);

          const fee = num(t.fee);
          if (fee) addCash(broker, t.feeCurrency || "AUD", -fee);
        });

        (Array.isArray(crypto) ? crypto : []).forEach((t) => {
          const broker = t.broker;
          const ccy = t.currency || "USD";
          const proceeds = t.proceeds != null ? num(t.proceeds) : -(num(t.quantity) * num(t.price));
          addCash(broker, ccy, proceeds);

          const fee = num(t.fee);
          if (fee) addCash(broker, t.feeCurrency || "AUD", -fee);
        });

        // forex: also affects cash (AUD/USD)
        (Array.isArray(forex) ? forex : []).forEach((t) => {
          const broker = t.broker;
          const proceedsUsd = t.proceeds != null ? num(t.proceeds) : -(num(t.quantity) * num(t.price));
          // forex rows in your DB: currency = "USD", proceeds is USD cashflow
          addCash(broker, "USD", proceedsUsd);

          // also the AUD leg: quantity is AUD amount (signed)
          // qty < 0 means AUD sold (cash down), qty > 0 means AUD bought (cash up)
          addCash(broker, "AUD", num(t.quantity));

          const fee = num(t.fee);
          if (fee) addCash(broker, t.feeCurrency || "AUD", -fee);
        });

        // convert cash basket to AUD totals
        const cashAudByBroker = new Map();
        for (const [broker, basket] of cashByBroker.entries()) {
          let aud = 0;
          for (const [ccy, bal] of Object.entries(basket || {})) {
            aud += toBase(num(bal), ccy, "AUD", fxRates);
          }
          cashAudByBroker.set(broker, aud);
        }

        // ----- REALISED PL (convert each row’s realisedPL into AUD using trade currency) -----
        const realisedAudByBroker = new Map();
        const addRealised = (broker, ccy, val) => {
          const b = String(broker || "").trim() || "Unknown";
          const aud = toBase(num(val), ccy || "USD", "AUD", fxRates);
          realisedAudByBroker.set(b, (realisedAudByBroker.get(b) || 0) + aud);
        };

        (Array.isArray(trades) ? trades : []).forEach((t) => addRealised(t.broker, t.currency, t.realisedPL));
        (Array.isArray(crypto) ? crypto : []).forEach((t) => addRealised(t.broker, t.currency, t.realisedPL));
        (Array.isArray(forex) ? forex : []).forEach((t) => addRealised(t.broker, t.currency, t.realisedPL));

        // ----- DIVIDENDS as P/L component (AUD converted) -----
        const divAudByBroker = new Map();
        (Array.isArray(divs) ? divs : []).forEach((d) => {
          const b = String(d.broker || "").trim() || "Unknown";
          const aud = toBase(num(d.amount), d.currency || "USD", "AUD", fxRates);
          divAudByBroker.set(b, (divAudByBroker.get(b) || 0) + aud);
        });

        // ----- FX UNREALISED (AUD) -----
        const fxUpnlAudByBroker = new Map();
        const brokersFromForex = Array.from(
          new Set((Array.isArray(forex) ? forex : []).map((t) => String(t.broker || "").trim() || "Unknown"))
        );

        for (const b of brokersFromForex) {
          const upnl = computeFxUnrealisedAud(forex, fxRates, b);
          fxUpnlAudByBroker.set(b, upnl);
        }

        // ----- BUILD ACCOUNTS -----
        const brokers = Array.from(
          new Set([
            ...posAgg.keys(),
            ...cashAudByBroker.keys(),
            ...realisedAudByBroker.keys(),
            ...divAudByBroker.keys(),
            ...fxUpnlAudByBroker.keys(),
          ])
        ).sort((a, b) => a.localeCompare(b));

        const brokerAccounts = brokers.map((b) => {
          const mv = posAgg.get(b)?.mvAud || 0;
          const upnlPos = posAgg.get(b)?.upnlAud || 0;

          const cashAud = cashAudByBroker.get(b) || 0;
          const realisedAud = realisedAudByBroker.get(b) || 0;
          const divAud = divAudByBroker.get(b) || 0;
          const fxUpnl = fxUpnlAudByBroker.get(b) || 0;

          // P/L includes:
          // - unrealised on open positions
          // - realised trade P/L
          // - dividends
          // - FX unrealised
          const plAud = upnlPos + realisedAud + divAud + fxUpnl;

          return {
            name: b,
            total: mv + cashAud,
            cash: cashAud,
            pl: plAud,
            dayPL: 0,
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
