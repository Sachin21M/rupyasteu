import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import type { WebView as WebViewClass, WebViewNavigation } from "react-native-webview";

const NativeWebView =
  Platform.OS !== "web"
    ? (require("react-native-webview") as { WebView: typeof WebViewClass }).WebView
    : null;

const KYC_DOMAIN = "merchantkyc.com";


type PermissionState = "requesting" | "granted" | "denied";

export default function KycWebViewScreen() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const [permState, setPermState] = useState<PermissionState>("requesting");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [webviewLoading, setWebviewLoading] = useState(true);
  const completedRef = useRef(false);

  useEffect(() => {
    requestLocation();
  }, []);

  async function requestLocation() {
    setPermState("requesting");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        try {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        } catch {
          // Position unavailable (emulator) — still proceed; WebView native
          // geolocation will attempt its own resolution
        }
        setPermState("granted");
      } else {
        setPermState("denied");
      }
    } catch {
      // Unexpected error requesting permission — treat as denied
      setPermState("denied");
    }
  }

  function handleNavigationStateChange(state: WebViewNavigation) {
    if (!state.url || completedRef.current) return;
    try {
      const host = new URL(state.url).hostname;
      const isOnKycDomain = host === KYC_DOMAIN || host.endsWith(`.${KYC_DOMAIN}`);
      if (!isOnKycDomain && state.url.startsWith("http")) {
        completedRef.current = true;
        router.back();
      }
    } catch {
      // URL parsing error — ignore
    }
  }

  function handleBack() {
    router.back();
  }

  // Inject coords override on Android only — iOS WebView resolves geolocation via
  // native CoreLocation; Android WebView benefits from the pre-fetched coord shim.
  const injectedJs =
    Platform.OS === "android" && coords
      ? `(function(){var loc={coords:{latitude:${coords.lat},longitude:${coords.lng},accuracy:20,altitude:null,altitudeAccuracy:null,heading:null,speed:null},timestamp:Date.now()};navigator.geolocation.getCurrentPosition=function(s){s(loc);};navigator.geolocation.watchPosition=function(s){setTimeout(function(){s(loc);},50);return 1;}; })();true;`
      : undefined;

  const Header = () => (
    <View style={[styles.header, { paddingTop: topPadding }]}>
      <Pressable onPress={handleBack} style={styles.backBtn} testID="kyc-back">
        <Ionicons name="arrow-back" size={24} color={Colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>KYC Setup</Text>
      <View style={{ width: 44 }} />
    </View>
  );

  if (permState === "requesting") {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Requesting location permission…</Text>
        </View>
      </View>
    );
  }

  if (permState === "denied") {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <View style={styles.iconCircle}>
            <Ionicons name="location-outline" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.deniedTitle}>Location Access Needed</Text>
          <Text style={styles.deniedText}>
            PaySprint's KYC verification requires your location to confirm your
            presence. Please allow location access and tap Retry.
          </Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              requestLocation();
            }}
            testID="kyc-retry-location"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
          <Pressable style={styles.cancelLink} onPress={handleBack}>
            <Text style={styles.cancelLinkText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (Platform.OS === "web" || !NativeWebView) {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <Ionicons name="globe-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.loadingText}>
            Please open this feature on your mobile device.
          </Text>
        </View>
      </View>
    );
  }

  // Security: only allow merchantkyc.com (exact or subdomain)
  let isValidKycUrl = false;
  try {
    const host = new URL(url ?? "").hostname;
    isValidKycUrl = host === KYC_DOMAIN || host.endsWith(`.${KYC_DOMAIN}`);
  } catch {
    isValidKycUrl = false;
  }

  if (!isValidKycUrl) {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <Ionicons name="warning-outline" size={48} color="#E53E3E" />
          <Text style={styles.deniedTitle}>Invalid KYC URL</Text>
          <Text style={styles.deniedText}>
            The KYC link appears to be invalid. Please go back and try again.
          </Text>
          <Pressable style={styles.cancelLink} onPress={handleBack}>
            <Text style={styles.cancelLinkText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.webviewContainer}>
        {webviewLoading && (
          <View style={styles.webviewOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading KYC page…</Text>
          </View>
        )}
        <NativeWebView
          source={{ uri: url ?? "" }}
          geolocationEnabled
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          mediaCapturePermissionGrantType="grant"
          injectedJavaScriptBeforeContentLoaded={injectedJs}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadEnd={() => setWebviewLoading(false)}
          style={styles.webview}
          testID="kyc-webview"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    color: Colors.text,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 12,
  },
  deniedTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  deniedText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingVertical: 14,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  cancelLink: {
    paddingVertical: 8,
  },
  cancelLinkText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  webviewContainer: {
    flex: 1,
    position: "relative",
  },
  webviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  webview: {
    flex: 1,
  },
});
