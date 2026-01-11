import React from "react";

export default function TimeScaleToggle({ timeScale, setTimeScale }) {
  return (
    <div className="b-scenarios">
      <button className={`b-pill ${timeScale === "weekly" ? "is-on" : ""}`} onClick={() => setTimeScale("weekly")}>
        Weekly
      </button>
      <button className={`b-pill ${timeScale === "monthly" ? "is-on" : ""}`} onClick={() => setTimeScale("monthly")}>
        Monthly
      </button>
    </div>
  );
}
