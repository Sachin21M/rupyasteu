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
import type {
  WebView as WebViewClass,
  WebViewNavigation,
  WebViewErrorEvent,
  WebViewMessageEvent,
} from "react-native-webview";
import { aepsOnboardComplete } from "@/lib/api";

const NativeWebView =
  Platform.OS !== "web"
    ? (require("react-native-webview") as { WebView: typeof WebViewClass }).WebView
    : null;

const KYC_DOMAIN = "merchantkyc.com";

// JS injected into the WebView after each page load.
// Polls DOM every 800ms for PaySprint's completion keywords.
// When found → posts KYC_COMPLETED message to React Native.
const COMPLETION_DETECTOR_JS = `
(function() {
  var _kycDone = false;
  var _interval = setInterval(function() {
    if (_kycDone) return;
    var body = document.body ? document.body.innerText || document.body.textContent || '' : '';
    var lower = body.toLowerCase();
    var keywords = [
      'onboarding completed',
      'bank 2 will be activate',
      'your bank 2 will be',
      'activation shortly',
      'onboarding complete',
      'kyc completed',
      'kyc complete',
      'successfully registered',
      'successfully onboarded',
    ];
    for (var i = 0; i < keywords.length; i++) {
      if (lower.indexOf(keywords[i]) !== -1) {
        _kycDone = true;
        clearInterval(_interval);
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'KYC_COMPLETED', keyword: keywords[i] }));
        }
        break;
      }
    }
  }, 800);
  // Auto-stop after 10 minutes to avoid memory leak
  setTimeout(function() { clearInterval(_interval); }, 600000);
})();
true;
`;

type PermissionState = "requesting" | "granted" | "denied";

