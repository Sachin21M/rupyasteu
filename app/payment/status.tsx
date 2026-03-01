import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, BounceIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { getTransaction } from "@/lib/api";
import type { Transaction } from "@/shared/schema";

export default function StatusScreen() {
  const insets = useSafeAreaInsets();
  const { transactionId } = useLocalSearchParams<{ transactionId: string }>();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTransaction();
  }, []);

  async function loadTransaction() {
    try {
      const result = await getTransaction(transactionId!);
      setTransaction(result.transaction);
    } catch (error) {
      console.error("Failed to load transaction:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="alert-circle" size={48} color={Colors.error} />
        <Text style={styles.errorText}>Transaction not found</Text>
        <Pressable style={styles.homeBtn} onPress={() => router.replace("/(tabs)")}>
          <Text style={styles.homeBtnText}>Go Home</Text>
        </Pressable>
      </View>
    );
  }

  const isSuccess = transaction.rechargeStatus === "RECHARGE_SUCCESS";
  const isFailed = transaction.rechargeStatus === "RECHARGE_FAILED";
  const isAwaitingApproval = transaction.paymentStatus === "PAYMENT_UNVERIFIED" && transaction.rechargeStatus === "RECHARGE_PENDING";
  const isProcessing = transaction.rechargeStatus === "RECHARGE_PROCESSING";

  const statusConfig = isSuccess
    ? { icon: "checkmark-circle" as const, color: Colors.success, bg: Colors.successLight, label: "Recharge Successful", sublabel: "Your recharge has been processed successfully" }
    : isFailed
    ? { icon: "close-circle" as const, color: Colors.error, bg: Colors.errorLight, label: "Recharge Failed", sublabel: "Something went wrong. Please try again or contact support" }
    : isAwaitingApproval
    ? { icon: "time" as const, color: "#f59e0b", bg: "#fef3c7", label: "Payment Under Processing", sublabel: "Your payment is being verified. It will be confirmed within 24 hours." }
    : { icon: "sync" as const, color: Colors.warning, bg: Colors.warningLight, label: "Processing", sublabel: "Your recharge is being processed. This may take a few moments" };

  const date = new Date(transaction.createdAt);
  const formattedDate = `${date.getDate()} ${date.toLocaleDateString("en-IN", { month: "short" })} ${date.getFullYear()}, ${date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { paddingTop: topPadding + 20 }]}>
      <View style={styles.statusSection}>
        <Animated.View
          entering={BounceIn.delay(200)}
          style={[styles.statusCircle, { backgroundColor: statusConfig.bg }]}
        >
          <Ionicons name={statusConfig.icon} size={64} color={statusConfig.color} />
        </Animated.View>

        <Animated.View entering={FadeIn.delay(400)} style={styles.statusTextContainer}>
          <Text style={[styles.statusLabel, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
          <Text style={styles.statusSublabel}>{statusConfig.sublabel}</Text>
        </Animated.View>
      </View>

      <Animated.View entering={FadeIn.delay(600)} style={styles.detailsCard}>
        <Text style={styles.detailsTitle}>Transaction Details</Text>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Amount</Text>
          <Text style={styles.detailValue}>₹{transaction.amount}</Text>
        </View>

        <View style={styles.detailDivider} />

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Operator</Text>
          <Text style={styles.detailValue}>{transaction.operatorName}</Text>
        </View>

        <View style={styles.detailDivider} />

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Number</Text>
          <Text style={styles.detailValue}>{transaction.subscriberNumber}</Text>
        </View>

        <View style={styles.detailDivider} />

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Type</Text>
          <Text style={styles.detailValue}>{transaction.type}</Text>
        </View>

        <View style={styles.detailDivider} />

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Date</Text>
          <Text style={styles.detailValue}>{formattedDate}</Text>
        </View>

        {transaction.utr && (
          <>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>UTR</Text>
              <Text style={[styles.detailValue, styles.utrText]}>{transaction.utr}</Text>
            </View>
          </>
        )}

        <View style={styles.detailDivider} />

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Payment</Text>
          <View style={[styles.statusPill, {
            backgroundColor: transaction.paymentStatus === "PAYMENT_UNVERIFIED"
              ? Colors.warningLight
              : transaction.paymentStatus === "PAYMENT_VERIFIED"
              ? Colors.successLight
              : Colors.errorLight,
          }]}>
            <Text style={[styles.statusPillText, {
              color: transaction.paymentStatus === "PAYMENT_UNVERIFIED"
                ? Colors.warning
                : transaction.paymentStatus === "PAYMENT_VERIFIED"
                ? Colors.success
                : Colors.error,
            }]}>
              {transaction.paymentStatus.replace("PAYMENT_", "")}
            </Text>
          </View>
        </View>

        {transaction.paysprintRefId && (
          <>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Ref ID</Text>
              <Text style={[styles.detailValue, { fontSize: 12 }]}>{transaction.paysprintRefId}</Text>
            </View>
          </>
        )}
      </Animated.View>

      <View style={[styles.bottomActions, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
        <Pressable
          style={styles.homeBtn}
          onPress={() => router.replace("/(tabs)")}
        >
          <Ionicons name="home" size={20} color={Colors.primary} />
          <Text style={styles.homeBtnText}>Go Home</Text>
        </Pressable>
      </View>
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
  statusSection: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 20,
  },
  statusCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  statusTextContainer: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 40,
  },
  statusLabel: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  statusSublabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  detailsCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  detailsTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
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
  utrText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  detailDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 12,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  bottomActions: {
    marginTop: "auto",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  homeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
  },
  homeBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  errorText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
