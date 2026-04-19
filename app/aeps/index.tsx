import { useState, useEffect, useCallback, useRef } from "react";
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
  TextInput,
  AppState,
} from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getAepsMerchant, aepsOnboard, aeps2faAuthenticate, getAepsKycStatus } from "@/lib/api";
import { discoverRdDevice, captureFingerprint, isSimulated } from "@/lib/rd-service";
import type { RdDeviceInfo } from "@/lib/rd-service";

type ServiceType = {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  color: string;
  requiresAmount: boolean;
};

const AEPS_SERVICES: ServiceType[] = [
  {
    id: "BALANCE_ENQUIRY",
    icon: <Ionicons name="wallet" size={28} color="#2E9E5B" />,
    label: "Balance Enquiry",
    description: "Check Aadhaar-linked bank balance",
    color: "#2E9E5B",
    requiresAmount: false,
  },
  {
    id: "CASH_WITHDRAWAL",
    icon: <Ionicons name="cash" size={28} color="#F59E0B" />,
    label: "Cash Withdrawal",
    description: "Withdraw cash using Aadhaar",
    color: "#F59E0B",
    requiresAmount: true,
  },
  {
    id: "MINI_STATEMENT",
    icon: <Ionicons name="document-text" size={28} color="#6366F1" />,
    label: "Mini Statement",
    description: "View recent bank transactions",
    color: "#6366F1",
    requiresAmount: false,
  },
  {
    id: "AADHAAR_PAY",
    icon: <MaterialCommunityIcons name="contactless-payment" size={28} color="#EF4444" />,
    label: "Aadhaar Pay",
    description: "Pay using Aadhaar authentication",
    color: "#EF4444",
    requiresAmount: true,
  },
  {
    id: "CASH_DEPOSIT",
    icon: <Ionicons name="arrow-down-circle" size={28} color="#10B981" />,
    label: "Cash Deposit",
    description: "Deposit cash to Aadhaar-linked account",
    color: "#10B981",
    requiresAmount: true,
  },
];

