import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import { LOW_BALANCE_KEY } from "@/constants/wallet";
import { applyServerThreshold } from "@/contexts/ThresholdContext";

interface User {
  id: string;
  phone: string;
  name?: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "rupyasetu_token";
const USER_KEY = "rupyasetu_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    try {
      const [storedToken, storedUser] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setIsLoading(false);

        refreshProfile(storedToken);
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Failed to load auth:", error);
      setIsLoading(false);
    }
  }

  async function refreshProfile(storedToken: string) {
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/user/profile`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
        if (data.user?.lowBalanceThreshold) {
          await AsyncStorage.setItem(LOW_BALANCE_KEY, String(data.user.lowBalanceThreshold));
          applyServerThreshold(data.user.lowBalanceThreshold);
        }
      } else {
        await clearAuth();
      }
    } catch {
      // keep cached data if network fails
    }
  }

  async function clearAuth() {
    setToken(null);
    setUser(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  }

  async function login(newToken: string, newUser: User) {
    setToken(newToken);
    setUser(newUser);
    await AsyncStorage.setItem(TOKEN_KEY, newToken);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser));
  }

  async function logout() {
    await clearAuth();
  }

  function updateUser(data: Partial<User>) {
    if (user) {
      const updated = { ...user, ...data };
      setUser(updated);
      AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
    }
  }

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: !!token && !!user,
      login,
      logout,
      updateUser,
    }),
    [user, token, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
