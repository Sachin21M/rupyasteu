import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
  Share,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getTransaction } from "@/lib/api";
import type { Transaction } from "@/shared/schema";

const POLL_INTERVAL_MS = 10000;

function isPendingStatus(tx: Transaction): boolean {
  return tx.rechargeStatus !== "RECHARGE_SUCCESS" && tx.rechargeStatus !== "RECHARGE_FAILED";
}

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

function CopyableRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  async function handleCopy() {
    await Clipboard.setStringAsync(value);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
    }
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Pressable
          testID={`copy-${label.toLowerCase().replace(/\s+/g, "-")}`}
          style={styles.copyableValue}
          onPress={handleCopy}
          hitSlop={8}
        >
          <Text style={[styles.detailValue, styles.copyableText, mono && styles.monoText]} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          <Ionicons
            name={copied ? "checkmark-circle" : "copy-outline"}
            size={16}
            color={copied ? Colors.success : Colors.primary}
          />
        </Pressable>
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
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!transactionId) {
      setLoading(false);
      return;
    }
    loadTransaction();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function loadTransaction(silent = false) {
    if (!silent) setLoading(true);
    try {
      const result = await getTransaction(transactionId!);
      const tx: Transaction = result.transaction;
      setTransaction(tx);
      if (isPendingStatus(tx)) {
        startPolling();
      } else {
        stopPolling();
      }
    } catch {
      if (!silent) {
        Alert.alert("Error", "Could not load recharge details. Please try again.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      setPolling(true);
      try {
        const result = await getTransaction(transactionId!);
        const tx: Transaction = result.transaction;
        setTransaction(tx);
        if (!isPendingStatus(tx)) {
          stopPolling();
        }
      } catch {
      } finally {
        setPolling(false);
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function handleShare() {
    if (!transaction) return;
    const config = statusConfig(transaction);
    const date = new Date(transaction.createdAt);
    const formattedDate = `${date.getDate()} ${date.toLocaleDateString("en-IN", { month: "short" })} ${date.getFullYear()}, ${date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
    const isMobile = transaction.type === "MOBILE";
    const lines = [
      `RupyaSetu Recharge Receipt`,
      `─────────────────────`,
      `Type: ${isMobile ? "Mobile Recharge" : "DTH Recharge"}`,
      `Operator: ${transaction.operatorName}`,
      `${isMobile ? "Mobile" : "Subscriber ID"}: ${transaction.subscriberNumber}`,
      transaction.planDescription ? `Plan: ${transaction.planDescription}` : null,
      `Amount: ₹${transaction.amount}`,
      `Status: ${config.label}`,
      `Date: ${formattedDate}`,
      transaction.utr ? `UTR: ${transaction.utr}` : null,
      transaction.paysprintRefId ? `Ref ID: ${transaction.paysprintRefId}` : null,
    ].filter(Boolean).join("\n");

    try {
      await Share.share({ message: lines });
    } catch {
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
  const pending = isPendingStatus(transaction);

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
        <Pressable
          testID="recharge-detail-share"
          style={styles.shareBtn}
          onPress={handleShare}
        >
          <Ionicons name="share-outline" size={22} color={Colors.primary} />
        </Pressable>
      </View>

      {pending && (
        <View style={styles.pollingBanner}>
          <ActivityIndicator size="small" color={Colors.warning} style={{ marginRight: 8 }} />
          <Text style={styles.pollingText}>
            {polling ? "Checking status…" : "Checking for updates every 10s"}
          </Text>
        </View>
      )}

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
            <CopyableRow label="UTR" value={transaction.utr} mono />
          ) : null}

          {transaction.paysprintRefId ? (
            <CopyableRow label="Reference ID" value={transaction.paysprintRefId} mono />
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
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLighter,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  pollingBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.warningLight,
  },
  pollingText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.warning,
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
  copyableValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "60%",
  },
  copyableText: {
    maxWidth: undefined,
    flex: 1,
    textAlign: "right",
  },
  monoText: {
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
