import { mobileCatalogSchema, type MobileCatalog } from "@streamtumi/contracts";
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { requestJson } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

type CatalogContextValue = {
  catalog: MobileCatalog | null;
  loading: boolean;
  refreshing: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: PropsWithChildren) {
  const { session, ready } = useAuth();
  const [catalog, setCatalog] = useState<MobileCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setRefreshing(true);
    try {
      const next = await requestJson("/api/mobile/v1/catalog", mobileCatalogSchema, { cache: "no-store" });
      setCatalog(next);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Stream Guide could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, session]);

  return (
    <CatalogContext.Provider value={{ catalog, loading, refreshing, error, refresh }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useCatalog must be used inside CatalogProvider.");
  return value;
}
