import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Linking,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { kycWebviewComplete } from "@/lib/api";

type DoneState = "idle" | "submitting" | "submitted" | "verified";

export default function KycWebviewScreen() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const [loading, setLoading] = useState(true);
  const [webViewError, setWebViewError] = useState(false);
  const [doneState, setDoneState] = useState<DoneState>("idle");
  const completedRef = useRef(false);

  const decodedUrl = url ? decodeURIComponent(url) : "";

  useEffect(() => {
    if (Platform.OS !== "web") {
      Location.requestForegroundPermissionsAsync().catch(() => {});
    }
  }, []);

  async function handleFormComplete(fromCallback = false) {
    if (completedRef.current) return;
    if (!fromCallback) {
      Alert.alert(
        "Confirm Submission",
        "Only tap this after you have fully submitted the KYC form in the browser above. Have you completed all steps?",
        [
          { text: "Not Yet", style: "cancel" },
          { text: "Yes, I'm Done", onPress: () => doComplete() },
        ]
      );
      return;
    }
    doComplete();
  }

  async function doComplete() {
    if (completedRef.current) return;
    completedRef.current = true;
    setDoneState("submitting");
    try {
      const result = await kycWebviewComplete();
      if (result.kycStatus === "COMPLETED" || result.verified) {
        setDoneState("verified");
      } else {
        setDoneState("submitted");
      }
    } catch {
      setDoneState("submitted");
    }
  }

  const Header = ({ showBack = true }: { showBack?: boolean }) => (
    <View style={[styles.header, { paddingTop: topPadding }]}>
      {showBack ? (
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="kyc-webview-back">
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
      <Text style={styles.headerTitle}>KYC Verification</Text>
      <View style={{ width: 44 }} />
    </View>
  );

  if (doneState === "verified") {
    return (
      <View style={styles.container}>
        <Header showBack={false} />
        <View style={styles.centered}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.successLight }]}>
            <Ionicons name="shield-checkmark" size={48} color={Colors.success} />
          </View>
          <Text style={styles.doneTitle}>KYC Verified!</Text>
          <Text style={styles.doneSubtitle}>
            Your AEPS merchant account is now active. You can start performing transactions.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.back()} testID="kyc-done-btn">
            <Text style={styles.primaryBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (doneState === "submitted" || doneState === "submitting") {
    return (
      <View style={styles.container}>
        <Header showBack={doneState !== "submitting"} />
        <View style={styles.centered}>
          {doneState === "submitting" ? (
            <>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.processingText}>Verifying your submission…</Text>
            </>
          ) : (
            <>
              <View style={[styles.iconCircle, { backgroundColor: Colors.warningLight }]}>
                <Ionicons name="time-outline" size={48} color={Colors.warning} />
              </View>
              <Text style={styles.doneTitle}>KYC Submitted</Text>
              <Text style={styles.doneSubtitle}>
                Your KYC form was submitted successfully. PaySprint is activating your account — this usually takes a few minutes.{"\n\n"}
                Please come back and tap "Refresh" on the KYC screen after a few minutes, or ask your admin to approve from the admin panel.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={() => router.back()} testID="kyc-done-btn">
                <Text style={styles.primaryBtnText}>Back to KYC Status</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  if (!decodedUrl) {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
          <Text style={styles.doneTitle}>No KYC Link</Text>
          <Text style={styles.doneSubtitle}>
            No KYC URL was provided. Please go back and try again.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.primaryLight }]}>
            <Ionicons name="open-outline" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.doneTitle}>Complete KYC</Text>
          <Text style={styles.doneSubtitle}>
            Tap the button below to open the KYC form in a new browser tab. Complete all 5 steps, then come back here and tap "I've Completed the Form".
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => Linking.openURL(decodedUrl)}
            testID="kyc-open-browser-btn"
          >
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Open KYC Form</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={handleFormComplete}
            testID="kyc-web-done-btn"
          >
            <Text style={styles.secondaryBtnText}>I've Completed the Form</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const WebView = require("react-native-webview").WebView;

  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.webViewContainer}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading KYC Form…</Text>
          </View>
        )}
        {webViewError ? (
          <View style={styles.centered}>
            <Ionicons name="wifi-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.doneTitle}>Failed to Load</Text>
            <Text style={styles.doneSubtitle}>
              Could not load the KYC form. Please check your internet connection and try again.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => {
                setWebViewError(false);
                setLoading(true);
              }}
            >
              <Text style={styles.primaryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            source={{ uri: decodedUrl }}
            style={styles.webView}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setWebViewError(true);
            }}
            onNavigationStateChange={(state: { url: string }) => {
              const navUrl = state.url || "";
              const isCallback =
                navUrl.includes("rupyasetuapi.site/api/paysprint/aeps-callback") ||
                navUrl.includes("rupyasetuapi.site/api/paysprint/callback");
              if (isCallback) {
                handleFormComplete(true);
              }
            }}
            javaScriptEnabled
            domStorageEnabled
            geolocationEnabled
            startInLoadingState
            testID="kyc-webview"
          />
        )}
      </View>

      {!loading && !webViewError && (
        <View style={[styles.bottomBar, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 8 }]}>
          <Pressable
            style={styles.doneBtn}
            onPress={handleFormComplete}
            testID="kyc-form-done-btn"
          >
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.doneBtnText}>I've Completed the Form</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    zIndex: 10,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primaryLight,
  },
  doneTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  doneSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  processingText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    gap: 8,
    marginTop: 4,
    minWidth: 200,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    textAlign: "center",
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.primary,
    textAlign: "center",
  },
  bottomBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
  },
  doneBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.primary,
  },
});
