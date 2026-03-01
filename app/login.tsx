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
  ScrollView,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { sendOtp } from "@/lib/api";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
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
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: topPadding, paddingBottom: bottomPadding || 16 },
          ]}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.content,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.logoArea}>
              <Image
                source={require("@/assets/images/rupyasetu-login-logo.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <View style={styles.formArea}>
              <Text style={styles.heading}>Get started</Text>
              <Text style={styles.subtext}>
                Enter your mobile number to continue
              </Text>

              <View
                style={[
                  styles.inputRow,
                  focused && styles.inputRowFocused,
                  !!error && styles.inputRowError,
                ]}
              >
                <Text style={styles.prefix}>+91</Text>
                <View style={styles.divider} />
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#B0B7C3"
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
                    hitSlop={10}
                    style={styles.clearBtn}
                  >
                    <Ionicons name="close-circle" size={18} color="#B0B7C3" />
                  </Pressable>
                )}
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                style={({ pressed }) => [
                  styles.cta,
                  !isValidPhone && styles.ctaDisabled,
                  pressed &&
                    isValidPhone && {
                      opacity: 0.88,
                      transform: [{ scale: 0.988 }],
                    },
                ]}
                onPress={handleSendOtp}
                disabled={!isValidPhone || loading}
                testID="send-otp-button"
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.ctaText}>Continue</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.footer}>
              <Text style={styles.legalText}>
                By continuing, you agree to our{" "}
                <Text style={styles.legalLink}>Terms</Text> &{" "}
                <Text style={styles.legalLink}>Privacy Policy</Text>
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  logoArea: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 28,
  },
  logo: {
    width: 180,
    height: 144,
  },
  formArea: {},
  heading: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#1A1D26",
    marginBottom: 6,
  },
  subtext: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginBottom: 24,
    lineHeight: 22,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 54,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    marginBottom: 16,
  },
  inputRowFocused: {
    borderColor: "#2E9E5B",
    backgroundColor: "#FFFFFF",
  },
  inputRowError: {
    borderColor: "#EF4444",
  },
  prefix: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#1A1D26",
    paddingLeft: 16,
    paddingRight: 12,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: "#E5E7EB",
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#1A1D26",
    letterSpacing: 1,
    height: "100%",
    paddingRight: 8,
  },
  clearBtn: {
    paddingHorizontal: 14,
    justifyContent: "center",
    height: "100%",
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#EF4444",
    marginTop: -8,
    marginBottom: 12,
  },
  cta: {
    height: 54,
    backgroundColor: "#2E9E5B",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  footer: {
    marginTop: "auto",
    paddingTop: 20,
    paddingBottom: 8,
    alignItems: "center",
  },
  legalText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
    textAlign: "center",
  },
  legalLink: {
    color: "#2E9E5B",
    fontFamily: "Inter_500Medium",
  },
});
