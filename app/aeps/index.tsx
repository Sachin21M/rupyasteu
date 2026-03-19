import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getAepsMerchant, aepsOnboard, aeps2faAuthenticate, aepsOnboardComplete } from "@/lib/api";

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
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    checkMerchantStatus();
  }, []);

  const checkMerchantStatus = useCallback(async () => {
    try {
      const result = await getAepsMerchant();
      setOnboarded(result.onboarded || false);
      setDailyAuthenticated(result.dailyAuthenticated || false);
      setKycStatus(result.merchant?.kycStatus || "NOT_STARTED");
    } catch {
      setOnboarded(false);
      setDailyAuthenticated(false);
      setKycStatus("NOT_STARTED");
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleStartOnboarding() {
    if (!merchantCode.trim()) {
      Alert.alert("Required", "Please enter your merchant code");
      return;
    }
    setOnboardingLoading(true);
    try {
      const result = await aepsOnboard(merchantCode.trim());
      if (result.success && result.redirectUrl) {
        setKycStatus("PENDING");
        try {
          await Linking.openURL(result.redirectUrl);
        } catch {
          Alert.alert(
            "Complete KYC",
            "Please open this URL to complete verification:\n\n" + result.redirectUrl + "\n\nAfter completing, tap 'I Completed KYC' below."
          );
        }
      } else {
        Alert.alert("Error", result.error || "Failed to start onboarding");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Onboarding failed");
    } finally {
      setOnboardingLoading(false);
    }
  }

  async function handleCompleteKyc() {
    setOnboardingLoading(true);
    try {
      const result = await aepsOnboardComplete({ status: "success", merchantCode: merchantCode.trim() || undefined });
      if (result.success) {
        setOnboarded(true);
        setKycStatus("COMPLETED");
        Alert.alert("Success", "Merchant onboarding completed successfully!");
      } else {
        Alert.alert("Error", "KYC verification not yet complete. Please try again after completing verification.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to verify KYC");
    } finally {
      setOnboardingLoading(false);
    }
  }

  async function handleDailyAuth() {
    setAuthLoading(true);
    try {
      let biometricXml = "";
      if (Platform.OS === "web") {
        biometricXml = `<PidData><Resp errCode="0" fCount="1" fType="2" iCount="0" pCount="0" errInfo="Success" /><DeviceInfo dpId="MANTRA.MSIPL" rdsId="MANTRA.WIN.001" rdsVer="1.0.8" mi="MFS100" mc="MIIEGDCCAwCgAwIBAgIEA" dc="2f196bbc-e2f8-4018-87a9-9b58eb" /><Skey ci="20250101">AUTH_SKEY</Skey><Hmac>AUTH_HMAC</Hmac><Data type="X">AUTH_BIOMETRIC_DATA</Data></PidData>`;
      } else {
        Alert.alert("Biometric Required", "Please connect a UIDAI-certified fingerprint/iris scanner to perform daily authentication.");
        setAuthLoading(false);
        return;
      }

      const result = await aeps2faAuthenticate({
        data: biometricXml,
        latitude: "0.0",
        longitude: "0.0",
      });
      if (result.success) {
        setDailyAuthenticated(true);
        Alert.alert("Authenticated", "Daily 2FA authentication completed. You can now perform AEPS transactions.");
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
                <View style={styles.merchantCodeInput}>
                  <TextInput
                    style={styles.mcInput}
                    placeholder="Enter Merchant Code"
                    placeholderTextColor={Colors.textTertiary}
                    value={merchantCode}
                    onChangeText={setMerchantCode}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    style={[styles.setupBtn, onboardingLoading && { opacity: 0.6 }]}
                    onPress={kycStatus === "PENDING" ? handleCompleteKyc : handleStartOnboarding}
                    disabled={onboardingLoading}
                  >
                    {onboardingLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.setupBtnText}>
                        {kycStatus === "PENDING" ? "I Completed KYC" : "Start Onboarding"}
                      </Text>
                    )}
                  </Pressable>
                </View>
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
            <Pressable
              style={[styles.setupBtn, { backgroundColor: "#6366F1" }, authLoading && { opacity: 0.6 }]}
              onPress={handleDailyAuth}
              disabled={authLoading}
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
  merchantCodeInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    justifyContent: "center",
  },
  mcInput: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    height: "100%",
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
