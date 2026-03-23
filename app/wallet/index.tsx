import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getWallet, requestWalletRecharge, getCommissionConfig } from "@/lib/api";
import type { WalletTransaction, CommissionConfig } from "@/shared/schema";

const PAYEE_UPI_ID = "charua821@okaxis";
const SCREEN_WIDTH = Dimensions.get("window").width;

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isWeb = Platform.OS === "web";

  const [showRecharge, setShowRecharge] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [showCommission, setShowCommission] = useState(false);

  const { data: walletData, isLoading, refetch } = useQuery({
    queryKey: ["/api/wallet"],
    queryFn: getWallet,
  });

  const { data: commissionData } = useQuery({
    queryKey: ["/api/wallet/commission"],
    queryFn: getCommissionConfig,
  });

  const rechargeMutation = useMutation({
    mutationFn: ({ amount, utr }: { amount: number; utr: string }) =>
      requestWalletRecharge(amount, utr),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      setShowRecharge(false);
      setRechargeAmount("");
      setUtr("");
      Alert.alert("Success", "Recharge request submitted. Pending admin approval.");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message);
    },
  });

  const wallet = walletData?.wallet;
  const transactions: WalletTransaction[] = walletData?.transactions || [];
  const commissions: CommissionConfig[] = commissionData?.commission || [];

  const handleRecharge = useCallback(() => {
    const amount = parseFloat(rechargeAmount);
    if (!amount || amount <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }
    if (!utr || utr.length < 6) {
      Alert.alert("Error", "Please enter a valid UTR number");
      return;
    }
    rechargeMutation.mutate({ amount, utr: utr.trim() });
  }, [rechargeAmount, utr, rechargeMutation]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "RECHARGE": return "add-circle";
      case "DEBIT": return "remove-circle";
      case "CREDIT": return "arrow-down-circle";
      case "COMMISSION": return "cut";
      case "ADJUSTMENT": return "swap-horizontal";
      default: return "ellipse";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "RECHARGE": return Colors.success;
      case "DEBIT": return Colors.error;
      case "CREDIT": return Colors.primary;
      case "COMMISSION": return Colors.warning;
      case "ADJUSTMENT": return Colors.pending;
      default: return Colors.textSecondary;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
      case "APPROVED": return Colors.success;
      case "PENDING": return Colors.warning;
      case "REJECTED": return Colors.error;
      default: return Colors.textSecondary;
    }
  };

  const renderTransaction = ({ item }: { item: WalletTransaction }) => (
    <View style={styles.txItem}>
      <View style={[styles.txIcon, { backgroundColor: getTypeColor(item.type) + "15" }]}>
        <Ionicons name={getTypeIcon(item.type) as any} size={20} color={getTypeColor(item.type)} />
      </View>
      <View style={styles.txDetails}>
        <Text style={styles.txDescription} numberOfLines={1}>{item.description}</Text>
        <Text style={styles.txDate}>
          {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          {" "}
          {new Date(item.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </Text>
        {item.utr && <Text style={styles.txUtr}>UTR: {item.utr}</Text>}
      </View>
      <View style={styles.txAmountCol}>
        <Text style={[styles.txAmount, { color: item.type === "RECHARGE" || item.type === "CREDIT" ? Colors.success : Colors.error }]}>
          {item.type === "RECHARGE" || item.type === "CREDIT" ? "+" : "-"}₹{item.amount.toFixed(2)}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "15" }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
        </View>
      </View>
    </View>
  );

  const quickAmounts = [500, 1000, 2000, 5000];

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: isWeb ? insets.top + 67 : insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 100 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: isWeb ? insets.top + 67 : insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="wallet-back">
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet</Text>
        <TouchableOpacity onPress={() => setShowCommission(!showCommission)} style={styles.infoBtn} testID="wallet-commission-info">
          <Ionicons name="information-circle-outline" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTransaction}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
        contentContainerStyle={{ paddingBottom: isWeb ? 34 : insets.bottom + 20, paddingHorizontal: 16 }}
        ListHeaderComponent={
          <>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceAmount}>₹{(wallet?.balance || 0).toFixed(2)}</Text>
              <TouchableOpacity
                style={styles.rechargeBtn}
                onPress={() => setShowRecharge(!showRecharge)}
                testID="wallet-recharge-toggle"
              >
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.rechargeBtnText}>Add Money</Text>
              </TouchableOpacity>
            </View>

            {showCommission && commissions.length > 0 && (
              <View style={styles.commissionCard}>
                <Text style={styles.commissionTitle}>Service Charges</Text>
                {commissions.map((c) => (
                  <View key={c.serviceType} style={styles.commissionRow}>
                    <Text style={styles.commissionService}>{c.serviceType.replace(/_/g, " ")}</Text>
                    <Text style={styles.commissionAmount}>
                      {c.commissionType === "FIXED" ? `₹${c.commissionAmount}` : `${c.commissionAmount}%`}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {showRecharge && (
              <View style={styles.rechargeCard}>
                <Text style={styles.rechargeTitle}>Add Money to Wallet</Text>
                <Text style={styles.rechargeSubtitle}>
                  Pay via UPI to: <Text style={styles.upiId}>{PAYEE_UPI_ID}</Text>
                </Text>

                <Text style={styles.inputLabel}>Amount</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter amount"
                  keyboardType="numeric"
                  value={rechargeAmount}
                  onChangeText={setRechargeAmount}
                  testID="wallet-recharge-amount"
                />

                <View style={styles.quickAmounts}>
                  {quickAmounts.map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={[styles.quickBtn, rechargeAmount === String(amt) && styles.quickBtnActive]}
                      onPress={() => setRechargeAmount(String(amt))}
                    >
                      <Text style={[styles.quickBtnText, rechargeAmount === String(amt) && styles.quickBtnTextActive]}>₹{amt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>UTR Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter 12-digit UTR number"
                  value={utr}
                  onChangeText={setUtr}
                  maxLength={22}
                  testID="wallet-recharge-utr"
                />

                <TouchableOpacity
                  style={[styles.submitBtn, rechargeMutation.isPending && styles.submitBtnDisabled]}
                  onPress={handleRecharge}
                  disabled={rechargeMutation.isPending}
                  testID="wallet-recharge-submit"
                >
                  {rechargeMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Submit Recharge Request</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.sectionTitle}>Transaction History</Text>
            {transactions.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="wallet-outline" size={48} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>No wallet transactions yet</Text>
                <Text style={styles.emptySubtext}>Add money to get started</Text>
              </View>
            )}
          </>
        }
      />
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
    paddingVertical: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  infoBtn: {
    padding: 4,
  },
  balanceCard: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.8)",
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 16,
  },
  rechargeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  rechargeBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  commissionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  commissionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  commissionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  commissionService: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textTransform: "capitalize",
  },
  commissionAmount: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  rechargeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  rechargeTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 4,
  },
  rechargeSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  upiId: {
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  quickAmounts: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  quickBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  quickBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  quickBtnTextActive: {
    color: Colors.primary,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  txItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  txDetails: {
    flex: 1,
  },
  txDescription: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  txDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    marginTop: 2,
  },
  txUtr: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  txAmountCol: {
    alignItems: "flex-end",
  },
  txAmount: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  statusText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    marginTop: 4,
  },
});
