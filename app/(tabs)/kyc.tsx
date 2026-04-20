import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import Colors from "@/constants/colors";
import { getAepsMerchant, aepsOnboard, getAepsKycStatus } from "@/lib/api";

type KycStatusValue = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | string;

export default function KycScreen() {
  const insets = useSafeAreaInsets();
  const [kycStatus, setKycStatus] = useState<KycStatusValue>("NOT_STARTED");
  const [merchantCode, setMerchantCode] = useState("");
  const [kycRedirectUrl, setKycRedirectUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [initiating, setInitiating] = useState(false);
  const [kycIncompleteWarning, setKycIncompleteWarning] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const kycUrlOpenedRef = useRef(false);
  const kycWebviewUsedRef = useRef(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    loadMerchantStatus();

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && kycUrlOpenedRef.current && Platform.OS === "web") {
        kycUrlOpenedRef.current = false;
        stopKycPolling();
        verifyKycFromPaySprint();
      }
    });

    return () => {
      appStateSub.remove();
      stopKycPolling();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (kycWebviewUsedRef.current) {
        kycWebviewUsedRef.current = false;
        stopKycPolling();
        verifyKycFromPaySprint();
      }
    }, [])
  );

  async function loadMerchantStatus(silent = false) {
    if (!silent) setLoading(true);
    try {
      // Fetch both in parallel: merchant gives redirect URL + merchant code,
      // getAepsKycStatus is the authoritative status source per spec.
      const [merchantResult, kycResult] = await Promise.allSettled([
        getAepsMerchant(),
        getAepsKycStatus(),
      ]);

      if (merchantResult.status === "fulfilled") {
        const r = merchantResult.value;
        if (r.merchant?.merchantCode) setMerchantCode(r.merchant.merchantCode);
        if (r.merchant?.kycRedirectUrl) setKycRedirectUrl(r.merchant.kycRedirectUrl);
        // Use merchant status as fallback
        if (r.merchant?.kycStatus) setKycStatus(r.merchant.kycStatus);
      }

      // getAepsKycStatus overrides merchant status if available
      if (kycResult.status === "fulfilled") {
        const ks = kycResult.value;
        if (ks?.status) setKycStatus(ks.status);
        else if (ks?.onboarded) setKycStatus("COMPLETED");
      }
    } catch {
      setKycStatus("NOT_STARTED");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function stopKycPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  function startKycPolling() {
    stopKycPolling();
    pollingRef.current = setInterval(() => {
      verifyKycFromPaySprint();
    }, 5000);
  }

  async function verifyKycFromPaySprint(allowRedirect = false) {
    try {
      const result = await getAepsKycStatus();
      if (result.onboarded) {
        stopKycPolling();
        setKycStatus("COMPLETED");
        setKycIncompleteWarning(false);
        Alert.alert(
          "KYC Verified!",
          "Your AEPS merchant account is now active. You can perform AEPS transactions."
        );
      } else if (allowRedirect && result.redirectUrl) {
        // PaySprint has an active KYC session for this merchant — resume it
        setKycIncompleteWarning(false);
        if (Platform.OS === "web") {
          kycUrlOpenedRef.current = true;
          startKycPolling();
          await Linking.openURL(result.redirectUrl);
        } else {
          kycWebviewUsedRef.current = true;
          startKycPolling();
          router.push(`/aeps/kyc-webview?url=${encodeURIComponent(result.redirectUrl)}` as Href);
        }
      } else if (allowRedirect && result.sessionExpired) {
        // PaySprint session expired — admin must regenerate the KYC link
        Alert.alert(
          "KYC Session Expired",
          "Your KYC session has expired. Please ask your admin to regenerate your KYC link from the admin panel, then try again."
        );
      } else {
        setKycIncompleteWarning(true);
      }
    } catch {
      // Silent fail for background checks
    }
  }

  async function handleStartKyc() {
    setKycIncompleteWarning(false);
    setInitiating(true);
    try {
      // Always fetch a fresh URL — PaySprint KYC links expire quickly,
      // so we must never reuse a previously cached URL.
      let url = "";

      if (merchantCode) {
        const result = await aepsOnboard(merchantCode);
        if (result.success && result.redirectUrl) {
          url = result.redirectUrl;
          setKycRedirectUrl(url);
        } else if (
          result.response_code === 12001 ||
          result.response_code === 2 ||
          result.alreadyRegistered ||
          (result.error || result.message || "").toLowerCase().includes("already registered")
        ) {
          // Merchant already exists in PaySprint — check status and resume if URL available
          setInitiating(false);
          await verifyKycFromPaySprint(true);
          return;
        } else if (result.sessionExpired) {
          // PaySprint session has expired for this merchant
          Alert.alert(
            "KYC Session Expired",
            "Your KYC session has expired. Please ask your admin to regenerate your KYC link from the admin panel, then try again immediately."
          );
          setInitiating(false);
          return;
        } else {
          Alert.alert(
            "Setup Failed",
            result.error || result.message || "PaySprint could not generate a KYC link. Please try again."
          );
          setInitiating(false);
          return;
        }
      }

      if (!url) {
        Alert.alert(
          "KYC Unavailable",
          "Your merchant account is not set up yet. Please contact support to get onboarded first."
        );
        setInitiating(false);
        return;
      }

      if (Platform.OS === "web") {
        kycUrlOpenedRef.current = true;
        startKycPolling();
        await Linking.openURL(url);
      } else {
        kycWebviewUsedRef.current = true;
        startKycPolling();
        router.push(`/aeps/kyc-webview?url=${encodeURIComponent(url)}` as Href);
      }
    } catch (err: unknown) {
      kycUrlOpenedRef.current = false;
      kycWebviewUsedRef.current = false;
      stopKycPolling();
      const message = err instanceof Error ? err.message : "Failed to open KYC setup.";
      Alert.alert("Error", message);
    } finally {
      setInitiating(false);
    }
  }

  const isVerified = kycStatus === "COMPLETED";
  const isInProgress = kycStatus === "IN_PROGRESS";

  const statusConfig = isVerified
    ? {
        icon: "shield-checkmark" as const,
        color: Colors.success,
        bg: Colors.successLight,
        title: "Verified",
        subtitle: "Your AEPS account is active and ready for transactions.",
      }
    : isInProgress
    ? {
        icon: "time" as const,
        color: Colors.warning,
        bg: Colors.warningLight,
        title: "Pending",
        subtitle: "Your KYC verification is being processed. Please check back soon.",
      }
    : {
        icon: "shield-outline" as const,
        color: Colors.textSecondary,
        bg: Colors.surface,
        title: "Not Started",
        subtitle: "Complete your KYC to activate AEPS banking services.",
      };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Checking KYC status…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: Platform.OS === "web" ? 84 + 34 : 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Text style={styles.headerTitle}>KYC Verification</Text>
        <Pressable
          onPress={() => loadMerchantStatus(false)}
          style={styles.refreshBtn}
          testID="kyc-refresh-btn"
        >
          <Ionicons name="refresh" size={22} color={Colors.primary} />
        </Pressable>
      </View>

      <View style={[styles.statusCard, { backgroundColor: statusConfig.bg }]}>
        <View style={[styles.statusIconWrap, { backgroundColor: statusConfig.color + "20" }]}>
          <Ionicons name={statusConfig.icon} size={40} color={statusConfig.color} />
        </View>
        <Text style={[styles.statusTitle, { color: statusConfig.color }]}>
          {statusConfig.title}
        </Text>
        <Text style={styles.statusSubtitle}>{statusConfig.subtitle}</Text>

        {isVerified && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={styles.verifiedBadgeText}>Active</Text>
          </View>
        )}
      </View>

      {!isVerified && (
        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>How KYC Works</Text>
          {(
            [
              { icon: "person-circle-outline", text: "Provide your Aadhaar and PAN details" },
              { icon: "location-outline", text: "Allow location access when prompted" },
              { icon: "camera-outline", text: "Complete biometric or photo verification" },
              { icon: "checkmark-circle-outline", text: "Get instantly verified on PaySprint" },
            ] as const
          ).map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Ionicons name={step.icon} size={20} color={Colors.primary} style={styles.stepIcon} />
              <Text style={styles.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>
      )}

      {kycIncompleteWarning && (
        <View style={styles.warningBox}>
          <Ionicons name="warning-outline" size={18} color={Colors.warning} />
          <Text style={styles.warningText}>
            KYC not yet completed on PaySprint. Please finish all steps on the
            verification page, then come back — we'll detect it automatically.
          </Text>
        </View>
      )}

      {!isVerified && (
        <Pressable
          style={({ pressed }) => [
            styles.kycBtn,
            pressed && { opacity: 0.85 },
            initiating && styles.kycBtnDisabled,
          ]}
          onPress={handleStartKyc}
          disabled={initiating}
          testID="kyc-start-btn"
        >
          {initiating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="fingerprint" size={22} color="#fff" />
              <Text style={styles.kycBtnText}>
                {isInProgress ? "Continue KYC Setup" : "Start KYC Verification"}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </>
          )}
        </Pressable>
      )}

      {isVerified && (
        <Pressable
          style={({ pressed }) => [styles.aepsBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.push("/aeps")}
          testID="aeps-go-btn"
        >
          <MaterialCommunityIcons name="bank-outline" size={22} color={Colors.primary} />
          <Text style={styles.aepsBtnText}>Go to AEPS Banking</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.primary} />
        </Pressable>
      )}

      <Text style={styles.hintText}>
        {isVerified
          ? "Your KYC is verified with PaySprint. Contact support if you face any issues."
          : "After completing KYC on the PaySprint portal, return here — your status updates automatically."}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 8,
  },
  statusCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statusIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  statusTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  statusSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 4,
  },
  verifiedBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.success,
  },
  stepsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  stepsTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 4,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  stepNumText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
  stepIcon: {
    width: 24,
    textAlign: "center",
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 20,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: Colors.warningLight,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#92400E",
    lineHeight: 20,
  },
  kycBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  kycBtnDisabled: {
    opacity: 0.6,
  },
  kycBtnText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    textAlign: "center",
  },
  aepsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primaryLight,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary + "40",
  },
  aepsBtnText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
    textAlign: "center",
  },
  hintText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
