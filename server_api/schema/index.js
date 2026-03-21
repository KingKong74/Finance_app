// server_api/schema/index.js
// Single source of truth for the database schema.
// Run `npx drizzle-kit generate` to produce migrations, then
// `npx drizzle-kit migrate` (or push) against your Postgres instance.

import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamptz,
  boolean,
  integer,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// PORTFOLIO — trades (equities + crypto in one table, distinguished by type)
// forex kept separate because it has different semantics (currency pairs)
// ---------------------------------------------------------------------------

export const trades = pgTable(
  "trades",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    type:        text("type").notNull(), // "trades" | "crypto"
    broker:      text("broker").notNull(),
    ticker:      text("ticker").notNull(),
    currency:    text("currency").notNull(),
    tradedAt:    timestamptz("traded_at").notNull(),
    quantity:    numeric("quantity",   { precision: 20, scale: 8 }).notNull(),
    price:       numeric("price",      { precision: 20, scale: 8 }).notNull(),
    proceeds:    numeric("proceeds",   { precision: 20, scale: 8 }).notNull(),
    fee:         numeric("fee",        { precision: 20, scale: 8 }).notNull().default("0"),
    feeCurrency: text("fee_currency").notNull().default("AUD"),
    realisedPl:  numeric("realised_pl",{ precision: 20, scale: 8 }).default("0"),
    importKey:   text("import_key"),
    createdAt:   timestamptz("created_at").defaultNow(),
    importedAt:  timestamptz("imported_at"),
  },
  (t) => ({
    importKeyUniq: unique("trades_import_key_uniq").on(t.importKey),
    brokerIdx:     index("trades_broker_idx").on(t.broker),
    tickerIdx:     index("trades_ticker_idx").on(t.ticker),
    tradedAtIdx:   index("trades_traded_at_idx").on(t.tradedAt),
    typeIdx:       index("trades_type_idx").on(t.type),
  })
);

export const forexTrades = pgTable(
  "forex_trades",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    broker:      text("broker").notNull(),
    ticker:      text("ticker").notNull(), // e.g. "AUD.USD"
    currency:    text("currency").notNull(),
    tradedAt:    timestamptz("traded_at").notNull(),
    quantity:    numeric("quantity",  { precision: 20, scale: 8 }).notNull(),
    price:       numeric("price",     { precision: 20, scale: 8 }).notNull(),
    proceeds:    numeric("proceeds",  { precision: 20, scale: 8 }).notNull(),
    fee:         numeric("fee",       { precision: 20, scale: 8 }).notNull().default("0"),
    feeCurrency: text("fee_currency").notNull().default("AUD"),
    realisedPl:  numeric("realised_pl",{ precision: 20, scale: 8 }).default("0"),
    importKey:   text("import_key"),
    createdAt:   timestamptz("created_at").defaultNow(),
    importedAt:  timestamptz("imported_at"),
  },
  (t) => ({
    importKeyUniq: unique("forex_trades_import_key_uniq").on(t.importKey),
    brokerIdx:     index("forex_trades_broker_idx").on(t.broker),
    tradedAtIdx:   index("forex_trades_traded_at_idx").on(t.tradedAt),
  })
);

// ---------------------------------------------------------------------------
// PORTFOLIO — cash deposits / withdrawals
// ---------------------------------------------------------------------------

export const cashEntries = pgTable(
  "cash_entries",
  {
    id:         uuid("id").primaryKey().defaultRandom(),
    broker:     text("broker").notNull(),
    currency:   text("currency").notNull(),
    entryType:  text("entry_type").notNull(), // "deposit" | "withdrawal"
    settledAt:  timestamptz("settled_at").notNull(),
    amount:     numeric("amount", { precision: 20, scale: 8 }).notNull(),
    note:       text("note").default(""),
    importKey:  text("import_key"),
    createdAt:  timestamptz("created_at").defaultNow(),
    importedAt: timestamptz("imported_at"),
  },
  (t) => ({
    importKeyUniq: unique("cash_entries_import_key_uniq").on(t.importKey),
    brokerIdx:     index("cash_entries_broker_idx").on(t.broker),
    settledAtIdx:  index("cash_entries_settled_at_idx").on(t.settledAt),
  })
);

// ---------------------------------------------------------------------------
// PORTFOLIO — dividends
// ---------------------------------------------------------------------------

