import { View, Text, Pressable, StyleSheet, ScrollView, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export default function AepsResultScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    success: string;
    type: string;
    label: string;
    message: string;
    balance: string;
    referenceNo: string;
    miniStatement: string;
    amount: string;
    bankName: string;
    aadhaarMasked: string;
  }>();

  const isSuccess = params.success === "1";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  let miniStatementData: Array<{ date: string; txnType: string; amount: string; narration: string }> = [];
  try {
    if (params.miniStatement) {
      miniStatementData = JSON.parse(params.miniStatement);
    }
  } catch {}

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: (bottomPadding || 24) + 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.topSection, { paddingTop: topPadding + 30 }]}>
        <View style={[styles.statusCircle, { backgroundColor: isSuccess ? Colors.successLight : Colors.errorLight }]}>
          <Ionicons
            name={isSuccess ? "checkmark-circle" : "close-circle"}
            size={64}
            color={isSuccess ? Colors.success : Colors.error}
          />
        </View>
        <Text style={[styles.statusText, { color: isSuccess ? Colors.success : Colors.error }]}>
          {isSuccess ? "Transaction Successful" : "Transaction Failed"}
        </Text>
        <Text style={styles.statusMessage}>{params.message || (isSuccess ? "Your AEPS transaction was completed" : "Please try again")}</Text>
      </View>

      {params.balance && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>₹{params.balance}</Text>
        </View>
      )}

      <View style={styles.detailsCard}>
        <Text style={styles.detailsTitle}>Transaction Details</Text>
        <DetailRow label="Service" value={params.label || params.type} />
        <DetailRow label="Aadhaar" value={params.aadhaarMasked || "—"} />
        <DetailRow label="Bank" value={params.bankName || "—"} />
        {parseInt(params.amount || "0") > 0 && <DetailRow label="Amount" value={`₹${params.amount}`} />}
        <DetailRow label="Reference" value={params.referenceNo || "—"} />
        <DetailRow label="Status" value={isSuccess ? "Success" : "Failed"} valueColor={isSuccess ? Colors.success : Colors.error} />
      </View>

      {miniStatementData.length > 0 && (
        <View style={styles.miniStatementCard}>
          <Text style={styles.detailsTitle}>Mini Statement</Text>
          <View style={styles.miniStatementHeader}>
            <Text style={[styles.miniStatementCol, { flex: 1 }]}>Date</Text>
            <Text style={[styles.miniStatementCol, { width: 40, textAlign: "center" }]}>Type</Text>
            <Text style={[styles.miniStatementCol, { width: 80, textAlign: "right" }]}>Amount</Text>
          </View>
          {miniStatementData.map((item, index) => (
            <View key={index} style={styles.miniStatementRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.miniDate}>{item.date}</Text>
                <Text style={styles.miniNarration}>{item.narration}</Text>
              </View>
              <View style={[styles.miniTypeBadge, { backgroundColor: item.txnType === "CR" ? Colors.successLight : Colors.errorLight }]}>
                <Text style={[styles.miniTypeText, { color: item.txnType === "CR" ? Colors.success : Colors.error }]}>
                  {item.txnType}
                </Text>
              </View>
              <Text style={[styles.miniAmount, { color: item.txnType === "CR" ? Colors.success : Colors.error }]}>
                ₹{item.amount}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.88 }]}
          onPress={() => router.replace("/aeps")}
        >
          <MaterialCommunityIcons name="fingerprint" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>New Transaction</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.88 }]}
          onPress={() => router.replace("/(tabs)")}
        >
          <Ionicons name="home" size={20} color={Colors.primary} />
          <Text style={styles.secondaryBtnText}>Go Home</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topSection: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  statusCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  statusText: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  statusMessage: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  balanceCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.primaryLight,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  balanceLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
  detailsCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  detailsTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    maxWidth: "60%",
    textAlign: "right",
  },
  miniStatementCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  miniStatementHeader: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 4,
  },
  miniStatementCol: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textTertiary,
    textTransform: "uppercase",
  },
  miniStatementRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 10,
  },
  miniDate: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  miniNarration: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    marginTop: 2,
  },
  miniTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  miniTypeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  miniAmount: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    width: 80,
    textAlign: "right",
  },
  actions: {
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 8,
  },
  primaryBtn: {
    height: 54,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  secondaryBtn: {
    height: 54,
    backgroundColor: Colors.primaryLight,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
});
