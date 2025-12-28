// Chart data
export const lineChartData = {
  labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  datasets: [
    {
      label: "Portfolio %",
      data: [2, 5, 7, 6, 10, 12, 14],
      borderColor: "#0d6efd",
      backgroundColor: "rgba(13,110,253,0.1)",
      tension: 0.3,
      fill: true,
    },
    {
      label: "Benchmark %",
      data: [1, 4, 6, 5, 9, 11, 13],
      borderColor: "#198754",
      backgroundColor: "rgba(25,135,84,0.1)",
      tension: 0.3,
      fill: true,
    },
  ],
};

// Chart config
export const lineChartOptions = {
  responsive: true,
  plugins: {
    legend: {
      display: true,
      position: "top",
    },
  },
  scales: {
    y: {
      beginAtZero: false,
      ticks: {
        stepSize: 2,
        callback: value => value + "%",
      },
    },
    x: {
      ticks: {
        autoSkip: false,
      },
    },
  },
};
