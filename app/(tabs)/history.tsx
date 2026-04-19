import { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getAepsTransactions } from "@/lib/api";
import type { AepsTransaction } from "@/shared/schema";
import { useState } from "react";

function AepsCard({ tx }: { tx: AepsTransaction }) {
  const isSuccess = tx.status === "AEPS_SUCCESS";
  const isFailed = tx.status === "AEPS_FAILED";

  const statusColor = isSuccess ? Colors.success : isFailed ? Colors.error : Colors.warning;
  const statusBg = isSuccess ? Colors.successLight : isFailed ? Colors.errorLight : Colors.warningLight;
  const statusText = isSuccess ? "Success" : isFailed ? "Failed" : "Processing";

  const typeLabels: Record<string, string> = {
    BALANCE_ENQUIRY: "Balance Enquiry",
    MINI_STATEMENT: "Mini Statement",
    CASH_WITHDRAWAL: "Cash Withdrawal",
    AADHAAR_PAY: "Aadhaar Pay",
    CASH_DEPOSIT: "Cash Deposit",
  };

  const typeIcons: Record<string, { name: string; color: string }> = {
    BALANCE_ENQUIRY: { name: "wallet", color: "#2E9E5B" },
    MINI_STATEMENT: { name: "document-text", color: "#6366F1" },
    CASH_WITHDRAWAL: { name: "cash", color: "#F59E0B" },
    AADHAAR_PAY: { name: "finger-print", color: "#EF4444" },
    CASH_DEPOSIT: { name: "arrow-down-circle", color: "#2563EB" },
  };

  const icon = typeIcons[tx.type] || { name: "finger-print", color: Colors.primary };
  const date = new Date(tx.createdAt);
  const formattedDate = `${date.getDate()} ${date.toLocaleDateString("en-IN", { month: "short" })}, ${date.getFullYear()}`;
  const formattedTime = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={styles.txCard}>
      <View style={styles.txCardTop}>
        <View style={[styles.txTypeIcon, { backgroundColor: icon.color + "15" }]}>
          <Ionicons name={icon.name as any} size={20} color={icon.color} />
        </View>
        <View style={styles.txCardInfo}>
          <Text style={styles.txCardOperator}>{typeLabels[tx.type] || tx.type}</Text>
          <Text style={styles.txCardNumber}>{tx.bankName}</Text>
        </View>
        <View style={styles.txCardRight}>
          {tx.amount > 0 && <Text style={styles.txCardAmount}>₹{tx.amount}</Text>}
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>
      </View>
      <View style={styles.txCardBottom}>
        <Text style={styles.txCardDate}>{formattedDate} at {formattedTime}</Text>
        <View style={styles.aepsBadge}>
          <MaterialCommunityIcons name="fingerprint" size={12} color={Colors.primary} />
          <Text style={styles.aepsBadgeText}>AEPS</Text>
        </View>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data: aepsData, isLoading, refetch } = useQuery({
    queryKey: ["aeps-transactions"],
    queryFn: getAepsTransactions,
  });

  const aepsTransactions: AepsTransaction[] = aepsData?.transactions || [];
  const sorted = [...aepsTransactions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
        <Text style={styles.headerTitle}>AEPS History</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <AepsCard tx={item} />}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
            gap: 10,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          scrollEnabled={!!sorted.length}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="fingerprint" size={56} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No AEPS transactions yet</Text>
              <Text style={styles.emptySubtext}>
                Your AEPS banking activity will appear here
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
  aepsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  aepsBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
});
