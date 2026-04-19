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

let WebView: any = null;
if (Platform.OS !== "web") {
  WebView = require("react-native-webview").WebView;
}

type PermissionState = "requesting" | "granted" | "denied";

export default function KycWebViewScreen() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const [permState, setPermState] = useState<PermissionState>("requesting");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [webviewLoading, setWebviewLoading] = useState(true);
  const retryCount = useRef(0);

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
          // Could not get exact position (emulator, etc.) — still grant access
          // WebView's native geolocation will handle it
        }
        setPermState("granted");
      } else {
        setPermState("denied");
      }
    } catch {
      // Unexpected error — proceed anyway; WebView will prompt natively
      setPermState("granted");
    }
  }

  const injectedJs = coords
    ? `(function(){
  var _loc={coords:{latitude:${coords.lat},longitude:${coords.lng},accuracy:20,altitude:null,altitudeAccuracy:null,heading:null,speed:null},timestamp:Date.now()};
  navigator.geolocation.getCurrentPosition=function(s){s(_loc);};
  navigator.geolocation.watchPosition=function(s){setTimeout(function(){s(_loc);},50);return 1;};
})();true;`
    : undefined;

  function handleBack() {
    router.back();
  }

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
              retryCount.current += 1;
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

  if (Platform.OS === "web" || !WebView) {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <Text style={styles.loadingText}>
            WebView not available on web. Use the app on your phone.
          </Text>
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
        <WebView
          source={{ uri: url }}
          geolocationEnabled
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          mediaPlaybackRequiresUserAction={false}
          injectedJavaScriptBeforeContentLoaded={injectedJs}
          onPermissionRequest={(e: any) => {
            e.nativeEvent.grant(e.nativeEvent.resources);
          }}
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
