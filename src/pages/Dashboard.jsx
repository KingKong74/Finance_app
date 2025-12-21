import StatCard from "../components/StatCard";

export default function Dashboard() {
  return (
    <div style={{ padding: "2rem" }}>
      <h1>Portfolio Dashboard</h1>

      <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
        <StatCard title="Total Portfolio Value" value="$125,000" />
        <StatCard title="Cash Balance" value="$18,500" />
        <StatCard title="Monthly Cashflow" value="+$2,300" />
      </div>

      <div style={{ marginTop: "2rem" }}>
        <h2>Charts coming soon 📊</h2>
      </div>
    </div>
  );
}
