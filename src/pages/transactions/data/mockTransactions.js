export const mockAccounts = [
  { id: "ANZ_EVERYDAY", name: "ANZ Everyday (**** 1234)" },
  { id: "ANZ_CC", name: "ANZ Credit Card (**** 0192)" },
];

export const mockTransactions = [
  {
    id: "t1",
    date: "2025-12-12",
    accountId: "ANZ_CC",
    accountName: "ANZ Credit Card (**** 0192)",
    description: "APPLE.COM/BILL SYDNEY",
    amount: -22.99,
    matched: false,
  },
  {
    id: "t2",
    date: "2025-12-12",
    accountId: "ANZ_CC",
    accountName: "ANZ Credit Card (**** 0192)",
    description: "PAYMENT THANKYOU 574315",
    amount: 500.0,
    matched: true,
  },
  {
    id: "t3",
    date: "2025-12-29",
    accountId: "ANZ_CC",
    accountName: "ANZ Credit Card (**** 0192)",
    description: "OPENAI *CHATGPT SUBSCR OPENAI.COM",
    amount: -34.01,
    matched: false,
  },
  {
    id: "t4",
    date: "2026-01-05",
    accountId: "ANZ_CC",
    accountName: "ANZ Credit Card (**** 0192)",
    description: "FAST TIMES BRISBANE BRISBANE CITY",
    amount: -224.85,
    matched: false,
  },
  {
    id: "t5",
    date: "2026-01-06",
    accountId: "ANZ_CC",
    accountName: "ANZ Credit Card (**** 0192)",
    description: "PAYMENT THANKYOU 743329",
    amount: 673.21,
    matched: true,
  },
];
