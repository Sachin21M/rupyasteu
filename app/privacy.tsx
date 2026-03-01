import { View, Text, ScrollView, StyleSheet, Platform, Pressable } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const sections = [
  {
    title: "Data Collection",
    icon: "folder-open-outline",
    content:
      "We collect only the information necessary to process your recharges — your phone number, transaction details, and UTR references. We do not collect contacts, photos, or location data.",
  },
  {
    title: "Data Security",
    icon: "lock-closed-outline",
    content:
      "All data is encrypted in transit using TLS. Your payment information is never stored on our servers. OTP codes expire within 5 minutes and are deleted after verification.",
  },
  {
    title: "Information Sharing",
    icon: "people-outline",
    content:
      "We share your recharge details only with the necessary telecom operators (via Paysprint) to complete your transactions. We do not sell your data to third parties.",
  },
  {
    title: "Account Security",
    icon: "shield-checkmark-outline",
    content:
      "Your account is protected with OTP-based authentication. Sessions are secured with JWT tokens that expire after 7 days. You can log out at any time to invalidate your session.",
  },
  {
    title: "Your Rights",
    icon: "hand-left-outline",
    content:
      "You can request deletion of your account and all associated data at any time by contacting our support team. We will process your request within 48 hours.",
  },
];

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.banner}>
          <Ionicons name="shield-checkmark" size={32} color={Colors.primary} />
          <Text style={styles.bannerText}>Your data is protected</Text>
          <Text style={styles.bannerSub}>We take your privacy seriously</Text>
        </View>

        {sections.map((section, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name={section.icon as any} size={20} color={Colors.primary} />
              <Text style={styles.cardTitle}>{section.title}</Text>
            </View>
            <Text style={styles.cardContent}>{section.content}</Text>
          </View>
        ))}

        <Text style={styles.footer}>Last updated: March 2026</Text>
      </ScrollView>
    </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  banner: {
    alignItems: "center",
    backgroundColor: Colors.primaryLighter,
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    gap: 6,
  },
  bannerText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
  bannerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  cardContent: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    marginTop: 8,
  },
});
