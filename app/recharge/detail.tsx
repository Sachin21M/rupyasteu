import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { getTransaction } from "@/lib/api";
import type { Transaction } from "@/shared/schema";

function statusConfig(tx: Transaction) {
  const isSuccess = tx.rechargeStatus === "RECHARGE_SUCCESS";
  const isFailed = tx.rechargeStatus === "RECHARGE_FAILED";
  const isAwaiting =
    tx.paymentStatus === "PAYMENT_UNVERIFIED" &&
    tx.rechargeStatus === "RECHARGE_PENDING";
  if (isSuccess)
    return {
      icon: "checkmark-circle" as const,
      color: Colors.success,
      bg: Colors.successLight,
      label: "Recharge Successful",
      rechargeLabel: "Success",
    };
  if (isFailed)
    return {
      icon: "close-circle" as const,
      color: Colors.error,
      bg: Colors.errorLight,
      label: "Recharge Failed",
      rechargeLabel: "Failed",
    };
  if (isAwaiting)
    return {
      icon: "time" as const,
      color: "#f59e0b",
      bg: "#fef3c7",
      label: "Payment Under Review",
      rechargeLabel: "Pending",
    };
  return {
    icon: "sync" as const,
    color: Colors.warning,
    bg: Colors.warningLight,
    label: "Processing",
    rechargeLabel: "Processing",
  };
}

function paymentStatusColor(status: string) {
  switch (status) {
    case "PAYMENT_VERIFIED":
    case "WALLET_PAYMENT":
      return { bg: Colors.successLight, color: Colors.success };
    case "PAYMENT_UNVERIFIED":
    case "PAYMENT_PENDING":
      return { bg: Colors.warningLight, color: Colors.warning };
    default:
      return { bg: Colors.errorLight, color: Colors.error };
  }
}

function paymentStatusLabel(status: string) {
  switch (status) {
    case "PAYMENT_VERIFIED": return "Verified";
    case "PAYMENT_UNVERIFIED": return "Unverified";
    case "PAYMENT_PENDING": return "Pending";
    case "PAYMENT_FAILED": return "Failed";
    case "WALLET_PAYMENT": return "Wallet";
    default: return status.replace("PAYMENT_", "");
  }
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailValue, valueColor ? { color: valueColor } : undefined]} numberOfLines={2}>
          {value}
        </Text>
      </View>
      <View style={styles.divider} />
    </>
  );
}

export default function RechargeDetailScreen() {
  const insets = useSafeAreaInsets();
  const { transactionId } = useLocalSearchParams<{ transactionId: string }>();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!transactionId) {
      setLoading(false);
      return;
    }
    loadTransaction();
  }, []);

  async function loadTransaction() {
    try {
      const result = await getTransaction(transactionId!);
      setTransaction(result.transaction);
    } catch {
      Alert.alert("Error", "Could not load recharge details. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: topPadding }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: topPadding }]}>
        <Ionicons name="alert-circle-outline" size={52} color={Colors.error} />
        <Text style={styles.errorText}>Recharge not found</Text>
        <Pressable style={styles.goBackBtn} onPress={() => router.back()}>
          <Text style={styles.goBackBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const config = statusConfig(transaction);
  const isFailed = transaction.rechargeStatus === "RECHARGE_FAILED";
  const isMobile = transaction.type === "MOBILE";

  const date = new Date(transaction.createdAt);
  const formattedDate = `${date.getDate()} ${date.toLocaleDateString("en-IN", {
    month: "short",
  })} ${date.getFullYear()}, ${date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  const paymentColors = paymentStatusColor(transaction.paymentStatus);
  const paymentLabel = paymentStatusLabel(transaction.paymentStatus);

  function handleRetry() {
    router.push({
      pathname: "/recharge/plans",
      params: {
        operatorId: transaction!.operatorId,
        operatorName: transaction!.operatorName,
        subscriberNumber: transaction!.subscriberNumber,
        type: transaction!.type,
      },
    });
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Pressable
          testID="recharge-detail-back"
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Recharge Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 },
        ]}
      >
        <Animated.View entering={FadeIn.duration(300)} style={[styles.statusBanner, { backgroundColor: config.bg }]}>
          <Ionicons name={config.icon} size={40} color={config.color} />
          <Text style={[styles.statusBannerLabel, { color: config.color }]}>{config.label}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).duration(300)} style={styles.card}>
          <Text style={styles.cardTitle}>Recharge Info</Text>

          <DetailRow label="Type" value={isMobile ? "Mobile Recharge" : "DTH Recharge"} />
          <DetailRow label="Operator" value={transaction.operatorName} />
          <DetailRow label={isMobile ? "Mobile Number" : "Subscriber ID"} value={transaction.subscriberNumber} />
          {transaction.planDescription ? (
            <DetailRow label="Plan" value={transaction.planDescription} />
          ) : null}
          <DetailRow label="Amount" value={`₹${transaction.amount}`} />
          <DetailRow label="Date & Time" value={formattedDate} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Recharge Status</Text>
            <View style={[styles.statusPill, { backgroundColor: config.bg }]}>
              <Text style={[styles.statusPillText, { color: config.color }]}>{config.rechargeLabel}</Text>
            </View>
          </View>
          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Payment Status</Text>
            <View style={[styles.statusPill, { backgroundColor: paymentColors.bg }]}>
              <Text style={[styles.statusPillText, { color: paymentColors.color }]}>{paymentLabel}</Text>
            </View>
          </View>

          {(transaction.utr || transaction.paysprintRefId) && (
            <View style={styles.divider} />
          )}

          {transaction.utr ? (
            <DetailRow label="UTR" value={transaction.utr} />
          ) : null}

          {transaction.paysprintRefId ? (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Reference ID</Text>
                <Text style={[styles.detailValue, styles.refIdText]}>{transaction.paysprintRefId}</Text>
              </View>
            </>
          ) : null}
        </Animated.View>

        {isFailed && (
          <Animated.View entering={FadeInDown.delay(200).duration(300)} style={styles.retrySection}>
            <View style={styles.retryInfo}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.retryInfoText}>
                This recharge failed. You can retry with the same number and operator.
              </Text>
            </View>
            <Pressable
              testID="retry-recharge-btn"
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
              onPress={handleRetry}
            >
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.retryBtnText}>Retry Recharge</Text>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 16,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    padding: 20,
  },
  statusBannerLabel: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    marginBottom: 16,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    maxWidth: "60%",
    textAlign: "right",
  },
  refIdText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 6,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  retrySection: {
    gap: 14,
  },
  retryInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
  },
  retryInfoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  retryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  errorText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  goBackBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  goBackBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
