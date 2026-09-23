import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { getRecentTokens, setRecentTokens } from "@/lib/storage";

type HistoryContextValue = {
  recentTokens: string[];
  rememberStation: (token: string) => void;
  clearHistory: () => void;
};

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: PropsWithChildren) {
  const [recentTokens, setTokens] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void getRecentTokens().then((tokens) => {
      if (active) setTokens(tokens);
    });
    return () => {
      active = false;
    };
  }, []);

  function rememberStation(token: string) {
    setTokens((current) => {
      const next = [token, ...current.filter((value) => value !== token)].slice(0, 12);
      void setRecentTokens(next);
      return next;
    });
  }

  function clearHistory() {
    setTokens([]);
    void setRecentTokens([]);
  }

  return <HistoryContext.Provider value={{ recentTokens, rememberStation, clearHistory }}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryContextValue {
  const value = useContext(HistoryContext);
  if (!value) throw new Error("useHistory must be used inside HistoryProvider.");
  return value;
}
