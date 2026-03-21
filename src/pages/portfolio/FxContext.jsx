// src/pages/portfolio/FxContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Safe localStorage hook — guards against SSR and private browsing failures
// ---------------------------------------------------------------------------
function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const stored = window.localStorage.getItem(key);
      return stored !== null ? stored : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const set = (next) => {
    setValue(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // Private browsing or storage full — value still lives in state
    }
  };

  return [value, set];
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const FxContext = createContext(null);

export function FxProvider({ children }) {
  const [baseCurrency, setBaseCurrency] = useLocalStorage("fx.baseCurrency", "AUD");
  const [rates,   setRates]   = useState({ AUD: 1 });
  const [meta,    setMeta]    = useState({ fetchedAt: "", provider: "", base: "AUD" });
  const [loading, setLoading] = useState(false);

  // Track the base currency in a ref so the cleanup function in useEffect
  // can check whether to discard a stale response
  const currentBase = useRef(baseCurrency);
  useEffect(() => { currentBase.current = baseCurrency; }, [baseCurrency]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const res  = await fetch(`/api/fx?base=${baseCurrency}`);
        if (!res.ok) throw new Error(`FX failed: ${res.status}`);
        const json = await res.json();

        if (cancelled || currentBase.current !== baseCurrency) return;

        const next = { ...(json?.rates || {}), [baseCurrency]: 1 };
        setRates(next);
        setMeta({
          fetchedAt: json?.fetchedAt || "",
          provider:  json?.provider  || "",
          base:      json?.base      || baseCurrency,
        });
      } catch (e) {
        console.warn("FX fetch failed; keeping previous rates.", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [baseCurrency]);

  const value = useMemo(
    () => ({ baseCurrency, setBaseCurrency, rates, meta, loading }),
    [baseCurrency, rates, meta, loading]
  );

  return <FxContext.Provider value={value}>{children}</FxContext.Provider>;
}

export function useFx() {
  const ctx = useContext(FxContext);
  if (!ctx) throw new Error("useFx must be used inside <FxProvider>");
  return ctx;
}