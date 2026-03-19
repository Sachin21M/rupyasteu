import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getAepsMerchant } from "@/lib/api";

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
];

export default function AepsServicesScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [merchantStatus, setMerchantStatus] = useState<{
    onboarded: boolean;
    dailyAuthenticated: boolean;
  } | null>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    checkMerchantStatus();
  }, []);

  async function checkMerchantStatus() {
    try {
      const result = await getAepsMerchant();
      setMerchantStatus({
        onboarded: result.onboarded || false,
        dailyAuthenticated: result.dailyAuthenticated || false,
      });
    } catch {
      setMerchantStatus({ onboarded: false, dailyAuthenticated: false });
    } finally {
      setLoading(false);
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Service</Text>
        <View style={styles.servicesGrid}>
          {AEPS_SERVICES.map((service) => (
            <Pressable
              key={service.id}
              style={({ pressed }) => [styles.serviceCard, pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 }]}
              onPress={() => handleServicePress(service)}
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
    marginBottom: 24,
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
