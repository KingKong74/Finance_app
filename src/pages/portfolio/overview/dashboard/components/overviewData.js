// overviewData.js

export const accounts = [
  { name: "All Accounts", total: 125000, cash: 18500, pl: 6200, dayPL: 420 },
  { name: "Brokerage", total: 65000, cash: 10000, pl: 2500, dayPL: -120 },
  { name: "Super", total: 40000, cash: 5000, pl: 3000, dayPL: 180 },
  { name: "Crypto", total: 20000, cash: 3500, pl: 700, dayPL: -60 },
];

export const overviewTabs = ["Dashboard", "Positions", "Performance", "Dividends"];

// Performance data for line chart
export const perfData = {
  "7D": [1, 2, 0.5, -1, 1.2, 0.8, 1.5],
  "MTD": [2, 1.5, 2.2, 3, 2.8, 3.2, 3.5],
  "YTD": [10, 12, 15, 13, 14, 16, 18],
  "1Y": [25, 28, 30, 27, 26, 32, 35],
  "ALL": [50, 55, 60, 58, 62, 65, 70],
};

// Pie chart: Investments by % of portfolio
export const portfolioPieData = [
  { name: "Stocks", value: 45 },
  { name: "Bonds", value: 20 },
  { name: "Crypto", value: 10 },
  { name: "Super", value: 15 },
  { name: "Cash", value: 10 },
];

// Column chart: Portfolio value (weekly, last 5 working days)
export const portfolioValueData = [
  { day: "Mon", value: 124500 },
  { day: "Tue", value: 125200 },
  { day: "Wed", value: 125000 },
  { day: "Thu", value: 125600 },
  { day: "Fri", value: 125800 },
];

// Column chart: Dividends yearly
export const dividendsData = [
  { year: "2021", dividends: 1200 },
  { year: "2022", dividends: 1500 },
  { year: "2023", dividends: 1800 },
  { year: "2024", dividends: 2000 },
];

// Stacked column chart: Cashflow (interest + dividends per year)
export const cashflowData = [
  { year: "2021", interest: 400, dividends: 1200 },
  { year: "2022", interest: 500, dividends: 1500 },
  { year: "2023", interest: 600, dividends: 1800 },
  { year: "2024", interest: 700, dividends: 2000 },
];
