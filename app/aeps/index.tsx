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
import { getAepsMerchant, aepsOnboard, aeps2faAuthenticate, aeps2faRegister, aepsEkycSendOtp, aepsEkycVerifyOtp, aepsEkycComplete, getAepsKycStatus } from "@/lib/api";
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
  const [ekycDone, setEkycDone] = useState(false);
  const [twoFaRegistered, setTwoFaRegistered] = useState(false);
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
  const [kycRejectionReason, setKycRejectionReason] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authAadhaar, setAuthAadhaar] = useState("");
  const [rdDevice, setRdDevice] = useState<RdDeviceInfo | null>(null);
  const [rdChecking, setRdChecking] = useState(false);
  const [rdDiagnostics, setRdDiagnostics] = useState<string[]>([]);

  // eKYC state
  const [ekycStep, setEkycStep] = useState<"idle" | "otp_sent" | "otp_verified">("idle");
  const [ekycAadhaar, setEkycAadhaar] = useState("");
  const [ekycOtp, setEkycOtp] = useState("");
  const [ekycOtpreqid, setEkycOtpreqid] = useState("");
  const [ekycLoading, setEkycLoading] = useState(false);

  // 2FA Registration state
  const [regAadhaar, setRegAadhaar] = useState("");
  const [regLoading, setRegLoading] = useState(false);

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
      setEkycDone(result.ekycDone || false);
      setTwoFaRegistered(result.twoFaRegistered || false);
      setDailyAuthenticated(result.dailyAuthenticated || false);
      const dbKycStatus = result.merchant?.kycStatus || "NOT_STARTED";
      setKycStatus(dbKycStatus);
      if (result.merchant?.merchantCode) {
        setMerchantCode(result.merchant.merchantCode);
      }
      if (result.merchant?.kycRedirectUrl) {
        setKycRedirectUrl(result.merchant.kycRedirectUrl);
      }
      // If PENDING, silently check PaySprint for real status (Approved/Rejected)
      if (dbKycStatus === "PENDING" && result.merchant?.merchantCode) {
        verifyKycFromPaySprint(false);
      }
    } catch {
      setOnboarded(false);
      setEkycDone(false);
      setTwoFaRegistered(false);
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

  async function verifyKycFromPaySprint(allowRedirect = false) {
    if (kycVerifyingRef.current) return;
    kycVerifyingRef.current = true;
    try {
      const result = await getAepsKycStatus();
      if (result.onboarded) {
        stopKycPolling();
        setOnboarded(true);
        setKycStatus("COMPLETED");
        setKycRejectionReason("");
        setKycIncompleteWarning(false);
        setKycVerifyingBanner(false);
        Alert.alert("KYC Verified!", "Your AEPS merchant account is now active. You can perform AEPS transactions.");
      } else if (result.kycStatus === "REJECTED" || result.rejectionReason) {
        // Bank ne reject kar diya — stop polling aur reason dikhao
        stopKycPolling();
        setKycVerifyingBanner(false);
        setKycIncompleteWarning(false);
        setKycStatus("REJECTED");
        setKycRejectionReason(result.rejectionReason || "Bank ne onboarding reject kar di.");
      } else if (allowRedirect && result.redirectUrl) {
        setKycIncompleteWarning(false);
        setKycVerifyingBanner(false);
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
        setKycVerifyingBanner(false);
        Alert.alert(
          "KYC Session Expired",
          "Your KYC session has expired. Please tap 'Complete Your KYC Setup' to get a fresh link and complete the process."
        );
      } else {
        if (!pollingRef.current) {
          setKycVerifyingBanner(false);
          setKycIncompleteWarning(true);
        }
      }
    } catch {
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
      // Always fetch a fresh URL — PaySprint KYC links expire quickly,
      // so we must never reuse a previously cached URL.
      let url = "";
      if (merchantCode) {
        const result = await aepsOnboard(merchantCode);
        if (result.success && result.redirectUrl) {
          url = result.redirectUrl;
          setKycRedirectUrl(result.redirectUrl);
        } else if (
          result.response_code === 12001 ||
          result.response_code === 2 ||
          result.alreadyRegistered ||
          (result.error || result.message || "").toLowerCase().includes("already registered")
        ) {
          // Merchant already exists in PaySprint — check status and resume if URL available
          setOnboardingLoading(false);
          await verifyKycFromPaySprint(true);
          return;
        } else if (result.sessionExpired) {
          Alert.alert(
            "KYC Session Expired",
            "Your KYC session has expired. Please tap 'Complete Your KYC Setup' again to get a fresh link."
          );
          setOnboardingLoading(false);
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
        Alert.alert("Error", "Merchant account not found. Please contact support.");
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

  async function handleEkycSendOtp() {
    setEkycLoading(true);
    try {
      const result = await aepsEkycSendOtp();
      if (result.alreadyDone) {
        setEkycDone(true);
        return;
      }
      if (result.success && result.otpreqid) {
        setEkycOtpreqid(result.otpreqid);
        setEkycStep("otp_sent");
        Alert.alert("OTP Sent", "An OTP has been sent to your Aadhaar-linked mobile number. Enter it below.");
      } else {
        Alert.alert("Failed", result.message || result.error || "Could not send OTP. Please try again.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to send OTP");
    } finally {
      setEkycLoading(false);
    }
  }

  async function handleEkycVerifyOtp() {
    if (ekycOtp.length < 4) {
      Alert.alert("Invalid OTP", "Please enter the OTP received on your Aadhaar-linked mobile.");
      return;
    }
    setEkycLoading(true);
    try {
      const result = await aepsEkycVerifyOtp({ otp: ekycOtp, otpreqid: ekycOtpreqid });
      if (result.alreadyDone) {
        setEkycDone(true);
        return;
      }
      if (result.success) {
        setEkycStep("otp_verified");
        Alert.alert("OTP Verified", "OTP verified successfully. Now scan your fingerprint to complete eKYC.");
      } else {
        Alert.alert("OTP Invalid", result.message || "Incorrect OTP. Please check and try again.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "OTP verification failed");
    } finally {
      setEkycLoading(false);
    }
  }

  async function handleEkycComplete() {
    if (Platform.OS !== "web" && ekycAadhaar.length !== 12) {
      Alert.alert("Aadhaar Required", "Enter your 12-digit Aadhaar number.");
      return;
    }
    setEkycLoading(true);
    try {
      const captureResult = await captureFingerprint();
      if (!captureResult.success) {
        Alert.alert(
          "Scan Failed",
          captureResult.error || "Could not capture fingerprint.",
          [
            { text: "OK", style: "cancel" },
            { text: "Try Again", onPress: () => { setEkycLoading(false); setTimeout(handleEkycComplete, 300); } },
          ]
        );
        setEkycLoading(false);
        return;
      }

      const result = await aepsEkycComplete({
        aadhaar: ekycAadhaar,
        pidXml: captureResult.pidData,
      });

      if (result.success) {
        setEkycDone(true);
        setEkycStep("idle");
        Alert.alert("eKYC Complete", "Your eKYC has been completed successfully. Now complete 2FA registration.");
      } else {
        Alert.alert("eKYC Failed", result.message || result.error || "eKYC could not be completed. Please try again.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "eKYC failed");
    } finally {
      setEkycLoading(false);
    }
  }

  async function handleTwoFaRegister() {
    if (Platform.OS !== "web" && regAadhaar.length !== 12) {
      Alert.alert("Aadhaar Required", "Enter your 12-digit Aadhaar number.");
      return;
    }
    setRegLoading(true);
    try {
      const captureResult = await captureFingerprint();
      if (!captureResult.success) {
        Alert.alert(
          "Scan Failed",
          captureResult.error || "Could not capture fingerprint.",
          [
            { text: "OK", style: "cancel" },
            { text: "Try Again", onPress: () => { setRegLoading(false); setTimeout(handleTwoFaRegister, 300); } },
          ]
        );
        setRegLoading(false);
        return;
      }
      if (captureResult.deviceInfo) setRdDevice(captureResult.deviceInfo);

      const result = await aeps2faRegister({
        aadhaarNumber: regAadhaar,
        pidXml: captureResult.pidData,
        data: captureResult.pidData,
        latitude: "0.0",
        longitude: "0.0",
      });

      if (result.success) {
        setTwoFaRegistered(true);
        Alert.alert("Registration Complete", "2FA biometric registration successful. Now complete daily authentication to start transactions.");
      } else {
        Alert.alert("Registration Failed", result.message || result.error || "2FA registration failed. Please try again.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "2FA registration failed");
    } finally {
      setRegLoading(false);
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

      <View style={styles.stepsProgress}>
        {([
          { label: "KYC", done: onboarded, active: !onboarded },
          { label: "eKYC", done: ekycDone, active: onboarded && !ekycDone },
          { label: "2FA Reg", done: twoFaRegistered, active: onboarded && ekycDone && !twoFaRegistered },
          { label: "Daily Auth", done: dailyAuthenticated, active: onboarded && ekycDone && twoFaRegistered && !dailyAuthenticated },
        ] as { label: string; done: boolean; active: boolean }[]).map((step, i, arr) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
              {i > 0 && <View style={{ flex: 1, height: 2, backgroundColor: arr[i - 1].done ? Colors.success : "#E5E7EB" }} />}
              <View style={[
                styles.stepProgressDot,
                step.done && styles.stepProgressDotDone,
                step.active && styles.stepProgressDotActive,
              ]}>
                {step.done
                  ? <Ionicons name="checkmark" size={11} color="#fff" />
                  : <Text style={styles.stepProgressNum}>{i + 1}</Text>}
              </View>
              {i < arr.length - 1 && <View style={{ flex: 1, height: 2, backgroundColor: step.done ? Colors.success : "#E5E7EB" }} />}
            </View>
            <Text style={[
              styles.stepProgressLabel,
              step.done && { color: Colors.success },
              step.active && { color: Colors.primary, fontFamily: "Inter_600SemiBold" as const },
            ]}>{step.label}</Text>
          </View>
        ))}
      </View>

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
                    {kycStatus === "REJECTED" && kycRejectionReason ? (
                      <View style={styles.kycRejectedBox}>
                        <Ionicons name="close-circle" size={18} color="#DC2626" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.kycRejectedTitle}>Onboarding Rejected</Text>
                          <Text style={styles.kycRejectedReason}>{kycRejectionReason}</Text>
                          <Text style={styles.kycRejectedHint}>
                            Please contact PaySprint support with your Merchant Code for resolution.
                          </Text>
                        </View>
                      </View>
                    ) : kycIncompleteWarning ? (
                      <View style={styles.kycWarningBox}>
                        <Ionicons name="time-outline" size={16} color="#F59E0B" />
                        <Text style={styles.kycWarningText}>
                          PaySprint aapka Aadhaar verify kar raha hai. 15-30 minute baad dobara check karein.
                        </Text>
                      </View>
                    ) : null}
                    {kycStatus !== "REJECTED" && (
                      <>
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
                      </>
                    )}
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>
      )}

      {onboarded && !ekycDone && (
        <View style={styles.setupSection}>
          <View style={[styles.setupCard, { borderColor: "#8B5CF6" }]}>
            <View style={styles.setupStep}>
              <View style={[styles.stepBadge, { backgroundColor: "#8B5CF6" }]}>
                <Ionicons name="shield-checkmark" size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.setupTitle}>eKYC Verification</Text>
                <Text style={styles.setupSub}>
                  {ekycStep === "idle" ? "Verify your identity via OTP to activate AEPS" : ekycStep === "otp_sent" ? "Enter OTP sent to your Aadhaar-linked mobile" : "Scan fingerprint to complete eKYC"}
                </Text>
              </View>
            </View>

            {ekycStep === "idle" && (
              <>
                {Platform.OS !== "web" && (
                  <TextInput
                    style={styles.aadhaarInput}
                    placeholder="Your 12-digit Aadhaar number"
                    placeholderTextColor={Colors.textSecondary}
                    keyboardType="number-pad"
                    maxLength={12}
                    value={ekycAadhaar}
                    onChangeText={setEkycAadhaar}
                    editable={!ekycLoading}
                  />
                )}
                <Pressable
                  style={[styles.setupBtn, { backgroundColor: "#8B5CF6" }, ekycLoading && { opacity: 0.5 }]}
                  onPress={handleEkycSendOtp}
                  disabled={ekycLoading}
                >
                  {ekycLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="phone-portrait" size={16} color="#fff" />
                      <Text style={styles.setupBtnText}>Send OTP</Text>
                    </>
                  )}
                </Pressable>
              </>
            )}

            {ekycStep === "otp_sent" && (
              <>
                <TextInput
                  style={styles.aadhaarInput}
                  placeholder="Enter OTP"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={ekycOtp}
                  onChangeText={setEkycOtp}
                  editable={!ekycLoading}
                />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    style={[styles.setupBtn, { backgroundColor: "#9CA3AF", flex: 0.4 }, ekycLoading && { opacity: 0.5 }]}
                    onPress={() => { setEkycStep("idle"); setEkycOtp(""); }}
                    disabled={ekycLoading}
                  >
                    <Text style={styles.setupBtnText}>Resend</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.setupBtn, { backgroundColor: "#8B5CF6" }, (ekycLoading || ekycOtp.length < 4) && { opacity: 0.5 }]}
                    onPress={handleEkycVerifyOtp}
                    disabled={ekycLoading || ekycOtp.length < 4}
                  >
                    {ekycLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.setupBtnText}>Verify OTP</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}

            {ekycStep === "otp_verified" && (
              <>
                <View style={[styles.kycWarningBox, { backgroundColor: "#EDE9FE", borderColor: "#C4B5FD" }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#7C3AED" />
                  <Text style={[styles.kycWarningText, { color: "#5B21B6" }]}>OTP verified! Now scan your fingerprint to complete eKYC.</Text>
                </View>
                {Platform.OS !== "web" && (
                  <>
                    {!ekycAadhaar && (
                      <TextInput
                        style={styles.aadhaarInput}
                        placeholder="Your 12-digit Aadhaar number"
                        placeholderTextColor={Colors.textSecondary}
                        keyboardType="number-pad"
                        maxLength={12}
                        value={ekycAadhaar}
                        onChangeText={setEkycAadhaar}
                        editable={!ekycLoading}
                      />
                    )}
                    <View style={styles.rdStatusRow}>
                      <View style={[styles.rdDot, { backgroundColor: rdDevice ? Colors.success : "#EF4444" }]} />
                      <Text style={[styles.rdStatusText, { color: rdDevice ? Colors.success : Colors.textSecondary }]}>
                        {rdChecking ? "Scanning..." : rdDevice ? `${rdDevice.manufacturer} ${rdDevice.model}` : "No RD device found"}
                      </Text>
                    </View>
                  </>
                )}
                <Pressable
                  style={[styles.setupBtn, { backgroundColor: "#8B5CF6" }, (ekycLoading || (Platform.OS !== "web" && ekycAadhaar.length !== 12)) && { opacity: 0.5 }]}
                  onPress={handleEkycComplete}
                  disabled={ekycLoading || (Platform.OS !== "web" && ekycAadhaar.length !== 12)}
                >
                  {ekycLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="fingerprint" size={18} color="#fff" />
                      <Text style={styles.setupBtnText}>Complete eKYC</Text>
                    </>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}

      {onboarded && ekycDone && !twoFaRegistered && (
        <View style={styles.setupSection}>
          <View style={[styles.setupCard, { borderColor: "#F59E0B" }]}>
            <View style={styles.setupStep}>
              <View style={[styles.stepBadge, { backgroundColor: "#F59E0B" }]}>
                <MaterialCommunityIcons name="fingerprint" size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.setupTitle}>2FA Registration</Text>
                <Text style={styles.setupSub}>One-time biometric registration to enable AEPS transactions</Text>
              </View>
            </View>
            {Platform.OS !== "web" && (
              <>
                <TextInput
                  style={styles.aadhaarInput}
                  placeholder="Your 12-digit Aadhaar number"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={12}
                  value={regAadhaar}
                  onChangeText={setRegAadhaar}
                  editable={!regLoading}
                />
                <View style={styles.rdStatusRow}>
                  <View style={[styles.rdDot, { backgroundColor: rdDevice ? Colors.success : "#EF4444" }]} />
                  <Text style={[styles.rdStatusText, { color: rdDevice ? Colors.success : Colors.textSecondary }]}>
                    {rdChecking ? "Scanning..." : rdDevice ? `${rdDevice.manufacturer} ${rdDevice.model}` : "No RD device found"}
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
              style={[styles.setupBtn, { backgroundColor: "#F59E0B" }, (regLoading || (Platform.OS !== "web" && regAadhaar.length !== 12)) && { opacity: 0.5 }]}
              onPress={handleTwoFaRegister}
              disabled={regLoading || (Platform.OS !== "web" && regAadhaar.length !== 12)}
            >
              {regLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="fingerprint" size={18} color="#fff" />
                  <Text style={styles.setupBtnText}>Register Biometric</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {onboarded && ekycDone && twoFaRegistered && !dailyAuthenticated && (
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

      {onboarded && ekycDone && twoFaRegistered && dailyAuthenticated && (
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
                (!onboarded || !ekycDone || !twoFaRegistered || !dailyAuthenticated) && { opacity: 0.5 },
              ]}
              onPress={() => handleServicePress(service)}
              disabled={!onboarded || !ekycDone || !twoFaRegistered || !dailyAuthenticated}
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
  kycRejectedBox: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 12,
    marginBottom: 10,
  },
  kycRejectedTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#DC2626",
    marginBottom: 2,
  },
  kycRejectedReason: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#991B1B",
    lineHeight: 18,
    marginBottom: 4,
  },
  kycRejectedHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#B91C1C",
    lineHeight: 16,
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
  stepsProgress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    marginBottom: 20,
    gap: 0,
  },
  stepProgressItem: {
    flex: 1,
    alignItems: "center",
    flexDirection: "column",
    position: "relative",
  },
  stepProgressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  stepProgressDotDone: {
    backgroundColor: Colors.success,
  },
  stepProgressDotActive: {
    backgroundColor: Colors.primary,
  },
  stepProgressNum: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#6B7280",
  },
  stepProgressLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
    textAlign: "center",
  },
  stepProgressLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#E5E7EB",
  },
});