export default function KycWebViewScreen() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const [permState, setPermState] = useState<PermissionState>("requesting");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [webviewLoading, setWebviewLoading] = useState(true);
  const [webviewError, setWebviewError] = useState<string | null>(null);
  const [showManualBtn, setShowManualBtn] = useState(false);
  const [completing, setCompleting] = useState(false);
  const completedRef = useRef(false);
  const manualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestLocation();
    return () => {
      if (manualTimerRef.current) clearTimeout(manualTimerRef.current);
    };
  }, []);

  // Show manual fallback button 25 seconds after WebView finishes loading
  function onWebViewLoadEnd() {
    setWebviewLoading(false);
    if (manualTimerRef.current) clearTimeout(manualTimerRef.current);
    manualTimerRef.current = setTimeout(() => {
      if (!completedRef.current) setShowManualBtn(true);
    }, 25000);
  }

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
          // Position unavailable — still proceed
        }
        setPermState("granted");
      } else {
        setPermState("denied");
      }
    } catch {
      setPermState("denied");
    }
  }

  // Called from both JS detection and manual button
  async function markKycCompleted(source: string) {
    if (completedRef.current || completing) return;
    completedRef.current = true;
    setCompleting(true);
    setShowManualBtn(false);
    console.log(`[KYC WebView] Completion triggered via: ${source}`);
    try {
      await aepsOnboardComplete({ status: "CALLBACK", fromCallback: true });
      console.log("[KYC WebView] Marked COMPLETED successfully");
    } catch (err) {
      console.warn("[KYC WebView] markKycCompleted API failed (proceeding anyway):", err);
    } finally {
      setCompleting(false);
      router.back();
    }
  }

  // Receive messages posted by the injected JS
  function handleWebViewMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "KYC_COMPLETED") {
        console.log("[KYC WebView] DOM detected completion keyword:", data.keyword);
        markKycCompleted(`DOM_DETECTION:${data.keyword}`);
      }
    } catch {
      // Ignore non-JSON messages from the page
    }
  }

  // Navigation state change — catches URL redirects (callback URL or off-domain)
  function handleNavigationStateChange(state: WebViewNavigation) {
    if (!state.url || completedRef.current) return;
    try {
      const host = new URL(state.url).hostname;
      const isOnKycDomain = host === KYC_DOMAIN || host.endsWith(`.${KYC_DOMAIN}`);
      if (!isOnKycDomain && state.url.startsWith("http")) {
        const isCallbackUrl = state.url.includes("aeps-callback");
        console.log(`[KYC WebView] Left KYC domain → url=${state.url} isCallback=${isCallbackUrl}`);
        if (isCallbackUrl) {
          markKycCompleted("CALLBACK_URL_REDIRECT");
        } else {
          completedRef.current = true;
          router.back();
        }
      }
    } catch {
      // URL parsing error — ignore
    }
  }

  function handleBack() {
    router.back();
  }

  function handleWebViewError(e: WebViewErrorEvent) {
    const desc = e.nativeEvent?.description || "";
    console.warn("[KYC WebView] Load error:", desc);
    setWebviewLoading(false);
    setWebviewError(
      "KYC session expired. Please go back and tap 'Complete Your KYC Setup' to get a fresh link."
    );
  }

  // Build injected JS — runs before content loads on EVERY page navigation.
  // Combines geolocation shim (Android only) + completion keyword detector.
  // BeforeContentLoaded re-fires on each navigation, so the detector works even
  // when PaySprint uses multi-page flow (not SPA).
  const geoShim =
    Platform.OS === "android" && coords
      ? `(function(){var loc={coords:{latitude:${coords.lat},longitude:${coords.lng},accuracy:20,altitude:null,altitudeAccuracy:null,heading:null,speed:null},timestamp:Date.now()};navigator.geolocation.getCurrentPosition=function(s){s(loc);};navigator.geolocation.watchPosition=function(s){setTimeout(function(){s(loc);},50);return 1;}; })();`
      : "";

  const injectedJsBeforeLoad = `${geoShim}${COMPLETION_DETECTOR_JS}`;

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
            PaySprint KYC verification requires your location to confirm your
            presence. Please allow location access and tap Retry.
          </Text>
          <Pressable style={styles.retryBtn} onPress={requestLocation} testID="kyc-retry-location">
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

  // Security: only allow merchantkyc.com
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

  if (webviewError) {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <View style={[styles.iconCircle, { backgroundColor: "#FEE2E2" }]}>
            <Ionicons name="time-outline" size={40} color="#EF4444" />
          </View>
          <Text style={styles.deniedTitle}>Session Expired</Text>
          <Text style={styles.deniedText}>{webviewError}</Text>
          <Pressable style={styles.cancelLink} onPress={handleBack}>
            <Text style={[styles.cancelLinkText, { color: Colors.primary }]}>Go Back</Text>
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

        {completing && (
          <View style={styles.completingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.completingText}>Saving your KYC status…</Text>
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
          injectedJavaScriptBeforeContentLoaded={injectedJsBeforeLoad}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleWebViewMessage}
          onLoadEnd={onWebViewLoadEnd}
          onError={handleWebViewError}
          style={styles.webview}
          testID="kyc-webview"
        />

        {/* Manual fallback button — shown 25s after load if not already completed */}
        {showManualBtn && !completing && (
          <View style={[styles.manualBtnContainer, { bottom: insets.bottom + 16 }]}>
            <Text style={styles.manualBtnHint}>
              PaySprint ka "Onboarding Completed" screen dikh raha hai?
            </Text>
            <Pressable
              style={styles.manualBtn}
              onPress={() => markKycCompleted("MANUAL_BUTTON")}
              testID="kyc-manual-complete"
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.manualBtnText}>Maine KYC Complete Kar Li</Text>
            </Pressable>
          </View>
        )}
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
  completingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    gap: 16,
  },
  completingText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  webview: {
    flex: 1,
  },
  manualBtnContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    gap: 8,
    zIndex: 15,
  },
  manualBtnHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  manualBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  manualBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
