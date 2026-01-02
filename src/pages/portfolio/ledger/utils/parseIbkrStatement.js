// src/pages/portfolio/ledger/utils/parseIbkrStatement.js
import Papa from "papaparse";

function parseNumber(x) {
  if (x === null || x === undefined) return 0;
  const s = String(x).trim();
  if (!s || s === "--") return 0;
  const cleaned = s.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Accepts:
// - DD/MM/YYYY
// - D/M/YYYY
// - YYYY-MM-DD
// - YYYY/MM/DD
function toIsoAnyDate(input) {
  const s = String(input || "").trim();
  if (!s) return "";

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const yyyy = m[1];
    const mm = String(m[2]).padStart(2, "0");
    const dd = String(m[3]).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // DD/MM/YYYY (AU style)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

// IBKR "Date/Time" can include time
function toIsoDateTimeFromIbkr(dt) {
  const s = String(dt || "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[,\s]+(\d{2}:\d{2}:\d{2}))?/);
  if (!m) return { date: "", ts: "" };
  const date = m[1];
  const time = m[2] || "00:00:00";
  return { date, ts: `${date}T${time}` };
}

function makeTempId(i, tab) {
  return `${tab}_${i}_${Math.random().toString(16).slice(2)}`;
}

function tickerFromDividendDescription(desc) {
  const s = String(desc || "");
  const m = s.match(/^([A-Z0-9.\-]+)\s*\(/i);
  return m ? m[1].toUpperCase() : "";
}

function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function maxIso(a, b) {
  if (!a) return b || "";
  if (!b) return a || "";
  return a > b ? a : b;
}

export function parseIbkrActivityStatement(text) {
  const parsed = Papa.parse(String(text || ""), {
    skipEmptyLines: true,
    delimiter: "", // auto detect
  });

  const rows = parsed.data;
  const headersBySection = {};
  const out = [];
  let idx = 0;

  // Track latest date we see so we can stamp cash_report snapshots
  let latestIsoDate = "";

  // ---- Cash Report snapshot collector ----
  // We'll prefer "Ending Cash" over "Ending Settled Cash"
  const cashReport = {
    seen: false,
    ending: {}, // { AUD, USD, EUR }
    hasEndingCashLine: false,
  };

  const dbg = {
    pushed: { trades: 0, forex: 0, cash: 0, dividends: 0, cash_report: 0 },
    badCashDates: 0,
    badDividendDates: 0,
    sampleBadCash: [],
    sampleBadDiv: [],
    cashReportLinesSeen: 0,
    cashReportEnding: {},
  };

  for (const r of rows) {
    const section = String(r?.[0] ?? "").replace(/^\uFEFF/, "").trim();
    const kind = String(r?.[1] ?? "").trim();
    if (!section || !kind) continue;

    // Skip totals like: "Dividends Data Total ..."
    const third = String(r?.[2] ?? "").trim();
    if (kind === "Data" && third === "Total") continue;

    // ---- Cash Report: parse positional ----
    if (section === "Cash Report" && kind === "Data") {
      cashReport.seen = true;
      dbg.cashReportLinesSeen++;

      const lineItem = String(r?.[2] ?? "").trim();  // e.g. "Ending Cash"
      const ccyOrBase = String(r?.[3] ?? "").trim(); // e.g. "AUD" or "Base Currency Summary"
      const amount = parseNumber(r?.[4]);

      // We only care about ENDING CASH balances
      if (/^Ending Cash$/i.test(lineItem) || /^Ending Settled Cash$/i.test(lineItem)) {
        const ccy =
          /^Base Currency Summary$/i.test(ccyOrBase)
            ? "AUD"
            : String(ccyOrBase || "").toUpperCase();

        // keep only these 3
        if (ccy === "AUD" || ccy === "USD" || ccy === "EUR") {
          if (/^Ending Cash$/i.test(lineItem)) {
            cashReport.hasEndingCashLine = true;
            cashReport.ending[ccy] = amount;
          } else {
            // Ending Settled Cash: only if no Ending Cash line exists
            if (!cashReport.hasEndingCashLine && cashReport.ending[ccy] == null) {
              cashReport.ending[ccy] = amount;
            }
          }
        }
      }

      continue;
    }

    if (kind === "Header") {
      headersBySection[section] = r.slice(2).map((h) => String(h ?? "").trim());
      continue;
    }

    if (kind !== "Data") continue;

    const header = headersBySection[section] || [];
    const dataCols = r.slice(2);

    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = dataCols[i];

    // Trades section
    if (section === "Trades") {
      const assetCat = obj["Asset Category"];
      const currency = obj["Currency"] || "";
      const ticker = obj["Symbol"] || "";
      const dt = obj["Date/Time"] || "";
      const { date, ts } = toIsoDateTimeFromIbkr(dt);
      if (!date || !ticker || !assetCat) continue;

      latestIsoDate = maxIso(latestIsoDate, date);

      if (assetCat === "Stocks") {
        out.push({
          _tempId: makeTempId(idx++, "trades"),
          tab: "trades",
          ticker,
          date,
          ts,
          quantity: parseNumber(obj["Quantity"]),
          price: parseNumber(obj["T. Price"]),
          fee: Math.abs(parseNumber(obj["Comm/Fee"])),
          currency: currency || "USD",
          broker: "IBKR",
          realisedPL: parseNumber(obj["Realized P/L"]),
          note: "",
        });
        dbg.pushed.trades++;
      }

      if (assetCat === "Forex") {
        out.push({
          _tempId: makeTempId(idx++, "forex"),
          tab: "forex",
          ticker,
          date,
          ts,
          quantity: parseNumber(obj["Quantity"]),
          price: parseNumber(obj["T. Price"]),
          fee: Math.abs(parseNumber(obj["Comm/Fee"] || 0)),
          currency: currency || "USD",
          broker: "IBKR",
          realisedPL: parseNumber(obj["Realized P/L"] || 0),
          note: "",
        });
        dbg.pushed.forex++;
      }
    }

    // Deposits & Withdrawals -> cash
    if (section === "Deposits & Withdrawals") {
      const rawDate = obj["Settle Date"];
      const iso = toIsoAnyDate(rawDate);

      if (!iso) {
        dbg.badCashDates++;
        if (dbg.sampleBadCash.length < 5) dbg.sampleBadCash.push({ rawDate, row: obj });
        continue;
      }

      latestIsoDate = maxIso(latestIsoDate, iso);

      const amount = parseNumber(obj["Amount"]);
      out.push({
        _tempId: makeTempId(idx++, "cash"),
        tab: "cash",
        date: iso,
        ts: `${iso}T00:00:00`,
        amount,
        currency: obj["Currency"] || "AUD",
        entryType: amount >= 0 ? "deposit" : "withdrawal",
        note: obj["Description"] || "",
        broker: "IBKR",
      });
      dbg.pushed.cash++;
    }

    // Dividends -> dividends
    if (section === "Dividends") {
      const rawDate = obj["Date"];
      const iso = toIsoAnyDate(rawDate);

      if (!iso) {
        dbg.badDividendDates++;
        if (dbg.sampleBadDiv.length < 5) dbg.sampleBadDiv.push({ rawDate, row: obj });
        continue;
      }

      latestIsoDate = maxIso(latestIsoDate, iso);

      const amount = parseNumber(obj["Amount"]);
      if (!amount) continue;

      const desc = obj["Description"] || "";
      out.push({
        _tempId: makeTempId(idx++, "dividends"),
        tab: "dividends",
        date: iso,
        ts: `${iso}T00:00:00`,
        ticker: tickerFromDividendDescription(desc),
        amount,
        currency: obj["Currency"] || "USD",
        broker: "IBKR",
        note: desc,
      });
      dbg.pushed.dividends++;
    }
  }

  // ---- Push cash_report rows (1 per currency) ----
  const balances = cashReport.ending || {};
  const asOf = latestIsoDate || isoToday();
  const ts = `${asOf}T00:00:00`;

  const wanted = ["AUD", "USD", "EUR"];
  let pushedAny = false;

  if (cashReport.seen) {
    for (const ccy of wanted) {
      if (balances[ccy] == null) continue;

      out.push({
        _tempId: makeTempId(idx++, "cash_report"),
        tab: "cash_report",
        date: asOf,
        ts,
        broker: "IBKR",
        currency: ccy,
        amount: balances[ccy],
        label: "Ending Cash",
        note: "IBKR Cash Report",
      });

      dbg.pushed.cash_report++;
      pushedAny = true;
    }
  }

  dbg.cashReportEnding = { ...balances };

  console.groupCollapsed("IBKR IMPORT DEBUG (dates + cash report)");
  console.log("Rows pushed:", dbg.pushed);
  console.log("Bad cash dates:", dbg.badCashDates, dbg.sampleBadCash);
  console.log("Bad dividend dates:", dbg.badDividendDates, dbg.sampleBadDiv);
  console.log("Cash report lines seen:", dbg.cashReportLinesSeen);
  console.log("Cash report ending (raw):", dbg.cashReportEnding);
  console.log("Cash report asOf (derived):", asOf);
  console.log("Cash report pushed:", pushedAny);
  console.groupEnd();

  return out;
}
