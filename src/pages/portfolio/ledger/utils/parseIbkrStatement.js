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
  const m = s.match(/^([A-Z0-9.\-]+)\(/i);
  return m ? m[1].toUpperCase() : "";
}

export function parseIbkrActivityStatement(text) {
  // ⚠️ IBKR exports are often TSV even when called CSV
  const parsed = Papa.parse(String(text || ""), {
    skipEmptyLines: true,
    delimiter: "", // auto-detect first (change to "\t" if needed)
  });

  const rows = parsed.data;
  const headersBySection = {};
  const out = [];
  let idx = 0;

  // ─────────────────────────────
  // DEBUG counters
  // ─────────────────────────────
  let dbg = {
    sectionsSeen: {},
    headersSeen: {},
    dataRowsSeen: {},
    pushed: { trades: 0, forex: 0, cash: 0, dividends: 0 },
  };

  for (const r of rows) {
    const section = String(r?.[0] ?? "").replace(/^\uFEFF/, "").trim();
    const kind = String(r?.[1] ?? "").trim();

    if (!section || !kind) continue;

    dbg.sectionsSeen[section] = (dbg.sectionsSeen[section] || 0) + 1;

    // Skip totals like: "Dividends Data Total ..."
    const third = String(r?.[2] ?? "").trim();
    if (kind === "Data" && third === "Total") continue;

    if (kind === "Header") {
      headersBySection[section] = r.slice(2).map((h) => String(h ?? "").trim());
      dbg.headersSeen[section] = headersBySection[section];
      continue;
    }

    if (kind !== "Data") continue;

    dbg.dataRowsSeen[section] = (dbg.dataRowsSeen[section] || 0) + 1;

    const header = headersBySection[section] || [];
    const dataCols = r.slice(2);

    const obj = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = dataCols[i];
    }

    // ─────────────────────────────
    // Trades (Stocks + Forex)
    // ─────────────────────────────
    if (section === "Trades") {
      const assetCat = obj["Asset Category"];
      const ticker = obj["Symbol"];
      const currency = obj["Currency"];
      const dt = obj["Date/Time"];
      const { date, ts } = toIsoDateTimeFromIbkr(dt);

      if (!date || !ticker || !assetCat) continue;

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

    // ─────────────────────────────
    // Deposits & Withdrawals → cash
    // ─────────────────────────────
    if (section === "Deposits & Withdrawals") {
      const iso = toIsoFromDmy(obj["Settle Date"]);
      if (!iso) continue;

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

    // ─────────────────────────────
    // Dividends → dividends tab
    // ─────────────────────────────
    if (section === "Dividends") {
      const iso = toIsoFromDmy(obj["Date"]);
      if (!iso) continue;

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

  // ─────────────────────────────
  // DEBUG OUTPUT (once per import)
  // ─────────────────────────────
  console.groupCollapsed("IBKR IMPORT DEBUG");
  console.log("Sections seen:", dbg.sectionsSeen);
  console.log("Headers seen:", dbg.headersSeen);
  console.log("Data rows seen:", dbg.dataRowsSeen);
  console.log("Rows pushed:", dbg.pushed);
  console.log("First 5 parsed rows:", out.slice(0, 5));
  console.groupEnd();

  return out;
}
