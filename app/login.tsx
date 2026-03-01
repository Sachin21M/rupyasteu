import { useState, useRef, useEffect } from "react";
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
  Animated,
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
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const sheetAnim = useRef(new Animated.Value(60)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(sheetOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(sheetAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

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
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <LinearGradient
      colors={["#2E9E5B", "#1E6F44"]}
      style={styles.gradient}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.topSection, { paddingTop: topPadding + 60 }]}>
          <Animated.View
            style={[
              styles.logoContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Image
              source={require("@/assets/images/rupyasetu-logo-white.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>Recharge. Relax. Done.</Text>
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.bottomSheet,
            {
              paddingBottom: bottomPadding > 0 ? bottomPadding : 24,
              opacity: sheetOpacity,
              transform: [{ translateY: sheetAnim }],
            },
          ]}
        >
          <Text style={styles.heading}>Welcome to RupyaSetu</Text>
          <Text style={styles.subtext}>
            Enter your mobile number to continue
          </Text>

          <View
            style={[
              styles.inputContainer,
              focused && styles.inputContainerFocused,
              error ? styles.inputContainerError : null,
            ]}
          >
            <View style={styles.countryCode}>
              <Text style={styles.countryCodeText}>+91</Text>
            </View>
            <View style={styles.inputDivider} />
            <TextInput
              ref={inputRef}
              style={styles.phoneInput}
              placeholder="Enter mobile number"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
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
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              !isValidPhone && styles.primaryButtonDisabled,
              pressed && isValidPhone && { opacity: 0.85, transform: [{ scale: 0.985 }] },
            ]}
            onPress={handleSendOtp}
            disabled={!isValidPhone || loading}
            testID="send-otp-button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Get OTP</Text>
            )}
          </Pressable>

          <Text style={styles.legalText}>
            By continuing, you agree to our{" "}
            <Text style={styles.legalLink}>Terms</Text> &{" "}
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Text>
        </Animated.View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  topSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: "center",
  },
  logoImage: {
    width: 140,
    height: 112,
    marginBottom: 16,
  },
  tagline: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.3,
  },
  bottomSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  heading: {
    fontSize: 24,
    fontFamily: "Inter_600SemiBold",
    color: "#1A1D26",
    marginBottom: 6,
  },
  subtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginBottom: 28,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    backgroundColor: "#FAFAFA",
    marginBottom: 20,
    height: 54,
  },
  inputContainerFocused: {
    borderColor: "#2E9E5B",
    backgroundColor: "#FFFFFF",
  },
  inputContainerError: {
    borderColor: "#EF4444",
  },
  countryCode: {
    paddingHorizontal: 16,
    justifyContent: "center",
    height: "100%",
  },
  countryCodeText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#1A1D26",
  },
  inputDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#E5E7EB",
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#1A1D26",
    letterSpacing: 1,
    height: "100%",
  },
  clearButton: {
    paddingHorizontal: 14,
    justifyContent: "center",
    height: "100%",
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#EF4444",
    marginTop: -12,
    marginBottom: 12,
  },
  primaryButton: {
    height: 54,
    backgroundColor: "#2E9E5B",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#2E9E5B",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  legalText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 18,
    paddingBottom: 4,
  },
  legalLink: {
    color: "#2E9E5B",
    fontFamily: "Inter_500Medium",
  },
});
