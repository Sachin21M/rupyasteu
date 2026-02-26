import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Platform,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getTransactions } from "@/lib/api";
import type { Transaction } from "@/shared/schema";

const FILTERS = ["All", "Mobile", "DTH"] as const;

function TransactionCard({ tx }: { tx: Transaction }) {
  const isSuccess = tx.rechargeStatus === "RECHARGE_SUCCESS";
  const isFailed = tx.rechargeStatus === "RECHARGE_FAILED";
  const isPending = !isSuccess && !isFailed;

  const statusColor = isSuccess ? Colors.success : isFailed ? Colors.error : Colors.warning;
  const statusBg = isSuccess ? Colors.successLight : isFailed ? Colors.errorLight : Colors.warningLight;
  const statusText = isSuccess ? "Success" : isFailed ? "Failed" : "Pending";

  const date = new Date(tx.createdAt);
  const formattedDate = `${date.getDate()} ${date.toLocaleDateString("en-IN", { month: "short" })}, ${date.getFullYear()}`;
  const formattedTime = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <Pressable
      style={({ pressed }) => [styles.txCard, pressed && { opacity: 0.8 }]}
      onPress={() => router.push({ pathname: "/payment/status", params: { transactionId: tx.id } })}
    >
      <View style={styles.txCardTop}>
        <View style={[styles.txTypeIcon, {
          backgroundColor: tx.type === "MOBILE" ? Colors.primaryLight : Colors.pendingLight,
        }]}>
          <Ionicons
            name={tx.type === "MOBILE" ? "phone-portrait" : "tv"}
            size={20}
            color={tx.type === "MOBILE" ? Colors.primary : Colors.pending}
          />
        </View>
        <View style={styles.txCardInfo}>
          <Text style={styles.txCardOperator}>{tx.operatorName}</Text>
          <Text style={styles.txCardNumber}>{tx.subscriberNumber}</Text>
        </View>
        <View style={styles.txCardRight}>
          <Text style={styles.txCardAmount}>₹{tx.amount}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>
      </View>
      <View style={styles.txCardBottom}>
        <Text style={styles.txCardDate}>{formattedDate} at {formattedTime}</Text>
        {tx.utr && <Text style={styles.txCardUtr}>UTR: {tx.utr}</Text>}
      </View>
    </Pressable>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<typeof FILTERS[number]>("All");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["transactions"],
    queryFn: getTransactions,
  });

  const allTransactions: Transaction[] = data?.transactions || [];
  const filteredTransactions = filter === "All"
    ? allTransactions
    : allTransactions.filter((tx) =>
        filter === "Mobile" ? tx.type === "MOBILE" : tx.type === "DTH"
      );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Text style={styles.headerTitle}>Transaction History</Text>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TransactionCard tx={item} />}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
            gap: 10,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          scrollEnabled={!!filteredTransactions.length}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={56} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No transactions found</Text>
              <Text style={styles.emptySubtext}>
                {filter === "All"
                  ? "Start by making your first recharge"
                  : `No ${filter.toLowerCase()} recharges yet`}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    textAlign: "center",
  },
  txCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  txCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  txTypeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  txCardInfo: {
    flex: 1,
    gap: 2,
  },
  txCardOperator: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  txCardNumber: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  txCardRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  txCardAmount: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  txCardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  txCardDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
  },
  txCardUtr: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
