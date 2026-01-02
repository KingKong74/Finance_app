import { connectToDB } from "../utils/db.js";

function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isIsoDateTime(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s);
}

function normUpper(x) {
  return String(x || "").trim().toUpperCase();
}
function normStr(x) {
  return String(x || "").trim();
}
function normNum(x) {
  if (typeof x === "string") x = x.replace(/,/g, "");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function deriveDate(r) {
  if (isIsoDate(r.date)) return r.date;
  if (isIsoDateTime(r.ts)) return r.ts.slice(0, 10);
  return "";
}
function deriveTs(r) {
  if (isIsoDateTime(r.ts)) return r.ts;
  if (isIsoDate(r.date)) return `${r.date}T00:00:00`;
  return "";
}

function makeImportKey(r) {
  const tab = normStr(r.tab).toLowerCase();
  const broker = normUpper(r.broker || "IBKR");
  const account = normStr(r.account || "");
  const currency = normStr(r.currency || "");

  if (tab === "cash_report") {
    const asOf = normStr(r.asOf || "");
    const b = r.balances || {};
    const a = normNum(b.AUD);
    const u = normNum(b.USD);
    const e = normNum(b.EUR);
    return [broker, account, tab, asOf, `AUD:${a.toFixed(8)}`, `USD:${u.toFixed(8)}`, `EUR:${e.toFixed(8)}`].join("|");
  }

  const tsOrDate = deriveTs(r) || deriveDate(r);

  if (tab === "cash") {
    const amount = normNum(r.amount);
    const entryType = normStr(r.entryType || (amount >= 0 ? "deposit" : "withdrawal")).toLowerCase();
    const note = normStr(r.note || "");
    return [broker, account, tab, tsOrDate, currency, entryType, amount.toFixed(8), note].join("|");
  }

  if (tab === "dividends") {
    const amount = normNum(r.amount);
    const ticker = normUpper(r.ticker || "");
    const note = normStr(r.note || "");
    return [broker, account, tab, tsOrDate, currency, ticker, amount.toFixed(8), note].join("|");
  }

  const ticker = normUpper(r.ticker || "");
  const qty = normNum(r.quantity);
  const price = normNum(r.price);
  const fee = Math.abs(normNum(r.fee));
  return [broker, account, tab, tsOrDate, currency, ticker, qty.toFixed(8), price.toFixed(8), fee.toFixed(8)].join("|");
}

async function ensureIndexes(db) {
  await db.collection("trades").createIndex({ importKey: 1 }, { unique: true, sparse: true });
  await db.collection("cash").createIndex({ importKey: 1 }, { unique: true, sparse: true });
  await db.collection("dividends").createIndex({ importKey: 1 }, { unique: true, sparse: true });

  // cash report snapshots
  await db.collection("cash_reports").createIndex({ broker: 1, asOf: -1 });
  await db.collection("cash_reports").createIndex({ importKey: 1 }, { unique: true, sparse: true });

  await db.collection("trades").createIndex({ date: 1, ticker: 1, broker: 1 });
  await db.collection("cash").createIndex({ date: 1, entryType: 1, broker: 1 });
  await db.collection("dividends").createIndex({ date: 1, ticker: 1, broker: 1 });
}

function extractBulkCounts(err, attempted) {
  const inserted = err?.result?.insertedCount ?? err?.insertedCount ?? 0;
  const writeErrors = err?.writeErrors || err?.result?.getWriteErrors?.() || [];
  const dupes = Array.isArray(writeErrors) ? writeErrors.filter((we) => we?.code === 11000).length : 0;
  const failed = Array.isArray(writeErrors) ? writeErrors.length : 0;
  return { attempted, inserted, duplicates: dupes, failed };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: "rows[] required" });

    const db = await connectToDB();
    await ensureIndexes(db);

    const tradesCol = db.collection("trades");
    const cashCol = db.collection("cash");
    const dividendsCol = db.collection("dividends");
    const cashReportsCol = db.collection("cash_reports");

    const tradeDocs = [];
    const cashDocs = [];
    const dividendDocs = [];
    const cashReportDocs = [];

    for (const r of rows) {
      const tab = normStr(r.tab).toLowerCase();
      const broker = normUpper(r.broker || "IBKR");

      // ---- CASH REPORT SNAPSHOT ----
      if (tab === "cash_report") {
        const asOf = normStr(r.asOf || "");
        if (!isIsoDate(asOf)) continue;

        const balancesRaw = r.balances && typeof r.balances === "object" ? r.balances : {};
        const balances = {
          AUD: normNum(balancesRaw.AUD),
          USD: normNum(balancesRaw.USD),
          EUR: normNum(balancesRaw.EUR),
        };

        cashReportDocs.push({
          broker,
          account: normStr(r.account || ""),
          asOf,
          base: normUpper(r.base || "AUD"),
          balances,
          importKey: makeImportKey({ ...r, tab, broker, asOf, balances }),
          createdAt: new Date(),
          importedAt: new Date(),
        });
        continue;
      }

      const date = deriveDate(r);
      const ts = deriveTs(r);
      if (!date) continue;

      const currency = normStr(r.currency || (tab === "cash" ? "AUD" : "USD"));

      if (tab === "cash") {
        const amount = normNum(r.amount);
        const entryType = normStr(r.entryType || (amount >= 0 ? "deposit" : "withdrawal")).toLowerCase();

        cashDocs.push({
          date,
          ts,
          amount,
          currency,
          entryType,
          note: normStr(r.note || ""),
          broker,
          importKey: makeImportKey({ ...r, tab, date, ts, broker, currency, entryType, amount }),
          createdAt: new Date(),
          importedAt: new Date(),
        });
        continue;
      }

      if (tab === "dividends") {
        const amount = normNum(r.amount);
        if (!amount) continue;

        dividendDocs.push({
          date,
          ts,
          amount,
          currency,
          ticker: normUpper(r.ticker || ""),
          note: normStr(r.note || ""),
          broker,
          importKey: makeImportKey({ ...r, tab, date, ts, broker, currency, amount }),
          createdAt: new Date(),
          importedAt: new Date(),
        });
        continue;
      }

      if (tab === "trades" || tab === "forex" || tab === "crypto") {
        const ticker = normUpper(r.ticker);
        if (!ticker) continue;

        const quantity = normNum(r.quantity);
        const price = normNum(r.price);
        const proceeds = r.proceeds != null ? normNum(r.proceeds) : -(quantity * price);

        const fee = Math.abs(normNum(r.fee));
        const feeCurrency = normUpper(r.feeCurrency || (broker === "IBKR" ? "AUD" : currency));

        const realisedPL = normNum(r.realisedPL);

        tradeDocs.push({
          ticker,
          date,
          ts,
          quantity,
          price,
          proceeds,
          fee,
          feeCurrency,
          broker,
          currency,
          realisedPL,
          type: tab,
          importKey: makeImportKey({ ...r, tab, date, ts, broker, currency, ticker, quantity, price, fee }),
          createdAt: new Date(),
          importedAt: new Date(),
        });
      }
    }

    const out = {
      ok: true,
      received: rows.length,
      kept: tradeDocs.length + cashDocs.length + dividendDocs.length + cashReportDocs.length,
      dropped: rows.length - (tradeDocs.length + cashDocs.length + dividendDocs.length + cashReportDocs.length),

      trades: { attempted: tradeDocs.length, inserted: 0, duplicates: 0, failed: 0 },
      cash: { attempted: cashDocs.length, inserted: 0, duplicates: 0, failed: 0 },
      dividends: { attempted: dividendDocs.length, inserted: 0, duplicates: 0, failed: 0 },
      cash_report: { attempted: cashReportDocs.length, inserted: 0, duplicates: 0, failed: 0 },
    };

    if (tradeDocs.length) {
      try {
        const r = await tradesCol.insertMany(tradeDocs, { ordered: false });
        out.trades.inserted = r.insertedCount ?? tradeDocs.length;
      } catch (err) {
        out.trades = extractBulkCounts(err, tradeDocs.length);
      }
    }

    if (cashDocs.length) {
      try {
        const r = await cashCol.insertMany(cashDocs, { ordered: false });
        out.cash.inserted = r.insertedCount ?? cashDocs.length;
      } catch (err) {
        out.cash = extractBulkCounts(err, cashDocs.length);
      }
    }

    if (dividendDocs.length) {
      try {
        const r = await dividendsCol.insertMany(dividendDocs, { ordered: false });
        out.dividends.inserted = r.insertedCount ?? dividendDocs.length;
      } catch (err) {
        out.dividends = extractBulkCounts(err, dividendDocs.length);
      }
    }

    if (cashReportDocs.length) {
      try {
        const r = await cashReportsCol.insertMany(cashReportDocs, { ordered: false });
        out.cash_report.inserted = r.insertedCount ?? cashReportDocs.length;
      } catch (err) {
        out.cash_report = extractBulkCounts(err, cashReportDocs.length);
      }
    }

    return res.status(200).json(out);
  } catch (err) {
    console.error("Ledger import error:", err);
    return res.status(500).json({ error: "Import failed" });
  }
}
