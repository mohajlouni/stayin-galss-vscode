import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { Chalet } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";

const STORAGE_KEY = "hajez-selected-chalet-v1";

type ChaletScopeValue = {
  selectedChaletId: string | null;
  selectedChalet: Chalet | null;
  setSelectedChaletId: (id: string | null) => Promise<void>;
  isAllChalets: boolean;
};

const ChaletScopeContext = createContext<ChaletScopeValue | null>(null);

export function ChaletScopeProvider({ children }: { children: React.ReactNode }) {
  const { chalets, hydrated } = useBookings();
  const [selectedChaletId, setSelectedChaletIdState] = useState<string | null>(null);
  const [scopeHydrated, setScopeHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      setSelectedChaletIdState(value || null);
      setScopeHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated || !scopeHydrated || !selectedChaletId) return;
    if (chalets.some((chalet) => chalet.id === selectedChaletId)) return;
    setSelectedChaletIdState(null);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, [chalets, hydrated, scopeHydrated, selectedChaletId]);

  const setSelectedChaletId = async (id: string | null) => {
    setSelectedChaletIdState(id);
    if (id) await AsyncStorage.setItem(STORAGE_KEY, id);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  };

  const selectedChalet = useMemo(() => chalets.find((chalet) => chalet.id === selectedChaletId) ?? null, [chalets, selectedChaletId]);
  const value = useMemo<ChaletScopeValue>(() => ({ selectedChaletId: selectedChalet?.id ?? null, selectedChalet, setSelectedChaletId, isAllChalets: !selectedChalet }), [selectedChalet]);
  return <ChaletScopeContext.Provider value={value}>{children}</ChaletScopeContext.Provider>;
}

export function useChaletScope() {
  const value = useContext(ChaletScopeContext);
  if (!value) throw new Error("useChaletScope must be used inside ChaletScopeProvider");
  return value;
}