export default function AepsServicesScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);
  const [dailyAuthenticated, setDailyAuthenticated] = useState(false);
  const [kycStatus, setKycStatus] = useState("NOT_STARTED");
  const [merchantCode, setMerchantCode] = useState("");
  const [kycRedirectUrl, setKycRedirectUrl] = useState("");
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [kycIncompleteWarning, setKycIncompleteWarning] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kycVerifyingRef = useRef(false);
  const kycUrlOpenedRef = useRef(false);
  const kycWebviewUsedRef = useRef(false);
  const [kycVerifyingBanner, setKycVerifyingBanner] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authAadhaar, setAuthAadhaar] = useState("");
  const [rdDevice, setRdDevice] = useState<RdDeviceInfo | null>(null);
  const [rdChecking, setRdChecking] = useState(false);
  const [rdDiagnostics, setRdDiagnostics] = useState<string[]>([]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    checkMerchantStatus();
    checkRdDevice();

    // Web fallback: when Chrome returns from KYC URL, start a fresh polling loop
    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && kycUrlOpenedRef.current && Platform.OS === "web") {
        kycUrlOpenedRef.current = false;
        setKycVerifyingBanner(true);
        setKycIncompleteWarning(false);
        startKycPolling();
        verifyKycFromPaySprint();
      }
    });

    return () => {
      appStateSub.remove();
      stopKycPolling();
    };
  }, []);

  // When returning from the in-app KYC WebView screen, poll for up to 60 s
  useFocusEffect(
    useCallback(() => {
      if (kycWebviewUsedRef.current) {
        kycWebviewUsedRef.current = false;
        setKycVerifyingBanner(true);
        setKycIncompleteWarning(false);
        // Start a fresh 60-second polling loop; also do an immediate check
        startKycPolling();
        verifyKycFromPaySprint();
      }
    }, [])
  );

  async function checkRdDevice() {
    if (Platform.OS === "web") return;
    setRdChecking(true);
    setRdDiagnostics([]);
    try {
      const result = await discoverRdDevice();
      setRdDevice(result.device);
      setRdDiagnostics(result.diagnostics);
    } catch (e: any) {
      setRdDiagnostics([`Fatal: ${e?.message}`]);
    }
    setRdChecking(false);
  }

  const checkMerchantStatus = useCallback(async () => {
    try {
      const result = await getAepsMerchant();
      setOnboarded(result.onboarded || false);
      setDailyAuthenticated(result.dailyAuthenticated || false);
      setKycStatus(result.merchant?.kycStatus || "NOT_STARTED");
      if (result.merchant?.merchantCode) {
        setMerchantCode(result.merchant.merchantCode);
      }
      if (result.merchant?.kycRedirectUrl) {
        setKycRedirectUrl(result.merchant.kycRedirectUrl);
      }
    } catch {
      setOnboarded(false);
      setDailyAuthenticated(false);
      setKycStatus("NOT_STARTED");
    } finally {
      setLoading(false);
    }
  }, []);

  function stopKycPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }

  function startKycPolling() {
    stopKycPolling();
    pollingRef.current = setInterval(() => {
      verifyKycFromPaySprint();
    }, 5000);
    // Stop polling after 60 s and show the "not yet completed" fallback
    pollingTimeoutRef.current = setTimeout(() => {
      const wasPolling = pollingRef.current !== null;
      stopKycPolling();
      if (wasPolling) {
        setKycVerifyingBanner(false);
        setKycIncompleteWarning(true);
      }
    }, 60000);
  }

  async function verifyKycFromPaySprint() {
    // Deduplicate concurrent calls (e.g. immediate check + first interval tick)
    if (kycVerifyingRef.current) return;
    kycVerifyingRef.current = true;
    try {
      const result = await getAepsKycStatus();
      if (result.onboarded) {
        stopKycPolling();
        setOnboarded(true);
        setKycStatus("COMPLETED");
        setKycIncompleteWarning(false);
        setKycVerifyingBanner(false);
        Alert.alert("KYC Verified!", "Your AEPS merchant account is now active. You can perform AEPS transactions.");
      } else {
        // While a polling loop is running, stay silent — keep the banner visible
        // and let the next poll or the 60-second timeout handle the final verdict.
        if (!pollingRef.current) {
          setKycVerifyingBanner(false);
          setKycIncompleteWarning(true);
        }
      }
    } catch {
      // Silent fail; keep the banner if polling is still active
      if (!pollingRef.current) {
        setKycVerifyingBanner(false);
      }
    } finally {
      kycVerifyingRef.current = false;
    }
  }

  async function handleOpenKyc() {
    setKycIncompleteWarning(false);
    setOnboardingLoading(true);
    try {
      let url = kycRedirectUrl;
      if (!url && merchantCode) {
        const result = await aepsOnboard(merchantCode);
        if (result.success && result.redirectUrl) {
          url = result.redirectUrl;
          setKycRedirectUrl(result.redirectUrl);
        } else if (result.response_code === 12001) {
          // Already registered on PaySprint — just verify status
          setOnboardingLoading(false);
          await verifyKycFromPaySprint();
          return;
        } else {
          Alert.alert(
            "Setup Failed",
            result.error || result.message || "PaySprint could not generate a KYC link. Please try again."
          );
          setOnboardingLoading(false);
          return;
        }
      }
      if (!url) {
        Alert.alert("Error", "No KYC URL available. Please try again.");
        setOnboardingLoading(false);
        return;
      }

      if (Platform.OS === "web") {
        // Web fallback: open in system browser
        kycUrlOpenedRef.current = true;
        startKycPolling();
        await Linking.openURL(url);
      } else {
        // Native: open inside the app with location pre-granted.
        // Start polling while the WebView is open (mirrors browser flow).
        kycWebviewUsedRef.current = true;
        startKycPolling();
        router.push(`/aeps/kyc-webview?url=${encodeURIComponent(url)}` as Href);
      }
    } catch (err: any) {
      kycUrlOpenedRef.current = false;
      kycWebviewUsedRef.current = false;
      stopKycPolling();
      Alert.alert("Error", err.message || "Failed to open KYC setup.");
    } finally {
      setOnboardingLoading(false);
    }
  }

  async function handleDailyAuth() {
    if (Platform.OS !== "web" && authAadhaar.length !== 12) {
      Alert.alert("Aadhaar Required", "Enter your 12-digit Aadhaar number before scanning.");
      return;
    }
    setAuthLoading(true);
    try {
      const captureResult = await captureFingerprint();
      if (!captureResult.success) {
        Alert.alert(
          "Scan Failed",
          captureResult.error || "Could not capture biometric data.",
          [
            { text: "OK", style: "cancel" },
            { text: "Try Again", onPress: () => { setAuthLoading(false); setTimeout(handleDailyAuth, 300); return; } },
          ]
        );
        setAuthLoading(false);
        return;
      }
      if (captureResult.deviceInfo) setRdDevice(captureResult.deviceInfo);

      const result = await aeps2faAuthenticate({
        aadhaarNumber: authAadhaar,
        data: captureResult.pidData,
        latitude: "0.0",
        longitude: "0.0",
      });
      if (result.success) {
        setDailyAuthenticated(true);
        const devMsg = isSimulated() ? "" : `\n\nDevice: ${captureResult.deviceInfo?.manufacturer} ${captureResult.deviceInfo?.model}`;
        Alert.alert("Authenticated", `Daily 2FA authentication completed. You can now perform AEPS transactions.${devMsg}`);
      } else {
        Alert.alert("Failed", result.message || "Authentication failed. Please try again.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleServicePress(service: ServiceType) {
    router.push({
      pathname: "/aeps/transaction",
      params: {
        type: service.id,
        label: service.label,
        requiresAmount: service.requiresAmount ? "1" : "0",
      },
    });
  }

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: topPadding + 16, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 + 34 : 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>AEPS Services</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.infoBanner}>
        <View style={styles.infoBannerIcon}>
          <MaterialCommunityIcons name="fingerprint" size={32} color="#fff" />
        </View>
        <View style={styles.infoBannerText}>
          <Text style={styles.infoBannerTitle}>Aadhaar Enabled Payment</Text>
          <Text style={styles.infoBannerSub}>Banking services using Aadhaar + biometric verification</Text>
        </View>
      </View>

      {Platform.OS !== "web" && (
        <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
          <View style={[styles.rdDeviceBanner, { backgroundColor: rdDevice ? "#f0fdf4" : "#fff7ed", borderColor: rdDevice ? "#bbf7d0" : "#fed7aa", marginHorizontal: 0, marginBottom: 0 }]}>
            <View style={[styles.rdDeviceDot, { backgroundColor: rdChecking ? "#F59E0B" : rdDevice ? "#2E9E5B" : "#EF4444" }]} />
            <MaterialCommunityIcons
              name={rdDevice ? "usb" : "usb-port"}
              size={18}
              color={rdChecking ? "#F59E0B" : rdDevice ? "#2E9E5B" : "#EF4444"}
            />
            <Text style={[styles.rdDeviceBannerText, { color: rdChecking ? "#92400e" : rdDevice ? "#166534" : "#9a3412" }]}>
              {rdChecking
                ? "Scanning for biometric device..."
                : rdDevice
                ? `${rdDevice.manufacturer} ${rdDevice.model} detected (port ${rdDevice.port})`
                : "No biometric device detected — connect Mantra/Morpho via USB"}
            </Text>
            <Pressable onPress={checkRdDevice} hitSlop={10} disabled={rdChecking}>
              <Ionicons name="refresh" size={18} color={rdDevice ? "#2E9E5B" : "#F59E0B"} />
            </Pressable>
          </View>
        </View>
      )}

      {kycVerifyingBanner && (
        <View style={styles.kycVerifyingBanner}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.kycVerifyingBannerText}>KYC submitted — verifying with PaySprint…</Text>
        </View>
      )}

      {!onboarded && (
        <View style={styles.setupSection}>
          <View style={styles.setupCard}>
            <View style={styles.setupStep}>
              <View style={[styles.stepBadge, kycStatus === "COMPLETED" && styles.stepBadgeDone]}>
                {kycStatus === "COMPLETED" ? (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                ) : (
                  <Text style={styles.stepBadgeText}>1</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.setupTitle}>Merchant Onboarding</Text>
                <Text style={styles.setupSub}>Complete KYC to activate AEPS services</Text>
              </View>
            </View>
            {kycStatus !== "COMPLETED" && (
              <>
                {merchantCode ? (
                  <View style={styles.assignedCodeBox}>
                    <Text style={styles.assignedCodeLabel}>Your Merchant Code</Text>
                    <Text style={styles.assignedCodeValue}>{merchantCode}</Text>
                    <Text style={styles.assignedCodeHint}>Auto-assigned. Complete KYC verification below to activate AEPS.</Text>
                  </View>
                ) : (
                  <View style={styles.assignedCodeBox}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={[styles.assignedCodeHint, { marginTop: 8 }]}>Setting up your merchant account...</Text>
                    <Pressable
                      style={[styles.setupBtn, { marginTop: 12 }, onboardingLoading && { opacity: 0.6 }]}
                      onPress={() => { setLoading(true); checkMerchantStatus(); }}
                      disabled={onboardingLoading}
                    >
                      <Ionicons name="refresh" size={16} color="#fff" />
                      <Text style={styles.setupBtnText}>Retry Setup</Text>
                    </Pressable>
                  </View>
                )}
                {merchantCode ? (
                  <View>
                    {kycIncompleteWarning && (
                      <View style={styles.kycWarningBox}>
                        <Ionicons name="time-outline" size={16} color="#F59E0B" />
                        <Text style={styles.kycWarningText}>
                          KYC not yet completed on PaySprint. Please finish all steps on the verification page, then come back — we'll detect it automatically.
                        </Text>
                      </View>
                    )}
                    <Pressable
                      style={[styles.setupBtn, { backgroundColor: Colors.primary }, onboardingLoading && { opacity: 0.6 }]}
                      onPress={handleOpenKyc}
                      disabled={onboardingLoading}
                    >
                      {onboardingLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="open-outline" size={16} color="#fff" />
                          <Text style={styles.setupBtnText}>Complete Your KYC Setup</Text>
                        </>
                      )}
                    </Pressable>
                    <Text style={styles.kycAutoHint}>
                      After completing KYC, return to this app — your status will update automatically.
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>
      )}

      {onboarded && !dailyAuthenticated && (
        <View style={styles.setupSection}>
          <View style={[styles.setupCard, { borderColor: "#6366F1" }]}>
            <View style={styles.setupStep}>
              <View style={[styles.stepBadge, { backgroundColor: "#6366F1" }]}>
                <MaterialCommunityIcons name="fingerprint" size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.setupTitle}>Daily Authentication</Text>
                <Text style={styles.setupSub}>Complete biometric 2FA to proceed with transactions today</Text>
              </View>
            </View>
            {Platform.OS !== "web" && (
              <>
                <TextInput
                  style={styles.aadhaarInput}
                  placeholder="Enter your 12-digit Aadhaar number"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={12}
                  value={authAadhaar}
                  onChangeText={setAuthAadhaar}
                  editable={!authLoading}
                />
                <View style={styles.rdStatusRow}>
                  <View style={[styles.rdDot, { backgroundColor: rdDevice ? Colors.success : "#EF4444" }]} />
                  <Text style={[styles.rdStatusText, { color: rdDevice ? Colors.success : Colors.textSecondary }]}>
                    {rdChecking ? "Scanning for RD device..." : rdDevice ? `${rdDevice.manufacturer} ${rdDevice.model} connected` : "No RD device detected"}
                  </Text>
                  {!rdDevice && !rdChecking && (
                    <Pressable onPress={checkRdDevice} hitSlop={8}>
                      <Ionicons name="refresh" size={18} color={Colors.primary} />
                    </Pressable>
                  )}
                </View>
              </>
            )}
            <Pressable
              style={[styles.setupBtn, { backgroundColor: "#6366F1" }, (authLoading || (Platform.OS !== "web" && authAadhaar.length !== 12)) && { opacity: 0.5 }]}
              onPress={handleDailyAuth}
              disabled={authLoading || (Platform.OS !== "web" && authAadhaar.length !== 12)}
            >
              {authLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="fingerprint" size={18} color="#fff" />
                  <Text style={styles.setupBtnText}>Authenticate Now</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {onboarded && dailyAuthenticated && (
        <View style={styles.statusBanner}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
          <Text style={styles.statusText}>Ready for AEPS transactions</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Service</Text>
        <View style={styles.servicesGrid}>
          {AEPS_SERVICES.map((service) => (
            <Pressable
              key={service.id}
              style={({ pressed }) => [
                styles.serviceCard,
                pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
                (!onboarded || !dailyAuthenticated) && { opacity: 0.5 },
              ]}
              onPress={() => handleServicePress(service)}
              disabled={!onboarded || !dailyAuthenticated}
            >
              <View style={[styles.serviceIconWrap, { backgroundColor: service.color + "15" }]}>
                {service.icon}
              </View>
              <Text style={styles.serviceLabel}>{service.label}</Text>
              <Text style={styles.serviceDesc}>{service.description}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.infoSection}>
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
          <View style={styles.infoCardText}>
            <Text style={styles.infoCardTitle}>Secure & Certified</Text>
            <Text style={styles.infoCardSub}>All transactions use UIDAI-certified biometric devices</Text>
          </View>
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="time" size={20} color={Colors.primary} />
          <View style={styles.infoCardText}>
            <Text style={styles.infoCardTitle}>Instant Processing</Text>
            <Text style={styles.infoCardSub}>Transactions processed in real-time via NPCI</Text>
          </View>
        </View>
      </View>

    </ScrollView>
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
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  infoBanner: {
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 16,
  },
  infoBannerIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  infoBannerText: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 4,
  },
  infoBannerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    lineHeight: 18,
  },
  rdDeviceBanner: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rdDeviceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rdDeviceBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  rdDiagBox: {
    backgroundColor: "#1e1e2e",
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
    gap: 2,
  },
  rdDiagTitle: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#a0a0b0",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rdDiagLine: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "#e0e0f0",
    lineHeight: 16,
  },
  rdStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  rdDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rdStatusText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  setupSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  setupCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 14,
    borderWidth: 1.5,
    borderColor: "#F59E0B",
  },
  setupStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F59E0B",
    justifyContent: "center",
    alignItems: "center",
  },
  stepBadgeDone: {
    backgroundColor: Colors.success,
  },
  stepBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  setupTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  setupSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  assignedCodeBox: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#bbf7d0",
    alignItems: "center" as const,
    gap: 4,
  },
  assignedCodeLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#166534",
  },
  assignedCodeValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#2E9E5B",
    letterSpacing: 1,
  },
  assignedCodeHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#888",
    textAlign: "center" as const,
  },
  kycVerifyingBanner: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary + "60",
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  kycVerifyingBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.primary,
  },
  kycWarningBox: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  kycWarningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#92400E",
    lineHeight: 18,
  },
  kycAutoHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#888",
    textAlign: "center" as const,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  aadhaarInput: {
    height: 44,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#111827",
    backgroundColor: "#F9FAFB",
    marginBottom: 10,
    letterSpacing: 1,
  },
  setupBtn: {
    flex: 1,
    height: 44,
    backgroundColor: "#F59E0B",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  setupBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  statusBanner: {
    marginHorizontal: 20,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.successLight + "40",
    borderRadius: 12,
    padding: 12,
    paddingHorizontal: 16,
  },
  statusText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.success,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 14,
  },
  servicesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  serviceCard: {
    width: "47%",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  serviceIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  serviceLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  serviceDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  infoSection: {
    paddingHorizontal: 20,
    gap: 10,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
  },
  infoCardText: {
    flex: 1,
  },
  infoCardTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  infoCardSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
