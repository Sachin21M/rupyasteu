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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { sendOtp } from "@/lib/api";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

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
          contentContainerStyle={styles.scrollContent}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={["#2E9E5B", "#25844C", "#1E6F44"]}
            style={[styles.heroBanner, { paddingTop: topPadding + 24 }]}
          >
            <View style={styles.logoCircleWrap}>
              <Image
                source={require("@/assets/images/rupyasetu-icon-circle.png")}
                style={styles.logoCircle}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.heroAppName}>RupyaSetu</Text>
            <Text style={styles.heroSubtitle}>Recharge. Banking. Done.</Text>

            <View style={styles.serviceCards}>
              <View style={styles.serviceCard}>
                <View style={styles.serviceIconWrap}>
                  <Ionicons name="phone-portrait" size={22} color="#2E9E5B" />
                </View>
                <Text style={styles.serviceLabel}>Mobile</Text>
              </View>
              <View style={styles.serviceCard}>
                <View style={styles.serviceIconWrap}>
                  <MaterialCommunityIcons name="television" size={22} color="#2E9E5B" />
                </View>
                <Text style={styles.serviceLabel}>DTH</Text>
              </View>
              <View style={styles.serviceCard}>
                <View style={styles.serviceIconWrap}>
                  <MaterialCommunityIcons name="fingerprint" size={22} color="#2E9E5B" />
                </View>
                <Text style={styles.serviceLabel}>AEPS</Text>
              </View>
              <View style={styles.serviceCard}>
                <View style={styles.serviceIconWrap}>
                  <Ionicons name="shield-checkmark" size={22} color="#2E9E5B" />
                </View>
                <Text style={styles.serviceLabel}>Secure</Text>
              </View>
            </View>

            <View style={styles.heroCurve} />
          </LinearGradient>

          <Animated.View
            style={[
              styles.formSection,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <Text style={styles.headline}>
              India's Fastest Recharge{"\n"}& Banking Platform
            </Text>

            <Text style={styles.subLabel}>Log in or sign up</Text>

            <View
              style={[
                styles.inputRow,
                focused && styles.inputRowFocused,
                !!error && styles.inputRowError,
              ]}
            >
              <Text style={styles.flag}>🇮🇳</Text>
              <Text style={styles.prefix}>+91</Text>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Enter Phone Number"
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

            <View
              style={[
                styles.footer,
                { paddingBottom: bottomPadding || 16 },
              ]}
            >
              <Text style={styles.legalText}>
                By continuing, you agree to our{" "}
                <Text style={styles.legalLink}>Terms of Service</Text>
                {"  "}
                <Text style={styles.legalLink}>Privacy Policy</Text>.
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
  heroBanner: {
    paddingBottom: 0,
    position: "relative",
    overflow: "hidden",
  },
  logoCircleWrap: {
    alignItems: "center",
    marginBottom: 8,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
  },
  heroAppName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 2,
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    marginBottom: 28,
  },
  serviceCards: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 36,
  },
  serviceCard: {
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  serviceIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.9)",
  },
  heroCurve: {
    height: 28,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -1,
  },
  formSection: {
    paddingHorizontal: 24,
    backgroundColor: "#FFFFFF",
  },
  headline: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#1A1D26",
    textAlign: "center",
    lineHeight: 34,
    marginBottom: 24,
  },
  subLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 16,
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
    paddingHorizontal: 14,
  },
  inputRowFocused: {
    borderColor: "#2E9E5B",
    backgroundColor: "#FFFFFF",
  },
  inputRowError: {
    borderColor: "#EF4444",
  },
  flag: {
    fontSize: 20,
    marginRight: 8,
  },
  prefix: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#1A1D26",
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#1A1D26",
    letterSpacing: 0.5,
    height: "100%",
  },
  clearBtn: {
    paddingLeft: 10,
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
    marginBottom: 20,
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
    alignItems: "center",
    paddingTop: 4,
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
