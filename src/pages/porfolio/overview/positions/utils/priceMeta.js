// src/pages/portfolio/positions/utils/priceMeta.js

export const STALE_AFTER_HOURS = 24;

export async function safeJson(res) {
  try {
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function hoursSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60);
}

export function priceBadgeLabel(source, asOfIso) {
  const src = String(source || "").toUpperCase();
  const ageHrs = hoursSince(asOfIso);

  let main = "LAST";
  if (src.includes("LIVE")) main = "LIVE";
  else if (src.includes("CACHE")) main = "CACHED";
  else if (src) main = src;

  // LIVE prices don’t need age labels
  if (main === "LIVE") return "LIVE";

  if (ageHrs == null) return main;

  // Human-friendly age
  let ageLabel = "";
  if (ageHrs < 1) {
    ageLabel = `${Math.max(1, Math.round(ageHrs * 60))}m`;
  } else if (ageHrs < 24) {
    ageLabel = `${Math.round(ageHrs)}h`;
  } else {
    ageLabel = `${Math.round(ageHrs / 24)}d`;
  }

  const stale = ageHrs > STALE_AFTER_HOURS;
  return stale ? `${main} · STALE` : `${main} · ${ageLabel}`;
}
