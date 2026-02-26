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
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { getTransactions } from "@/lib/api";
import type { Transaction } from "@/shared/schema";

function ServiceCard({ icon, label, color, onPress }: {
  icon: React.ReactNode;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.serviceCard, pressed && { transform: [{ scale: 0.96 }] }]}
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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["transactions"],
    queryFn: getTransactions,
  });

  const transactions: Transaction[] = data?.transactions || [];
  const recentTx = transactions.slice(0, 5);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

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
          <Text style={styles.bannerTitle}>Quick Recharge</Text>
          <Text style={styles.bannerSubtitle}>
            Recharge your mobile or DTH instantly with UPI
          </Text>
        </View>
        <View style={styles.bannerIcon}>
          <Ionicons name="flash" size={36} color="rgba(255,255,255,0.9)" />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Services</Text>
      </View>

      <View style={styles.servicesGrid}>
        <ServiceCard
          icon={<Ionicons name="phone-portrait" size={24} color={Colors.primary} />}
          label="Mobile Recharge"
          color={Colors.primary}
          onPress={() => router.push("/recharge/mobile")}
        />
        <ServiceCard
          icon={<MaterialCommunityIcons name="satellite-uplink" size={24} color={Colors.pending} />}
          label="DTH Recharge"
          color={Colors.pending}
          onPress={() => router.push("/recharge/dth")}
        />
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
          onPress={() => {}}
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
          <Text style={styles.emptySubtext}>Your recharge history will appear here</Text>
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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  seeAll: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.primary,
  },
  servicesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 28,
  },
  serviceCard: {
    width: "47%",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  serviceIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  serviceLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center",
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
});
