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

function statusInfo(tx: Transaction) {
  const isSuccess = tx.rechargeStatus === "RECHARGE_SUCCESS";
  const isFailed = tx.rechargeStatus === "RECHARGE_FAILED";
  return {
    label: isSuccess ? "Success" : isFailed ? "Failed" : "Pending",
    color: isSuccess ? Colors.success : isFailed ? Colors.error : Colors.warning,
    bg: isSuccess ? Colors.successLight : isFailed ? Colors.errorLight : Colors.warningLight,
  };
}

function RechargeHistoryCard({ tx }: { tx: Transaction }) {
  const status = statusInfo(tx);
  const date = new Date(tx.createdAt);
  const formattedDate = date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const formattedTime = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const isMobile = tx.type === "MOBILE";

  return (
    <Pressable
      testID={`recharge-history-card-${tx.id}`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
      onPress={() => router.push({ pathname: "/payment/status", params: { transactionId: tx.id } })}
    >
      <View style={styles.cardTop}>
        <View style={[styles.iconBox, { backgroundColor: isMobile ? Colors.primaryLight : Colors.pendingLight }]}>
          <Ionicons
            name={isMobile ? "phone-portrait" : "tv"}
            size={22}
            color={isMobile ? Colors.primary : Colors.pending}
          />
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.operatorText}>{tx.operatorName}</Text>
          <Text style={styles.numberText}>{tx.subscriberNumber}</Text>
          <Text style={styles.planText} numberOfLines={1}>
            {tx.planDescription || "Custom amount"}
          </Text>
        </View>

        <View style={styles.cardRight}>
          <Text style={styles.amountText}>₹{tx.amount}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <Text style={styles.dateText}>{formattedDate} · {formattedTime}</Text>
        <View style={[styles.typeBadge, { backgroundColor: isMobile ? Colors.primaryLight : Colors.pendingLight }]}>
          <Text style={[styles.typeBadgeText, { color: isMobile ? Colors.primary : Colors.pending }]}>
            {isMobile ? "Mobile" : "DTH"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function RechargeHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<typeof FILTERS[number]>("All");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["transactions"],
    queryFn: getTransactions,
  });

  const allTransactions: Transaction[] = data?.transactions || [];

  const filtered = allTransactions.filter((tx) => {
    if (filter === "All") return true;
    if (filter === "Mobile") return tx.type === "MOBILE";
    if (filter === "DTH") return tx.type === "DTH";
    return true;
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Pressable
          testID="recharge-history-back"
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Recharge History</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            testID={`filter-${f}`}
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
      ) : isError ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cloud-offline-outline" size={56} color={Colors.textTertiary} />
          <Text style={styles.emptyText}>Couldn't load history</Text>
          <Text style={styles.emptySubtext}>Check your connection and try again</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <RechargeHistoryCard tx={item} />}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: Platform.OS === "web" ? 34 : 40,
            paddingTop: 4,
            gap: 10,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          scrollEnabled={!!filtered.length}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={56} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No recharge history</Text>
              <Text style={styles.emptySubtext}>
                {filter === "All"
                  ? "Your mobile and DTH recharges will appear here"
                  : `No ${filter} recharges yet`}
              </Text>
            </View>
          }
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
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  operatorText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  numberText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  planText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    marginTop: 2,
  },
  cardRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  amountText: {
    fontSize: 17,
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
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  dateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  typeBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
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
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  retryBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
