import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LOW_BALANCE_KEY, DEFAULT_THRESHOLD } from "@/constants/wallet";

interface ThresholdContextValue {
  threshold: number;
  setThreshold: (value: number) => void;
}

const ThresholdContext = createContext<ThresholdContextValue | null>(null);

let _setThresholdExternal: ((value: number) => void) | null = null;

export function applyServerThreshold(value: number) {
  if (_setThresholdExternal) {
    _setThresholdExternal(value);
  }
}

function ThresholdProviderInner({ children }: { children: ReactNode }) {
  const [threshold, setThresholdState] = useState(DEFAULT_THRESHOLD);

  useEffect(() => {
    _setThresholdExternal = (value: number) => {
      setThresholdState(value);
      AsyncStorage.setItem(LOW_BALANCE_KEY, String(value));
    };
    return () => {
      _setThresholdExternal = null;
    };
  }, []);

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

  function setThreshold(value: number) {
    setThresholdState(value);
    AsyncStorage.setItem(LOW_BALANCE_KEY, String(value));
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
