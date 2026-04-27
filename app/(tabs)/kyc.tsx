import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import Colors from "@/constants/colors";
import { getAepsMerchant, getAepsKycStatus, aepsOnboard } from "@/lib/api";

type KycStatusValue = "NOT_STARTED" | "IN_PROGRESS" | "PENDING" | "COMPLETED" | "FAILED" | string;

export default function KycScreen() {
  const insets = useSafeAreaInsets();
  const [kycStatus, setKycStatus] = useState<KycStatusValue>("NOT_STARTED");
  const [merchantCode, setMerchantCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [startingKyc, setStartingKyc] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    loadMerchantStatus();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMerchantStatus(true);
    }, [])
  );

  async function loadMerchantStatus(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [merchantResult, kycResult] = await Promise.allSettled([
        getAepsMerchant(),
        getAepsKycStatus(),
      ]);

      if (merchantResult.status === "fulfilled") {
        const r = merchantResult.value;
        if (r.merchant?.merchantCode) setMerchantCode(r.merchant.merchantCode);
        if (r.merchant?.kycStatus) setKycStatus(r.merchant.kycStatus);
      }

      if (kycResult.status === "fulfilled") {
        const ks = kycResult.value;
        if (ks?.kycStatus) setKycStatus(ks.kycStatus);
        else if (ks?.onboarded) setKycStatus("COMPLETED");
      }
    } catch {
      setKycStatus("NOT_STARTED");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleStartKyc() {
    if (!merchantCode) {
      Alert.alert(
        "KYC Unavailable",
        "Your merchant account is not set up yet. Please contact support to get onboarded first."
      );
      return;
    }
    setStartingKyc(true);
    try {
      const result = await aepsOnboard(merchantCode);
      if (result.success && result.redirectUrl) {
        if (Platform.OS === "web") {
          Linking.openURL(result.redirectUrl);
          Alert.alert(
            "KYC Form Opened",
            "Complete all 5 steps in the browser tab that just opened, then return here and tap Refresh to check your status."
          );
        } else {
          router.push(`/aeps/kyc-webview?url=${encodeURIComponent(result.redirectUrl)}` as Href);
        }
      } else if (result.sessionExpired) {
        Alert.alert(
          "KYC Session Expired",
          "Your KYC session has expired. Please ask your admin to regenerate your KYC link from the admin panel, then try again."
        );
      } else if (
        result.response_code === 12001 ||
        result.response_code === 2 ||
        result.alreadyRegistered ||
        (result.error || result.message || "").toLowerCase().includes("already registered")
      ) {
        Alert.alert(
          "KYC In Progress",
          "Your merchant account already exists in PaySprint. Please ask your admin to check your KYC status, or wait for activation."
        );
        await loadMerchantStatus(true);
      } else {
        Alert.alert(
          "Setup Failed",
          result.error || result.message || "PaySprint could not generate a KYC link. Please try again."
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start KYC. Please try again.";
      Alert.alert("Error", message);
    } finally {
      setStartingKyc(false);
    }
  }

  const isVerified = kycStatus === "COMPLETED";
  const isInProgress = kycStatus === "IN_PROGRESS";
  const isPending = kycStatus === "PENDING" && !isVerified;

  const statusConfig = isVerified
    ? {
        icon: "shield-checkmark" as const,
        color: Colors.success,
        bg: Colors.successLight,
        title: "Verified",
        subtitle: "Your AEPS account is active and ready for transactions.",
      }
    : isInProgress || isPending
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
              { icon: "web" as const, text: "PaySprint KYC form opens in a secure browser" },
              { icon: "card-account-details-outline" as const, text: "Enter your Aadhaar for OTP/biometric verification" },
              { icon: "account-edit-outline" as const, text: "Fill in your personal and business details" },
              { icon: "file-document-outline" as const, text: "Upload required KYC documents" },
              { icon: "bank-check" as const, text: "Submit — PaySprint activates your AEPS account" },
            ]
          ).map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <MaterialCommunityIcons name={step.icon} size={20} color={Colors.primary} style={styles.stepIcon} />
              <Text style={styles.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>
      )}

      {!isVerified && (
        <Pressable
          style={({ pressed }) => [
            styles.kycBtn,
            pressed && { opacity: 0.85 },
            startingKyc && styles.kycBtnDisabled,
          ]}
          onPress={handleStartKyc}
          disabled={startingKyc}
          testID="kyc-start-btn"
        >
          {startingKyc ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialCommunityIcons name="fingerprint" size={22} color="#fff" />
          )}
          <Text style={styles.kycBtnText}>
            {isInProgress || isPending ? "Continue KYC Setup" : "Start KYC Verification"}
          </Text>
          {!startingKyc && <Ionicons name="arrow-forward" size={20} color="#fff" />}
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
          : "Your status updates automatically after completing the KYC form."}
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
