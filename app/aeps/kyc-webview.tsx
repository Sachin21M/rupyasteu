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

// JS injected into WebView on every page load (via injectedJavaScriptBeforeContentLoaded).
// Two signals:
//  1. DOM polling every 300ms — reads page text for PaySprint completion keywords.
//  2. Click listener — catches the "Onboarding Completed" button click immediately,
//     before the page navigates away (solves the <300ms race condition).
// Both post KYC_COMPLETED to React Native via onMessage.
const COMPLETION_DETECTOR_JS = `
(function() {
  var _kycDone = false;

  function _notify(keyword) {
    if (_kycDone) return;
    _kycDone = true;
    clearInterval(_interval);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'KYC_COMPLETED', keyword: keyword }));
    }
  }

  // 1. DOM text polling — 300ms interval
  var _keywords = [
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
  var _interval = setInterval(function() {
    if (_kycDone) return;
    var body = document.body ? document.body.innerText || document.body.textContent || '' : '';
    var lower = body.toLowerCase();
    for (var i = 0; i < _keywords.length; i++) {
      if (lower.indexOf(_keywords[i]) !== -1) {
        _notify(_keywords[i]);
        break;
      }
    }
  }, 300);

  // 2. Click listener — catches "Onboarding Completed" button before navigation
  document.addEventListener('click', function(e) {
    if (_kycDone) return;
    var el = e.target;
    // Walk up to 3 parent levels (button may wrap a span/icon)
    for (var i = 0; i < 3 && el; i++) {
      var t = (el.innerText || el.textContent || '').toLowerCase().trim();
      if (t.indexOf('onboarding completed') !== -1 || t.indexOf('onboarding complete') !== -1) {
        _notify('BUTTON_CLICK:' + t.slice(0, 30));
        break;
      }
      el = el.parentElement;
    }
  }, true);

  // Auto-stop after 10 minutes
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
  const [completing, setCompleting] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    requestLocation();
  }, []);

  function onWebViewLoadEnd() {
    setWebviewLoading(false);
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

  async function markKycCompleted(source: string) {
    if (completedRef.current || completing) return;
    completedRef.current = true;
    setCompleting(true);
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
          // PaySprint explicitly redirected to our callback URL — definite completion signal.
          markKycCompleted("CALLBACK_URL_REDIRECT");
        } else {
          // User navigated away (e.g. pressed "Back to Home" mid-form, or error redirect).
          // Do NOT mark complete — the JS button-click listener + DOM polling handle
          // actual completion detection before any navigation happens.
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
});
