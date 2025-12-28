import Papa from "papaparse";

function parseNumber(x) {
  if (x === null || x === undefined) return 0;
  const s = String(x).trim();
  if (!s || s === "--") return 0;
  const cleaned = s.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toIsoFromDmy(dmy) {
  const s = String(dmy || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const dd = String(m[1]).padStart(2, "0");
  const mm = String(m[2]).padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

// IBKR "Date/Time" often starts with YYYY-MM-DD and sometimes includes time.
// Examples:
//  - "2025-06-19, 14:32:10"
//  - "2025-06-19 14:32:10"
//  - "2025-06-19"
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

// Extract ticker from dividend description like:
// "REA(AU000000REA9) Cash Dividend ..."
// "MA(US57636Q1040) Cash Dividend ..."
// Fallback: return "" if not found.
function tickerFromDividendDescription(desc) {
  const s = String(desc || "");
  const m = s.match(/^([A-Z0-9.\-]+)\(/i);
  return m ? String(m[1]).toUpperCase() : "";
}

export function parseIbkrActivityStatement(text) {
  const parsed = Papa.parse(String(text || ""), {
    skipEmptyLines: true,
    delimiter: "", // auto-detect comma vs tab
  });

  const rows = parsed.data;
  const headersBySection = {};
  const out = [];
  let idx = 0;

  for (const r of rows) {
    const section = r?.[0];
    const kind = r?.[1];
    if (!section || !kind) continue;

    // Skip section totals (they appear as kind === "Data" but have "Total")
    // Example: "Dividends Data Total"
    if (kind === "Data" && String(r?.[2] || "").trim() === "Total") continue;

    if (kind === "Header") {
      headersBySection[section] = r.slice(2);
      continue;
    }

    if (kind !== "Data") continue;

    const header = headersBySection[section] || [];
    const dataCols = r.slice(2);

    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = dataCols[i];

    // ─────────────────────────────────────────
    // Trades section: Stocks + Forex
    // ─────────────────────────────────────────
    if (section === "Trades") {
      const assetCat = obj["Asset Category"];
      const currency = obj["Currency"] || "";
      const ticker = obj["Symbol"] || "";
      const dt = obj["Date/Time"] || "";
      const { date, ts } = toIsoDateTimeFromIbkr(dt);

      if (!date || !ticker || !assetCat) continue;

      if (assetCat === "Stocks") {
        out.push({
          _tempId: makeTempId(idx++, "trades"),
          tab: "trades",
          ticker,
          date,
          ts,
          quantity: parseNumber(obj["Quantity"]), // negatives preserved ✅
          price: parseNumber(obj["T. Price"]),
          fee: Math.abs(parseNumber(obj["Comm/Fee"])),
          currency: currency || "USD",
          broker: "IBKR",
          realisedPL: parseNumber(obj["Realized P/L"]),
          note: "",
        });
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
      }
    }

    // ─────────────────────────────────────────
    // Deposits & Withdrawals -> cash
    // IBKR has only Settle Date in D/M/YYYY
    // ─────────────────────────────────────────
    if (section === "Deposits & Withdrawals") {
      const currency = obj["Currency"] || "AUD";
      const iso = toIsoFromDmy(obj["Settle Date"]);
      if (!iso) continue;

      const amount = parseNumber(obj["Amount"]);
      const entryType = amount >= 0 ? "deposit" : "withdrawal";

      out.push({
        _tempId: makeTempId(idx++, "cash"),
        tab: "cash",
        date: iso,
        ts: `${iso}T00:00:00`,
        amount,
        currency,
        entryType,
        note: obj["Description"] || "",
        broker: "IBKR",
      });
    }

    // ─────────────────────────────────────────
    // Dividends -> dividends tab (Option B)
    // Header sample you posted:
    // Dividends Header Currency Date Description Amount
    // Rows are D/M/YYYY
    // ─────────────────────────────────────────
    if (section === "Dividends") {
      const currency = obj["Currency"] || "USD";
      const iso = toIsoFromDmy(obj["Date"]);
      if (!iso) continue;

      const desc = obj["Description"] || "";
      const amount = parseNumber(obj["Amount"]);
      if (!amount) continue;

      // Try to detect ticker from description like REA(...), MA(...)
      const ticker = tickerFromDividendDescription(desc);

      out.push({
        _tempId: makeTempId(idx++, "dividends"),
        tab: "dividends",
        date: iso,
        ts: `${iso}T00:00:00`,
        ticker, // can be "", still ok
        amount,
        currency,
        broker: "IBKR",
        note: desc,
      });
    }
  }

  return out;
}
