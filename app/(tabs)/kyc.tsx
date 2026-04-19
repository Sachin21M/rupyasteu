import { useState, useCallback, useRef } from "react";
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
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import Colors from "@/constants/colors";
import { getAepsMerchant, getAepsKycStatus } from "@/lib/api";

type KycStatusValue = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | string;

export default function KycScreen() {
  const insets = useSafeAreaInsets();
  const [kycStatus, setKycStatus] = useState<KycStatusValue>("NOT_STARTED");
  const [kycRedirectUrl, setKycRedirectUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [initiating, setInitiating] = useState(false);
  const [kycIncompleteWarning, setKycIncompleteWarning] = useState(false);

  const kycWebviewUsedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  useFocusEffect(
    useCallback(() => {
      loadKycStatus();

      const sub = AppState.addEventListener("change", (nextState) => {
        if (nextState === "active" && kycWebviewUsedRef.current) {
          kycWebviewUsedRef.current = false;
          loadKycStatus(true);
        }
        appStateRef.current = nextState;
      });

      return () => sub.remove();
    }, [])
  );

  async function loadKycStatus(silent = false) {
    if (!silent) setLoading(true);
    try {
      const result = await getAepsMerchant();
      if (result.merchant) {
        setKycStatus(result.merchant.kycStatus || "NOT_STARTED");
        if (result.merchant.kycRedirectUrl) {
          setKycRedirectUrl(result.merchant.kycRedirectUrl);
        }
      } else {
        setKycStatus("NOT_STARTED");
      }
    } catch {
      try {
        const ks = await getAepsKycStatus();
        setKycStatus(ks?.status || "NOT_STARTED");
      } catch {
        // silently ignore
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleStartKyc() {
    setInitiating(true);
    setKycIncompleteWarning(false);
    try {
      let url = kycRedirectUrl;
      if (!url) {
        const result = await getAepsMerchant();
        if (result.merchant?.kycRedirectUrl) {
          url = result.merchant.kycRedirectUrl;
          setKycRedirectUrl(url);
          setKycStatus(result.merchant.kycStatus || kycStatus);
        }
      }

      if (!url) {
        Alert.alert(
          "KYC Unavailable",
          "No KYC link is available yet. Please ensure your AEPS account is onboarded first."
        );
        return;
      }

      kycWebviewUsedRef.current = true;
      router.push(`/aeps/kyc-webview?url=${encodeURIComponent(url)}` as Href);
    } catch (err: unknown) {
      kycWebviewUsedRef.current = false;
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
        title: "KYC Verified",
        subtitle: "Your AEPS account is active and ready for transactions.",
      }
    : isInProgress
    ? {
        icon: "time" as const,
        color: Colors.warning,
        bg: Colors.warningLight,
        title: "KYC In Progress",
        subtitle: "Your KYC verification is being processed. Please check back soon.",
      }
    : {
        icon: "shield-outline" as const,
        color: Colors.textSecondary,
        bg: Colors.surface,
        title: "KYC Not Completed",
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
        <Pressable onPress={() => loadKycStatus(false)} style={styles.refreshBtn}>
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
          {[
            { icon: "person-circle-outline" as const, text: "Provide your Aadhaar and PAN details" },
            { icon: "location-outline" as const, text: "Allow location access when prompted" },
            { icon: "camera-outline" as const, text: "Complete biometric or photo verification" },
            { icon: "checkmark-circle-outline" as const, text: "Get instantly verified on PaySprint" },
          ].map((step, i) => (
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
