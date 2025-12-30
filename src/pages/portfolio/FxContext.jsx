import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * One global FX source:
 * - baseCurrency (default AUD)
 * - rates (from /api/fx?base=AUD)
 * - fallback handled server-side (DB cached)
 */
const FxContext = createContext(null);

export function FxProvider({ children }) {
  const [baseCurrency, setBaseCurrency] = useState(() => {
    return localStorage.getItem("fx.baseCurrency") || "AUD";
  });

  const [rates, setRates] = useState({ AUD: 1 });
  const [meta, setMeta] = useState({ fetchedAt: "", provider: "", base: "AUD" });
  const [loading, setLoading] = useState(false);

  // persist base currency
  useEffect(() => {
    localStorage.setItem("fx.baseCurrency", baseCurrency);
  }, [baseCurrency]);

  // fetch rates whenever base changes
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const res = await fetch(`/api/fx?base=${baseCurrency}`);
        if (!res.ok) throw new Error(`FX failed: ${res.status}`);
        const json = await res.json();

        const next = { ...(json?.rates || {}) };
        next[baseCurrency] = 1; // ensure base is always 1

        if (!cancelled) {
          setRates(next);
          setMeta({
            fetchedAt: json?.fetchedAt || "",
            provider: json?.provider || "",
            base: json?.base || baseCurrency,
          });
        }
      } catch (e) {
        console.warn("FX fetch failed. Keeping previous FX rates in memory.", e);
        // IMPORTANT: do nothing -> we keep last good rates in state
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseCurrency]);

  const value = useMemo(
    () => ({
      baseCurrency,
      setBaseCurrency,
      rates,
      meta,
      loading,
    }),
    [baseCurrency, rates, meta, loading]
  );

  return <FxContext.Provider value={value}>{children}</FxContext.Provider>;
}

export function useFx() {
  const ctx = useContext(FxContext);
  if (!ctx) throw new Error("useFx must be used inside <FxProvider>");
  return ctx;
}
