import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LOW_BALANCE_KEY, DEFAULT_THRESHOLD } from "@/constants/wallet";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile } from "@/lib/api";

interface ThresholdContextValue {
  threshold: number;
  setThreshold: (value: number) => void;
}

const ThresholdContext = createContext<ThresholdContextValue | null>(null);

function ThresholdProviderInner({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [threshold, setThresholdState] = useState(DEFAULT_THRESHOLD);

  useEffect(() => {
    AsyncStorage.getItem(LOW_BALANCE_KEY).then((val) => {
      if (val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed > 0) {
          setThresholdState(parsed);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    async function syncFromServer() {
      try {
        const profile = await getUserProfile();
        if (profile?.user?.lowBalanceThreshold) {
          const serverVal = profile.user.lowBalanceThreshold;
          setThresholdState(serverVal);
          await AsyncStorage.setItem(LOW_BALANCE_KEY, String(serverVal));
        }
      } catch {}
    }
    syncFromServer();
  }, [isAuthenticated]);

  function setThreshold(value: number) {
    setThresholdState(value);
  }

  const contextValue = useMemo(
    () => ({ threshold, setThreshold }),
    [threshold]
  );

  return (
    <ThresholdContext.Provider value={contextValue}>
      {children}
    </ThresholdContext.Provider>
  );
}

export function ThresholdProvider({ children }: { children: ReactNode }) {
  return <ThresholdProviderInner>{children}</ThresholdProviderInner>;
}

export function useThreshold() {
  const context = useContext(ThresholdContext);
  if (!context) {
    throw new Error("useThreshold must be used within ThresholdProvider");
  }
  return context;
}
