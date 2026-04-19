import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import type { CommissionTransaction, CommissionWithdrawal } from "@/shared/schema";
import {
  getCommissionBalance,
  getCommissionHistory,
  getCommissionWithdrawals,
  requestCommissionWithdrawal,
} from "@/lib/api";

type WithdrawMode = "UPI" | "BANK";

const SERVICE_LABELS: Record<string, string> = {
  MOBILE_RECHARGE: "Mobile Recharge",
  DTH_RECHARGE: "DTH Recharge",
  CASH_WITHDRAWAL: "AEPS Cash Withdrawal",
  CASH_DEPOSIT: "AEPS Cash Deposit",
  MINI_STATEMENT: "AEPS Mini Statement",
  AADHAAR_PAY: "Aadhaar Pay",
  WITHDRAWAL: "Withdrawal",
  WITHDRAWAL_REFUND: "Withdrawal Refunded",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function CommissionScreen() {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"earnings" | "withdrawals">("earnings");
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawMode, setWithdrawMode] = useState<WithdrawMode>("UPI");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [upiId, setUpiId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: walletData, isLoading: walletLoading } = useQuery({
    queryKey: ["/api/commission/balance"],
    queryFn: getCommissionBalance,
    refetchInterval: 30000,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["/api/commission/history"],
    queryFn: getCommissionHistory,
  });

  const { data: withdrawalData, isLoading: withdrawalLoading } = useQuery({
    queryKey: ["/api/commission/withdrawals"],
    queryFn: getCommissionWithdrawals,
  });

  const wallet = walletData?.wallet;
  const transactions: CommissionTransaction[] = historyData?.transactions || [];
  const withdrawals: CommissionWithdrawal[] = withdrawalData?.withdrawals || [];

  const resetForm = () => {
    setWithdrawAmount("");
    setUpiId("");
    setAccountNumber("");
    setIfscCode("");
    setAccountName("");
    setBankName("");
  };

  const handleWithdraw = useCallback(async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount < 50) {
      Alert.alert("Error", "Minimum withdrawal amount is ₹50");
      return;
    }
    if (withdrawMode === "UPI" && !upiId.trim()) {
      Alert.alert("Error", "Please enter your UPI ID");
      return;
    }
    if (withdrawMode === "BANK") {
      if (!bankName.trim() || !accountName.trim() || !accountNumber.trim() || !ifscCode.trim()) {
        Alert.alert("Error", "Please fill in all bank details including bank name");
        return;
      }
    }
    setSubmitting(true);
    try {
      const result = await requestCommissionWithdrawal({
        amount,
        mode: withdrawMode,
        upiId: withdrawMode === "UPI" ? upiId.trim() : undefined,
        accountNumber: withdrawMode === "BANK" ? accountNumber.trim() : undefined,
        ifscCode: withdrawMode === "BANK" ? ifscCode.trim().toUpperCase() : undefined,
        accountName: withdrawMode === "BANK" ? accountName.trim() : undefined,
        bankName: withdrawMode === "BANK" ? bankName.trim() : undefined,
      });
      if (result.success) {
        Alert.alert("Success", "Withdrawal request submitted. Admin will process it within 24 hours.");
        setShowWithdrawModal(false);
        resetForm();
        queryClient.invalidateQueries({ queryKey: ["/api/commission/balance"] });
        queryClient.invalidateQueries({ queryKey: ["/api/commission/withdrawals"] });
        queryClient.invalidateQueries({ queryKey: ["/api/commission/history"] });
      } else {
        Alert.alert("Error", result.error || "Failed to submit withdrawal");
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [withdrawAmount, withdrawMode, upiId, accountNumber, ifscCode, accountName, bankName, queryClient]);

  const statusColor = (status: string) => {
    if (status === "APPROVED") return "#2E9E5B";
    if (status === "REJECTED") return "#e53935";
    return "#f59e0b";
  };

  const statusLabel = (status: string) => {
    if (status === "APPROVED") return "Approved";
    if (status === "REJECTED") return "Rejected";
    return "Pending";
  };

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Commission Wallet</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPadding + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.balanceCard}>
          <View style={styles.balanceRow}>
            <View>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              {walletLoading ? (
                <ActivityIndicator color="#fff" style={{ marginTop: 8 }} />
              ) : (
                <Text style={styles.balanceAmount}>
                  ₹{wallet ? wallet.balance.toFixed(2) : "0.00"}
                </Text>
              )}
            </View>
            <Pressable
              style={styles.withdrawBtn}
              onPress={() => setShowWithdrawModal(true)}
            >
              <Ionicons name="arrow-up" size={16} color="#2E9E5B" />
              <Text style={styles.withdrawBtnText}>Withdraw</Text>
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Total Earned</Text>
              <Text style={styles.statValue}>₹{wallet ? wallet.totalEarned.toFixed(2) : "0.00"}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Total Withdrawn</Text>
              <Text style={styles.statValue}>₹{wallet ? wallet.totalWithdrawn.toFixed(2) : "0.00"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.ratesCard}>
          <Text style={styles.ratesTitle}>Commission Rates</Text>
          {[
            { label: "Cash Withdrawal", rate: "₹5 per transaction" },
            { label: "Cash Deposit", rate: "₹5 per transaction" },
            { label: "Mini Statement", rate: "₹0.50 per query" },
            { label: "Aadhaar Pay", rate: "Service fee: 0.531% of amount" },
          ].map((item) => (
            <View key={item.label} style={styles.rateRow}>
              <Text style={styles.rateLabel}>{item.label}</Text>
              <Text style={styles.rateValue}>{item.rate}</Text>
            </View>
          ))}
        </View>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, activeTab === "earnings" && styles.activeTab]}
            onPress={() => setActiveTab("earnings")}
          >
            <Text style={[styles.tabText, activeTab === "earnings" && styles.activeTabText]}>
              Earnings ({transactions.filter((tx: CommissionTransaction) => tx.type === "CREDIT" && tx.serviceType !== "WITHDRAWAL_REFUND").length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "withdrawals" && styles.activeTab]}
            onPress={() => setActiveTab("withdrawals")}
          >
            <Text style={[styles.tabText, activeTab === "withdrawals" && styles.activeTabText]}>
              Withdrawals ({withdrawals.length})
            </Text>
          </Pressable>
        </View>

        {activeTab === "earnings" && (
          <View style={styles.listSection}>
            {historyLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
            ) : transactions.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="wallet-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No earnings yet</Text>
                <Text style={styles.emptySubText}>Complete AEPS transactions to earn commission</Text>
              </View>
            ) : (
              transactions.map((tx: CommissionTransaction) => (
                <View key={tx.id} style={styles.txCard}>
                  <View style={styles.txLeft}>
                    <View style={[styles.txIcon, { backgroundColor: tx.type === "CREDIT" ? "#d1fae5" : "#fee2e2" }]}>
                      <Ionicons
                        name={tx.type === "CREDIT" ? "trending-up" : "arrow-up-circle"}
                        size={18}
                        color={tx.type === "CREDIT" ? "#2E9E5B" : "#e53935"}
                      />
                    </View>
                    <View>
                      <Text style={styles.txLabel}>{SERVICE_LABELS[tx.serviceType] || tx.serviceType}</Text>
                      <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
                    </View>
                  </View>
                  <Text style={[styles.txAmount, { color: tx.type === "CREDIT" ? "#2E9E5B" : "#e53935" }]}>
                    {tx.type === "CREDIT" ? "+" : "-"}₹{parseFloat(String(tx.amount)).toFixed(2)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === "withdrawals" && (
          <View style={styles.listSection}>
            {withdrawalLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
            ) : withdrawals.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="card-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No withdrawals yet</Text>
                <Text style={styles.emptySubText}>Your withdrawal requests will appear here</Text>
              </View>
            ) : (
              withdrawals.map((w: CommissionWithdrawal) => (
                <View key={w.id} style={styles.withdrawalCard}>
                  <View style={styles.withdrawalHeader}>
                    <View style={styles.withdrawalLeft}>
                      <Text style={styles.withdrawalAmount}>₹{parseFloat(String(w.amount)).toFixed(2)}</Text>
                      <Text style={styles.withdrawalDate}>{formatDate(w.createdAt)}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor(w.status) + "20" }]}>
                      <Text style={[styles.statusText, { color: statusColor(w.status) }]}>
                        {statusLabel(w.status)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.withdrawalDetails}>
                    <Text style={styles.withdrawalMode}>{w.mode === "UPI" ? "UPI" : "Bank Transfer"}</Text>
                    {w.mode === "UPI" && w.upiId && (
                      <Text style={styles.withdrawalInfo}>{w.upiId}</Text>
                    )}
                    {w.mode === "BANK" && w.accountNumber && (
                      <Text style={styles.withdrawalInfo}>
                        {w.bankName ? `${w.bankName} · ` : ""}{w.accountName} · {w.accountNumber} · {w.ifscCode}
                      </Text>
                    )}
                    {w.adminNote && (
                      <Text style={styles.adminNote}>{w.adminNote}</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showWithdrawModal}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowWithdrawModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView style={styles.modal} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Withdraw Commission</Text>
              <Pressable onPress={() => setShowWithdrawModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>

            <Text style={styles.modalBalance}>
              Available: ₹{wallet ? wallet.balance.toFixed(2) : "0.00"}
            </Text>

            <View style={styles.modeToggle}>
              <Pressable
                style={[styles.modeBtn, withdrawMode === "UPI" && styles.modeBtnActive]}
                onPress={() => setWithdrawMode("UPI")}
              >
                <Text style={[styles.modeBtnText, withdrawMode === "UPI" && styles.modeBtnActiveText]}>UPI</Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, withdrawMode === "BANK" && styles.modeBtnActive]}
                onPress={() => setWithdrawMode("BANK")}
              >
                <Text style={[styles.modeBtnText, withdrawMode === "BANK" && styles.modeBtnActiveText]}>Bank Account</Text>
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Amount (Min ₹50)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Enter amount"
                keyboardType="numeric"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                placeholderTextColor="#aaa"
              />
            </View>

            {withdrawMode === "UPI" ? (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>UPI ID</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. name@paytm"
                  value={upiId}
                  onChangeText={setUpiId}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholderTextColor="#aaa"
                />
              </View>
            ) : (
              <>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Bank Name</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. State Bank of India"
                    value={bankName}
                    onChangeText={setBankName}
                    placeholderTextColor="#aaa"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Account Holder Name</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Full name as on account"
                    value={accountName}
                    onChangeText={setAccountName}
                    placeholderTextColor="#aaa"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Account Number</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Enter account number"
                    keyboardType="numeric"
                    value={accountNumber}
                    onChangeText={setAccountNumber}
                    placeholderTextColor="#aaa"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>IFSC Code</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. SBIN0001234"
                    value={ifscCode}
                    onChangeText={(v) => setIfscCode(v.toUpperCase())}
                    autoCapitalize="characters"
                    placeholderTextColor="#aaa"
                  />
                </View>
              </>
            )}

            <Pressable
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleWithdraw}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Withdrawal Request</Text>
              )}
            </Pressable>

            <Text style={styles.withdrawNote}>
              Withdrawals are processed within 24 hours after admin approval.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#1a1a1a",
  },
  scroll: {
    flex: 1,
  },
  balanceCard: {
    margin: 16,
    backgroundColor: "#2E9E5B",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#2E9E5B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  balanceLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Inter_500Medium",
  },
  balanceAmount: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginTop: 4,
  },
  withdrawBtn: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  withdrawBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#2E9E5B",
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    padding: 12,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginHorizontal: 8,
  },
  statLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_500Medium",
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginTop: 2,
  },
  ratesCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  ratesTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  rateLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#555",
  },
  rateValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#2E9E5B",
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#888",
  },
  activeTabText: {
    color: "#2E9E5B",
    fontFamily: "Inter_600SemiBold",
  },
  listSection: {
    paddingHorizontal: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#888",
  },
  emptySubText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#aaa",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  txCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  txLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  txLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#1a1a1a",
  },
  txDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#aaa",
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  withdrawalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  withdrawalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  withdrawalLeft: { gap: 2 },
  withdrawalAmount: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#1a1a1a",
  },
  withdrawalDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#aaa",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  withdrawalDetails: { gap: 2 },
  withdrawalMode: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#555",
  },
  withdrawalInfo: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#888",
  },
  adminNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#f59e0b",
    marginTop: 4,
    fontStyle: "italic",
  },
  modal: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingTop: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#1a1a1a",
  },
  modalBalance: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#2E9E5B",
    marginBottom: 20,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    padding: 3,
    marginBottom: 20,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  modeBtnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#888",
  },
  modeBtnActiveText: {
    color: "#2E9E5B",
    fontFamily: "Inter_600SemiBold",
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#333",
    marginBottom: 6,
  },
  formInput: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#1a1a1a",
    backgroundColor: "#fafafa",
  },
  submitBtn: {
    backgroundColor: "#2E9E5B",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  withdrawNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#aaa",
    textAlign: "center",
  },
});
