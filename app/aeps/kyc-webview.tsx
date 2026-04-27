import { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { aepsKycSendOtp, aepsKycVerifyOtp } from "@/lib/api";

type Step = "aadhaar" | "otp" | "success";

interface KycError {
  message: string;
  errorCode: string;
  retryable: boolean;
}

export default function KycOtpScreen() {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const [step, setStep] = useState<Step>("aadhaar");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [maskedAadhaar, setMaskedAadhaar] = useState("");
  const [otpError, setOtpError] = useState<KycError | null>(null);
  const [sendOtpError, setSendOtpError] = useState<KycError | null>(null);

  const otpInputRef = useRef<TextInput>(null);

  function handleBack() {
    if (step === "otp") {
      setStep("aadhaar");
      setOtp("");
      setOtpError(null);
    } else {
      router.back();
    }
  }

  async function handleSendOtp() {
    const clean = aadhaarNumber.replace(/\s/g, "");
    if (!/^\d{12}$/.test(clean)) {
      Alert.alert("Invalid Aadhaar", "Please enter a valid 12-digit Aadhaar number.");
      return;
    }
    setLoading(true);
    setSendOtpError(null);
    try {
      const result = await aepsKycSendOtp(clean);
      if (result.alreadyVerified) {
        Alert.alert("Already Verified", "Your KYC is already completed.", [
          { text: "OK", onPress: () => router.back() },
        ]);
        return;
      }
      setMaskedAadhaar("XXXX-XXXX-" + clean.slice(-4));
      setStep("otp");
      setOtpError(null);
      setTimeout(() => otpInputRef.current?.focus(), 300);
    } catch (err: any) {
      setSendOtpError({
        message: err.message || "Failed to send OTP. Please try again.",
        errorCode: err.errorCode || "UNKNOWN",
        retryable: err.retryable ?? true,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    const trimmed = otp.trim();
    if (!/^\d{4,8}$/.test(trimmed)) {
      Alert.alert("Invalid OTP", "Please enter the OTP received on your Aadhaar-linked mobile.");
      return;
    }
    setLoading(true);
    setOtpError(null);
    try {
      const result = await aepsKycVerifyOtp(trimmed);
      if (result.success && (result.kycStatus === "COMPLETED" || !result.kycStatus)) {
        setStep("success");
      } else {
        setOtpError({
          message: result.message || result.error || "OTP verification failed. Please try again.",
          errorCode: result.errorCode || "UNKNOWN",
          retryable: result.retryable ?? false,
        });
        if (!result.retryable) {
          setOtp("");
        }
      }
    } catch (err: any) {
      setOtpError({
        message: err.message || "Verification failed. Please try again.",
        errorCode: err.errorCode || "UNKNOWN",
        retryable: err.retryable ?? false,
      });
      if (err.retryable === false) {
        setOtp("");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleResendOtp() {
    setOtp("");
    setOtpError(null);
    setStep("aadhaar");
  }

  function handleStartOver() {
    setOtp("");
    setOtpError(null);
    setSendOtpError(null);
    setAadhaarNumber("");
    setStep("aadhaar");
  }

  const Header = () => (
    <View style={[styles.header, { paddingTop: topPadding }]}>
      {step !== "success" ? (
        <Pressable onPress={handleBack} style={styles.backBtn} testID="kyc-back">
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
      <Text style={styles.headerTitle}>Aadhaar eKYC</Text>
      <View style={{ width: 44 }} />
    </View>
  );

  if (step === "success") {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.centered}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.successLight }]}>
            <Ionicons name="shield-checkmark" size={44} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>KYC Verified!</Text>
          <Text style={styles.successText}>
            Your Aadhaar eKYC is complete. Your AEPS merchant account is now active.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.back()}
            testID="kyc-done-btn"
          >
            <Text style={styles.primaryBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Header />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.stepIndicator}>
          <View style={[styles.stepDot, step === "aadhaar" && styles.stepDotActive]} />
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, step === "otp" && styles.stepDotActive]} />
        </View>

        {step === "aadhaar" ? (
          <>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="card-account-details-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.stepTitle}>Enter Aadhaar Number</Text>
            <Text style={styles.stepSubtitle}>
              An OTP will be sent to your Aadhaar-linked mobile number for verification.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Aadhaar Number</Text>
              <TextInput
                style={styles.input}
                value={aadhaarNumber}
                onChangeText={(t) => {
                  setAadhaarNumber(t.replace(/\D/g, "").slice(0, 12));
                  setSendOtpError(null);
                }}
                placeholder="Enter 12-digit Aadhaar"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="number-pad"
                maxLength={12}
                testID="aadhaar-input"
                returnKeyType="done"
                onSubmitEditing={handleSendOtp}
              />
              <Text style={styles.inputHint}>
                {aadhaarNumber.length}/12 digits
              </Text>
            </View>

            {sendOtpError && (
              <View style={[styles.errorBox, sendOtpError.retryable ? styles.errorBoxWarning : styles.errorBoxFatal]}>
                <Ionicons
                  name={sendOtpError.retryable ? "warning-outline" : "close-circle-outline"}
                  size={18}
                  color={sendOtpError.retryable ? Colors.warning : Colors.error}
                />
                <Text style={[styles.errorText, !sendOtpError.retryable && styles.errorTextFatal]}>
                  {sendOtpError.message}
                </Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && { opacity: 0.85 },
                (loading || aadhaarNumber.replace(/\s/g, "").length !== 12) && styles.btnDisabled,
              ]}
              onPress={handleSendOtp}
              disabled={loading || aadhaarNumber.replace(/\s/g, "").length !== 12}
              testID="send-otp-btn"
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>Send OTP</Text>
              )}
            </Pressable>

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.infoText}>
                Your Aadhaar number is sent securely to UIDAI via PaySprint and is never stored by this app.
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.iconCircle}>
              <Ionicons name="keypad-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.stepTitle}>Enter OTP</Text>
            <Text style={styles.stepSubtitle}>
              An OTP has been sent to the mobile number linked with Aadhaar {maskedAadhaar}.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>OTP</Text>
              <TextInput
                ref={otpInputRef}
                style={[styles.input, styles.otpInput, otpError && !otpError.retryable && styles.inputError]}
                value={otp}
                onChangeText={(t) => {
                  setOtp(t.replace(/\D/g, "").slice(0, 8));
                  if (otpError?.retryable) setOtpError(null);
                }}
                placeholder="Enter OTP"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="number-pad"
                maxLength={8}
                testID="otp-input"
                returnKeyType="done"
                onSubmitEditing={handleVerifyOtp}
                secureTextEntry={false}
                editable={!otpError || otpError.retryable}
              />
            </View>

            {otpError && (
              <View style={[styles.errorBox, otpError.retryable ? styles.errorBoxWarning : styles.errorBoxFatal]}>
                <Ionicons
                  name={otpError.retryable ? "warning-outline" : "close-circle-outline"}
                  size={18}
                  color={otpError.retryable ? Colors.warning : Colors.error}
                />
                <View style={styles.errorContent}>
                  <Text style={[styles.errorText, !otpError.retryable && styles.errorTextFatal]}>
                    {otpError.message}
                  </Text>
                  {!otpError.retryable && (
                    <Pressable
                      style={styles.startOverBtn}
                      onPress={handleStartOver}
                      testID="start-over-btn"
                    >
                      <Ionicons name="refresh" size={14} color={Colors.primary} />
                      <Text style={styles.startOverText}>Start over with new Aadhaar</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && { opacity: 0.85 },
                (loading || otp.length < 4 || (!!otpError && !otpError.retryable)) && styles.btnDisabled,
              ]}
              onPress={handleVerifyOtp}
              disabled={loading || otp.length < 4 || (!!otpError && !otpError.retryable)}
              testID="verify-otp-btn"
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify OTP</Text>
              )}
            </Pressable>

            <Pressable style={styles.resendLink} onPress={handleResendOtp} testID="resend-otp-btn">
              <Text style={styles.resendLinkText}>Didn't receive OTP? Resend</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    alignItems: "center",
    gap: 20,
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    marginBottom: 8,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.border,
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stepLine: {
    width: 48,
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: 6,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  stepSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  inputGroup: {
    width: "100%",
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  input: {
    width: "100%",
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  inputError: {
    borderColor: Colors.error,
  },
  otpInput: {
    letterSpacing: 4,
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  inputHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    textAlign: "right",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    padding: 14,
    width: "100%",
    borderWidth: 1,
  },
  errorBoxWarning: {
    backgroundColor: Colors.warningLight,
    borderColor: Colors.warning + "60",
  },
  errorBoxFatal: {
    backgroundColor: Colors.errorLight ?? "#FEF2F2",
    borderColor: Colors.error + "60",
  },
  errorContent: {
    flex: 1,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.warning,
    lineHeight: 18,
  },
  errorTextFatal: {
    color: Colors.error,
  },
  startOverBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  startOverText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  primaryBtn: {
    width: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  resendLink: {
    paddingVertical: 8,
  },
  resendLinkText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.primary,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  successTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.success,
    textAlign: "center",
  },
  successText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
