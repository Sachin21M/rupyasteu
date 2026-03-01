import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { sendOtp } from "@/lib/api";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<TextInput>(null);

  const isValidPhone = /^[6-9]\d{9}$/.test(phone);

  async function handleSendOtp() {
    if (!isValidPhone) return;
    setError("");
    setLoading(true);
    try {
      const result = await sendOtp(phone);
      if (result.success) {
        router.push({ pathname: "/otp", params: { phone } });
      } else {
        setError(result.error || "Failed to send OTP");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom + 16;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={["#27AE60", Colors.primary, Colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.topSection, { paddingTop: topPadding + 48 }]}
        >
          <View style={styles.logoContainer}>
            <Image
              source={require("@/assets/images/rupyasetu-logo-white.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>Fast & Secure Recharge</Text>
          </View>
          <View style={styles.curveOverlay} />
        </LinearGradient>

        <View style={styles.formSection}>
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Login / Sign Up</Text>
            <Text style={styles.formSubtitle}>
              Enter your mobile number to continue
            </Text>

            <View
              style={[
                styles.phoneInputContainer,
                phone.length > 0 && styles.phoneInputActive,
              ]}
            >
              <View style={styles.countryCode}>
                <Text style={styles.countryCodeText}>+91</Text>
              </View>
              <TextInput
                ref={inputRef}
                style={styles.phoneInput}
                placeholder="Enter mobile number"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={(text) => {
                  setPhone(text.replace(/[^0-9]/g, ""));
                  setError("");
                }}
                testID="phone-input"
              />
              {phone.length > 0 && (
                <Pressable
                  onPress={() => setPhone("")}
                  style={styles.clearButton}
                  hitSlop={8}
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={Colors.textTertiary}
                  />
                </Pressable>
              )}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.sendOtpButton,
                !isValidPhone && styles.sendOtpButtonDisabled,
                pressed && isValidPhone && styles.sendOtpButtonPressed,
              ]}
              onPress={handleSendOtp}
              disabled={!isValidPhone || loading}
              testID="send-otp-button"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.buttonContent}>
                  <Text style={styles.sendOtpText}>Get OTP</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </View>
              )}
            </Pressable>

            <Text style={styles.termsText}>
              By continuing, you agree to our{" "}
              <Text style={styles.termsLink}>Terms of Service</Text> &{" "}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: bottomPadding }]}>
          <View style={styles.footerBadge}>
            <Ionicons
              name="shield-checkmark"
              size={14}
              color={Colors.primary}
            />
            <Text style={styles.footerText}>100% Safe & Secure</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  topSection: {
    paddingBottom: 72,
    position: "relative",
    overflow: "hidden",
  },
  curveOverlay: {
    position: "absolute",
    bottom: -1,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  logoContainer: {
    alignItems: "center",
    gap: 12,
  },
  logoImage: {
    width: 160,
    height: 128,
  },
  tagline: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 0.5,
  },
  formSection: {
    marginTop: -20,
    paddingHorizontal: 24,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  formTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 6,
  },
  formSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 28,
  },
  phoneInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 20,
    backgroundColor: Colors.background,
  },
  phoneInputActive: {
    borderColor: Colors.primary,
  },
  countryCode: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  countryCodeText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    letterSpacing: 1.5,
  },
  clearButton: {
    paddingHorizontal: 14,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.error,
    marginBottom: 12,
    marginTop: -8,
  },
  sendOtpButton: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sendOtpButtonDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
    elevation: 0,
  },
  sendOtpButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sendOtpText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.5,
  },
  termsText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    textAlign: "center",
    lineHeight: 18,
  },
  termsLink: {
    color: Colors.primary,
    fontFamily: "Inter_500Medium",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: "auto",
    paddingTop: 24,
  },
  footerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  footerText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
});
