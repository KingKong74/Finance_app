import Papa from "papaparse";

function parseNumber(x) {
  if (x === null || x === undefined) return 0;
  const s = String(x).trim();
  if (!s || s === "--") return 0;
  const cleaned = s.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toIsoFromIbkrDateTime(dt) {
  const s = String(dt || "");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function toIsoFromDmy(dmy) {
  const s = String(dmy || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const dd = String(m[1]).padStart(2, "0");
  const mm = String(m[2]).padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

function makeTempId(i, tab) {
  return `${tab}_${i}_${Math.random().toString(16).slice(2)}`;
}

export function parseIbkrActivityStatement(text) {
  const parsed = Papa.parse(String(text || ""), {
    skipEmptyLines: true,
    // delimiter: "" lets Papa auto-detect comma vs tab
    delimiter: "",
  });

  // Each row is an array of columns:
  const rows = parsed.data;
  const headersBySection = {};
  const out = [];
  let idx = 0;

  for (const r of rows) {
    const section = r?.[0];
    const kind = r?.[1];
    if (!section || !kind) continue;

    if (kind === "Header") {
      headersBySection[section] = r.slice(2);
      continue;
    }

    if (kind !== "Data") continue;

    const header = headersBySection[section] || [];
    const dataCols = r.slice(2);

    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = dataCols[i];

    // Trades section: Stocks + Forex
    if (section === "Trades") {
      const assetCat = obj["Asset Category"];
      const currency = obj["Currency"] || "";
      const ticker = obj["Symbol"] || "";
      const dt = obj["Date/Time"] || "";
      const iso = toIsoFromIbkrDateTime(dt);
      if (!iso || !ticker || !assetCat) continue;

      if (assetCat === "Stocks") {
        out.push({
          _tempId: makeTempId(idx++, "trades"),
          tab: "trades",
          ticker,
          date: iso,
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
          date: iso,
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

    // Deposits & Withdrawals -> cash
    if (section === "Deposits & Withdrawals") {
      const currency = obj["Currency"] || "AUD";
      const iso = toIsoFromDmy(obj["Settle Date"]);
      if (!iso) continue;

      const amount = parseNumber(obj["Amount"]);
      out.push({
        _tempId: makeTempId(idx++, "cash"),
        tab: "cash",
        date: iso,
        amount,
        currency,
        entryType: amount >= 0 ? "deposit" : "withdrawal",
        note: obj["Description"] || "",
        broker: "IBKR",
      });
    }
  }

  return out;
}
