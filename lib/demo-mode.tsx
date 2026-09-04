import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type DemoModeContextValue = {
  isDemo: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
  demoNotice: string | null;
  showDemoNotice: (message?: string) => void;
  clearDemoNotice: () => void;
};

const DemoModeContext = createContext<DemoModeContextValue | null>(null);

const DEFAULT_DEMO_NOTICE = "هذه ميزة تجريبية — تُعرض داخل الجولة الاستعراضية فقط ولن تُحفظ. أنشئ منشأتك الحقيقية لاستخدامها فعليًا.";

/**
 * In-memory demo tour state. The demo NEVER persists anywhere: it only flips a
 * flag that BookingProvider reads to mount mock data and short-circuit all
 * writes, so nothing reaches Supabase, tRPC, or AsyncStorage.
 */
export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(false);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

  const value = useMemo<DemoModeContextValue>(() => ({
    isDemo,
    enterDemo: () => setIsDemo(true),
    exitDemo: () => {
      setIsDemo(false);
      setDemoNotice(null);
    },
    demoNotice,
    showDemoNotice: (message?: string) => setDemoNotice(message?.trim() || DEFAULT_DEMO_NOTICE),
    clearDemoNotice: () => setDemoNotice(null),
  }), [isDemo, demoNotice]);

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (!context) throw new Error("useDemoMode must be used within DemoModeProvider");
  return context;
}
