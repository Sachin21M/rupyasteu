import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/contexts/AuthContext";
import { useFonts as useNativeFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";

if (Platform.OS === "web" && typeof window !== "undefined") {
  const link = document.createElement("link");
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
  link.rel = "stylesheet";
  document.head.appendChild(link);

  const style = document.createElement("style");
  style.textContent = `
    @font-face { font-family: 'Inter_400Regular'; src: local('Inter'), local('Inter-Regular'); font-weight: 400; }
    @font-face { font-family: 'Inter_500Medium'; src: local('Inter'), local('Inter-Medium'); font-weight: 500; }
    @font-face { font-family: 'Inter_600SemiBold'; src: local('Inter'), local('Inter-SemiBold'); font-weight: 600; }
    @font-face { font-family: 'Inter_700Bold'; src: local('Inter'), local('Inter-Bold'); font-weight: 700; }
  `;
  document.head.appendChild(style);
}

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
      <Stack.Screen name="login" />
      <Stack.Screen name="otp" />
      <Stack.Screen name="name" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="edit-profile" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="recharge/mobile"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="recharge/dth"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="recharge/plans"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="payment/utr"
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="payment/status"
        options={{ headerShown: false, animation: "fade" }}
      />
      <Stack.Screen
        name="privacy"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="help"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="about"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
    </Stack>
  );
}

function useFontsLoaded(): [boolean, Error | null] {
  const [webReady, setWebReady] = useState(Platform.OS === "web" ? false : true);

  const [nativeLoaded, nativeError] = useNativeFonts(
    Platform.OS !== "web"
      ? { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold }
      : {}
  );

  useEffect(() => {
    if (Platform.OS === "web") {
      if (typeof document !== "undefined" && document.fonts?.ready) {
        document.fonts.ready.then(() => setWebReady(true)).catch(() => setWebReady(true));
      } else {
        setTimeout(() => setWebReady(true), 100);
      }
    }
  }, []);

  if (Platform.OS === "web") return [webReady, null];
  return [nativeLoaded, nativeError];
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFontsLoaded();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <StatusBar style="dark" />
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
