// server_api/schemas/transactions.js

/**
 * ACCOUNTS SCHEMA (Chart of Accounts)
 * 
 * Represents bank accounts, credit cards, and other financial accounts.
 * This is NOT the full chart of accounts (income/expense categories) - 
 * that comes later. This is just source accounts for transactions.
 */
export const accountSchema = {
  _id: "ObjectId", // auto
  
  // Identity
  externalId: "String", // e.g., "ANZ-12345678" (unique per provider)
  name: "String",       // e.g., "ANZ Everyday (**** 1234)"
  provider: "String",   // e.g., "ANZ", "Commonwealth", "NAB"
  
  // Type
  accountType: "String", // "transaction" | "credit_card" | "savings" | "loan"
  
  // Balance tracking (optional, updated from statements)
  currentBalance: "Number",
  balanceAsOf: "Date",
  currency: "String", // default "AUD"
  
  // Metadata
  isActive: "Boolean",
  createdAt: "Date",
  updatedAt: "Date",
};

/**
 * TRANSACTIONS SCHEMA (Raw imported bank transactions)
 * 
 * This is the single source of truth for all bank transactions.
 * One row = one line item from a bank statement.
 */
export const transactionSchema = {
  _id: "ObjectId",
  
  // Identity (for deduplication)
  externalId: "String", // unique hash: accountId|date|description|amount|balance
  
  // Account reference
  accountId: "String", // links to accounts.externalId (e.g., "ANZ-12345678")
  
  // Core transaction data
  postedAt: "Date",    // when it cleared (from statement)
  occurredAt: "Date",  // when it happened (can differ for pending transactions)
  description: "String",
  amount: "Number",    // negative = debit (spend), positive = credit (income)
  currency: "String",  // default "AUD"
  
  // Balance tracking (from statement if available)
  balance: "Number",   // account balance after this transaction
  
  // Categorization (initially null, filled via UI or rules)
  categoryId: "String | null",      // links to categories collection
  categoryName: "String | null",    // denormalized for quick display
  journalEntryId: "String | null",  // links to journal_entries (if using double-entry)
  
  // Reconciliation
  isReconciled: "Boolean",          // manually confirmed as correct
  reconciledAt: "Date | null",
  reconciledBy: "String | null",    // future: user ID
  
  // Rich metadata (from parser)
  merchant: "String | null",        // extracted merchant name
  cardLast4: "String | null",       // for credit card transactions
  foreign: {                        // for foreign currency purchases
    amount: "Number | null",
    currency: "String | null",
  },
  fees: "Number",                   // transaction fees (e.g., overseas fee)
  
  // Import metadata
  source: "String",                 // "statement_import" | "manual" | "api"
  importedAt: "Date",
  importBatchId: "String",          // groups transactions from same import
  
  // Audit
  createdAt: "Date",
  updatedAt: "Date",
};

/**
 * IMPORT BATCHES SCHEMA (Track import history)
 * 
 * Every import creates one batch record. Useful for:
 * - Viewing import history
 * - Bulk delete if import was wrong
 * - Tracking which statement periods are imported
 */
export const importBatchSchema = {
  _id: "ObjectId",
  
  // File metadata
  filename: "String",
  fileType: "String",  // "pdf" | "csv" | "txt"
  provider: "String",  // "ANZ" | "Commonwealth" | etc.
  
  // Import stats
  transactionsCount: "Number",
  transactionsImported: "Number",  // new records added
  transactionsDuplicate: "Number", // skipped (already exist)
  transactionsFailed: "Number",    // errors
  
  // Period coverage (if parseable)
  periodFrom: "Date | null",
  periodTo: "Date | null",
  
  // Status
  status: "String", // "preview" | "completed" | "failed"
  
  // Audit
  importedAt: "Date",
  importedBy: "String | null", // future: user ID
};

/**
 * CATEGORIES SCHEMA (Expense/Income categories)
 * 
 * Hierarchical categories for organizing transactions.
 * Later: link to Budget "streams"
 */
export const categorySchema = {
  _id: "ObjectId",
  
  name: "String",           // e.g., "Food & Groceries"
  slug: "String",           // e.g., "food-groceries" (for URLs)
  
  // Hierarchy
  parentId: "String | null", // null = top-level
  path: "String",            // e.g., "/expenses/food-groceries"
  level: "Number",           // 0 = top-level, 1 = sub-category, etc.
  
  // Type
  categoryType: "String",    // "income" | "expense" | "transfer"
  
  // Budget integration
  budgetStreamId: "String | null", // links to Budget "streams" (future)
  
  // Display
  icon: "String | null",     // emoji or icon name
  color: "String | null",    // hex color for charts
  
  // Rules
  isSystemCategory: "Boolean", // can't be deleted (e.g., "Uncategorized")
  isActive: "Boolean",
  
  // Audit
  createdAt: "Date",
  updatedAt: "Date",
};

/**
 * CATEGORIZATION RULES SCHEMA (Auto-assign categories)
 * 
 * Pattern-based rules to auto-categorize transactions.
 */
export const categorizationRuleSchema = {
  _id: "ObjectId",
  
  name: "String",           // e.g., "Woolworths → Groceries"
  
  // Matching conditions (all must match)
  conditions: {
    descriptionContains: "String | null",    // case-insensitive
    descriptionRegex: "String | null",       // advanced matching
    amountMin: "Number | null",
    amountMax: "Number | null",
    accountId: "String | null",              // specific account only
    merchantContains: "String | null",
  },
  
  // Action
  categoryId: "String",
  
  // Priority (higher = checked first)
  priority: "Number",
  
  // Stats
  matchCount: "Number",     // how many times this rule has matched
  lastMatchedAt: "Date | null",
  
  // Status
  isActive: "Boolean",
  
  // Audit
  createdAt: "Date",
  updatedAt: "Date",
};

/**
 * INDEXES (for performance)
 * 
 * Critical indexes for fast queries:
 */
export const indexes = {
  accounts: [
    { externalId: 1 }, // unique
    { provider: 1, accountType: 1 },
  ],
  
  transactions: [
    { externalId: 1 }, // unique (deduplication)
    { accountId: 1, postedAt: -1 }, // account statement view
    { categoryId: 1 }, // category reports
    { isReconciled: 1 }, // reconciliation view
    { importBatchId: 1 }, // batch operations
    { postedAt: -1 }, // date range queries
  ],
  
  categories: [
    { slug: 1 }, // unique
    { parentId: 1 }, // hierarchy queries
    { categoryType: 1 },
  ],
  
  categorizationRules: [
    { priority: -1 }, // highest priority first
    { isActive: 1 },
  ],
};

/**
 * NOTES:
 * 
 * 1. **externalId for deduplication**: 
 *    Hash of accountId|postedAt|description|amount|balance
 *    This prevents duplicate imports from same statement
 * 
 * 2. **amount convention**: 
 *    Negative = money out (expenses)
 *    Positive = money in (income)
 *    Consistent with bank statements
 * 
 * 3. **Balance tracking**: 
 *    Store balance from statement for reconciliation
 *    Can detect missing transactions
 * 
 * 4. **Foreign transactions**:
 *    Store original currency amount + fees separately
 *    Helps with expense tracking in foreign currency
 * 
 * 5. **Future enhancements**:
 *    - Split transactions (one transaction → multiple categories)
 *    - Attachments (receipt images)
 *    - Tags (additional metadata)
 *    - Notes (user comments)
 */