export const dividends = pgTable(
  "dividends",
  {
    id:         uuid("id").primaryKey().defaultRandom(),
    broker:     text("broker").notNull(),
    ticker:     text("ticker").default(""),
    currency:   text("currency").notNull(),
    paidAt:     timestamptz("paid_at").notNull(),
    amount:     numeric("amount", { precision: 20, scale: 8 }).notNull(),
    note:       text("note").default(""),
    importKey:  text("import_key"),
    createdAt:  timestamptz("created_at").defaultNow(),
    importedAt: timestamptz("imported_at"),
  },
  (t) => ({
    importKeyUniq: unique("dividends_import_key_uniq").on(t.importKey),
    brokerIdx:     index("dividends_broker_idx").on(t.broker),
    paidAtIdx:     index("dividends_paid_at_idx").on(t.paidAt),
  })
);

// ---------------------------------------------------------------------------
// PORTFOLIO — cash report snapshots (one row per currency per broker per date)
// Replaces the inconsistent cash_reports collection.
// ---------------------------------------------------------------------------

export const cashReportSnapshots = pgTable(
  "cash_report_snapshots",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    broker:       text("broker").notNull(),
    currency:     text("currency").notNull(), // "AUD" | "USD" | "EUR"
    balance:      numeric("balance", { precision: 20, scale: 8 }).notNull(),
    snapshotDate: timestamptz("snapshot_date").notNull(),
    label:        text("label").notNull().default("Ending Cash"),
    importKey:    text("import_key"),
    importedAt:   timestamptz("imported_at").defaultNow(),
  },
  (t) => ({
    importKeyUniq:  unique("cash_snapshots_import_key_uniq").on(t.importKey),
    brokerCcyIdx:   index("cash_snapshots_broker_ccy_idx").on(t.broker, t.currency),
    snapshotDateIdx:index("cash_snapshots_date_idx").on(t.snapshotDate),
  })
);

// ---------------------------------------------------------------------------
// FX RATES — one row per base+quote pair, upserted on fetch
// ---------------------------------------------------------------------------

export const fxRates = pgTable(
  "fx_rates",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    base:      text("base").notNull(),
    quote:     text("quote").notNull(),
    rate:      numeric("rate", { precision: 20, scale: 8 }).notNull(),
    fetchedAt: timestamptz("fetched_at").notNull(),
    provider:  text("provider").default(""),
    updatedAt: timestamptz("updated_at").defaultNow(),
  },
  (t) => ({
    baseQuoteUniq: unique("fx_rates_base_quote_uniq").on(t.base, t.quote),
    baseIdx:       index("fx_rates_base_idx").on(t.base),
  })
);

// ---------------------------------------------------------------------------
// PRICE CACHE — keyed by ticker symbol
// ---------------------------------------------------------------------------

export const priceCache = pgTable("price_cache", {
  symbol:    text("symbol").primaryKey(),
  price:     numeric("price", { precision: 20, scale: 8 }).notNull(),
  currency:  text("currency").notNull(),
  source:    text("source").notNull(),
  asOf:      timestamptz("as_of").notNull(),
  updatedAt: timestamptz("updated_at").defaultNow(),
});

// ---------------------------------------------------------------------------
// BANK ACCOUNTS (transactions feature)
// ---------------------------------------------------------------------------

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    externalId:  text("external_id").notNull().unique(),
    name:        text("name").notNull(),
    provider:    text("provider").notNull(),
    accountType: text("account_type").notNull().default("transaction"),
    currency:    text("currency").notNull().default("AUD"),
    isActive:    boolean("is_active").notNull().default(true),
    createdAt:   timestamptz("created_at").defaultNow(),
    updatedAt:   timestamptz("updated_at").defaultNow(),
  }
);

// ---------------------------------------------------------------------------
// BANK TRANSACTIONS (transactions feature)
// ---------------------------------------------------------------------------

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    externalId:  text("external_id").notNull().unique(),
    accountId:   text("account_id").notNull().references(() => bankAccounts.externalId),
    postedAt:    timestamptz("posted_at").notNull(),
    occurredAt:  timestamptz("occurred_at").notNull(),
    description: text("description").notNull(),
    amount:      numeric("amount", { precision: 20, scale: 8 }).notNull(),
    currency:    text("currency").notNull().default("AUD"),
    balance:     numeric("balance", { precision: 20, scale: 8 }),
    merchant:    text("merchant"),
    cardLast4:   text("card_last4"),
    foreign:     jsonb("foreign"),       // { amount, currency } or null
    fees:        numeric("fees", { precision: 20, scale: 8 }).default("0"),
    matched:     boolean("matched").notNull().default(false),
    reconciled:  boolean("reconciled").notNull().default(false),
    notes:       text("notes").default(""),
    importedAt:  timestamptz("imported_at").defaultNow(),
    createdAt:   timestamptz("created_at").defaultNow(),
  },
  (t) => ({
    accountPostedIdx: index("bank_tx_account_posted_idx").on(t.accountId, t.postedAt),
    postedAtIdx:      index("bank_tx_posted_at_idx").on(t.postedAt),
  })
);