import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { getTransactions, getWallet } from "@/lib/api";
import { LOW_BALANCE_KEY, DEFAULT_THRESHOLD } from "@/constants/wallet";
import type { Transaction } from "@/shared/schema";

const SCREEN_WIDTH = Dimensions.get("window").width;
const AEPS_CARD_WIDTH = (SCREEN_WIDTH - 32 - 20) / 3;

function ServiceCard({ icon, label, color, onPress, cardStyle }: {
  icon: React.ReactNode;
  label: string;
  color: string;
  onPress: () => void;
  cardStyle?: object;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.serviceCard, cardStyle, pressed && { transform: [{ scale: 0.96 }] }]}
      onPress={onPress}
    >
      <View style={[styles.serviceIcon, { backgroundColor: color + "15" }]}>
        {icon}
      </View>
      <Text style={styles.serviceLabel}>{label}</Text>
    </Pressable>
  );
}

function TransactionItem({ tx }: { tx: Transaction }) {
  const isSuccess = tx.rechargeStatus === "RECHARGE_SUCCESS";
  const isFailed = tx.rechargeStatus === "RECHARGE_FAILED";

  return (
    <Pressable
      style={({ pressed }) => [styles.txItem, pressed && { opacity: 0.7 }]}
      onPress={() => router.push({ pathname: "/payment/status", params: { transactionId: tx.id } })}
    >
      <View style={[styles.txIcon, {
        backgroundColor: tx.type === "MOBILE" ? Colors.primaryLight : Colors.pendingLight,
      }]}>
        <Ionicons
          name={tx.type === "MOBILE" ? "phone-portrait" : "tv"}
          size={20}
          color={tx.type === "MOBILE" ? Colors.primary : Colors.pending}
        />
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txOperator}>{tx.operatorName}</Text>
        <Text style={styles.txNumber}>{tx.subscriberNumber}</Text>
      </View>
      <View style={styles.txAmountContainer}>
        <Text style={styles.txAmount}>₹{tx.amount}</Text>
        <Text style={[styles.txStatus, {
          color: isSuccess ? Colors.success : isFailed ? Colors.error : Colors.warning,
        }]}>
          {isSuccess ? "Success" : isFailed ? "Failed" : "Pending"}
        </Text>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState(DEFAULT_THRESHOLD);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(LOW_BALANCE_KEY).then((val) => {
        if (val) {
          const parsed = parseInt(val, 10);
          if (!isNaN(parsed) && parsed > 0) setLowBalanceThreshold(parsed);
        } else {
          setLowBalanceThreshold(DEFAULT_THRESHOLD);
        }
      });
    }, [])
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["transactions"],
    queryFn: getTransactions,
  });

  const { data: walletData, refetch: refetchWallet } = useQuery({
    queryKey: ["/api/wallet"],
    queryFn: getWallet,
  });

  const walletBalance = walletData?.wallet?.balance || 0;
  const transactions: Transaction[] = data?.transactions || [];
  const recentTx = transactions.slice(0, 5);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchWallet()]);
    setRefreshing(false);
  }, [refetch, refetchWallet]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 + 34 : 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <View>
          <Text style={styles.greeting}>
            Hello, {user?.name || "User"}
          </Text>
          <Text style={styles.subtitle}>What would you like to do today?</Text>
        </View>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={20} color={Colors.primary} />
        </View>
      </View>

      <View style={styles.bannerCard}>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle} numberOfLines={1}>RupyaSetu Services</Text>
          <Text style={styles.bannerSubtitle}>
            Recharge, banking & payments — all in one place
          </Text>
        </View>
        <View style={styles.bannerIcon}>
          <Ionicons name="flash" size={36} color="rgba(255,255,255,0.9)" />
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.walletBar, pressed && { opacity: 0.85 }]}
        onPress={() => router.push("/wallet")}
      >
        <View style={styles.walletBarLeft}>
          <View style={styles.walletBarIcon}>
            <Ionicons name="wallet" size={18} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.walletBarLabel}>Wallet Balance</Text>
            <Text style={styles.walletBarAmount}>₹{walletBalance.toFixed(2)}</Text>
          </View>
        </View>
        <View style={styles.walletBarRight}>
          <Text style={styles.walletBarAction}>Add Money</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
        </View>
      </Pressable>

      {walletData && walletBalance < lowBalanceThreshold && (
        <Pressable
          style={({ pressed }) => [styles.lowBalanceBanner, pressed && { opacity: 0.85 }]}
          onPress={() => router.push({ pathname: "/wallet", params: { openRecharge: "1" } })}
          testID="low-balance-banner"
        >
          <View style={styles.lowBalanceIconWrap}>
            <Ionicons name="warning" size={18} color={Colors.warning} />
          </View>
          <View style={styles.lowBalanceTextWrap}>
            <Text style={styles.lowBalanceTitle}>Low Wallet Balance</Text>
            <Text style={styles.lowBalanceSubtitle}>
              Your balance is ₹{walletBalance.toFixed(2)}. Tap to add money before recharging.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.warning} />
        </Pressable>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recharge</Text>
        <Pressable onPress={() => router.push("/recharge/history")}>
          <Text style={styles.seeAll}>History</Text>
        </Pressable>
      </View>

      <View style={styles.servicesRow}>
        <ServiceCard
          icon={<Ionicons name="phone-portrait" size={24} color={Colors.primary} />}
          label="Mobile"
          color={Colors.primary}
          onPress={() => router.push("/recharge/mobile")}
        />
        <ServiceCard
          icon={<MaterialCommunityIcons name="satellite-uplink" size={24} color={Colors.pending} />}
          label="DTH"
          color={Colors.pending}
          onPress={() => router.push("/recharge/dth")}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>AEPS Banking</Text>
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>NEW</Text>
        </View>
      </View>

      <View style={styles.aepsGrid}>
        <ServiceCard
          icon={<Ionicons name="wallet" size={24} color="#2E9E5B" />}
          label="Balance"
          color="#2E9E5B"
          cardStyle={{ flex: 0, width: AEPS_CARD_WIDTH, minWidth: 0, maxWidth: AEPS_CARD_WIDTH }}
          onPress={() => router.push({ pathname: "/aeps/transaction", params: { type: "BALANCE_ENQUIRY", label: "Balance Enquiry", requiresAmount: "0" } })}
        />
        <ServiceCard
          icon={<Ionicons name="cash" size={24} color="#F59E0B" />}
          label="Withdraw"
          color="#F59E0B"
          cardStyle={{ flex: 0, width: AEPS_CARD_WIDTH, minWidth: 0, maxWidth: AEPS_CARD_WIDTH }}
          onPress={() => router.push({ pathname: "/aeps/transaction", params: { type: "CASH_WITHDRAWAL", label: "Cash Withdrawal", requiresAmount: "1" } })}
        />
        <ServiceCard
          icon={<Ionicons name="document-text" size={24} color="#6366F1" />}
          label="Statement"
          color="#6366F1"
          cardStyle={{ flex: 0, width: AEPS_CARD_WIDTH, minWidth: 0, maxWidth: AEPS_CARD_WIDTH }}
          onPress={() => router.push({ pathname: "/aeps/transaction", params: { type: "MINI_STATEMENT", label: "Mini Statement", requiresAmount: "0" } })}
        />
        <ServiceCard
          icon={<MaterialCommunityIcons name="contactless-payment" size={24} color="#EF4444" />}
          label="Aadhaar Pay"
          color="#EF4444"
          cardStyle={{ flex: 0, width: AEPS_CARD_WIDTH, minWidth: 0, maxWidth: AEPS_CARD_WIDTH }}
          onPress={() => router.push({ pathname: "/aeps/transaction", params: { type: "AADHAAR_PAY", label: "Aadhaar Pay", requiresAmount: "1" } })}
        />
        <ServiceCard
          icon={<Ionicons name="arrow-down-circle" size={24} color="#10B981" />}
          label="Deposit"
          color="#10B981"
          cardStyle={{ flex: 0, width: AEPS_CARD_WIDTH, minWidth: 0, maxWidth: AEPS_CARD_WIDTH }}
          onPress={() => router.push({ pathname: "/aeps/transaction", params: { type: "CASH_DEPOSIT", label: "Cash Deposit", requiresAmount: "1" } })}
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.aepsBanner, pressed && { opacity: 0.9 }]}
        onPress={() => router.push("/aeps")}
      >
        <MaterialCommunityIcons name="fingerprint" size={28} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={styles.aepsBannerTitle}>All AEPS Services</Text>
          <Text style={styles.aepsBannerSub}>Explore more banking services</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
      </View>

      <View style={styles.servicesRow}>
        <ServiceCard
          icon={<Ionicons name="time" size={24} color={Colors.accent} />}
          label="History"
          color={Colors.accent}
          onPress={() => router.push("/(tabs)/history")}
        />
        <ServiceCard
          icon={<Ionicons name="help-circle" size={24} color="#8B5CF6" />}
          label="Support"
          color="#8B5CF6"
          onPress={() => router.push("/help")}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        {recentTx.length > 0 && (
          <Pressable onPress={() => router.push("/(tabs)/history")}>
            <Text style={styles.seeAll}>See All</Text>
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : recentTx.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={48} color={Colors.textTertiary} />
          <Text style={styles.emptyText}>No transactions yet</Text>
          <Text style={styles.emptySubtext}>Your recharge & AEPS history will appear here</Text>
        </View>
      ) : (
        <View style={styles.txList}>
          {recentTx.map((tx) => (
            <TransactionItem key={tx.id} tx={tx} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 4,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  bannerCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    lineHeight: 20,
  },
  bannerIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 16,
  },
  walletBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
  },
  walletBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  walletBarIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  walletBarLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  walletBarAmount: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  walletBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  walletBarAction: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  seeAll: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.primary,
  },
  newBadge: {
    backgroundColor: Colors.error,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  newBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.5,
  },
  servicesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  aepsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 10,
  },
  serviceCard: {
    flex: 1,
    minWidth: 75,
    maxWidth: "48%",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  serviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  serviceLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center",
  },
  aepsBanner: {
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 16,
    backgroundColor: "#1E6F44",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 24,
  },
  aepsBannerTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  aepsBannerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    padding: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
  },
  txList: {
    paddingHorizontal: 20,
    gap: 8,
  },
  txItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  txIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  txInfo: {
    flex: 1,
    gap: 2,
  },
  txOperator: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  txNumber: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  txAmountContainer: {
    alignItems: "flex-end",
    gap: 2,
  },
  txAmount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  txStatus: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  lowBalanceBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.warningLight,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.warning + "40",
    gap: 10,
  },
  lowBalanceIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.warning + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  lowBalanceTextWrap: {
    flex: 1,
  },
  lowBalanceTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#92400E",
  },
  lowBalanceSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#B45309",
    marginTop: 2,
  },
});
