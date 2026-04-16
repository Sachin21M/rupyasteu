import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Platform,
  ActivityIndicator,
  Modal,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getPlans, instantRecharge, getWallet } from "@/lib/api";
import type { Plan } from "@/shared/schema";

function PlanCard({ plan, selected, onSelect }: {
  plan: Plan;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      style={[styles.planCard, selected && styles.planCardSelected]}
      onPress={onSelect}
    >
      <View style={styles.planTop}>
        <Text style={[styles.planAmount, selected && styles.planAmountSelected]}>
          ₹{plan.amount}
        </Text>
        <View style={[styles.validityBadge, selected && styles.validityBadgeSelected]}>
          <Text style={[styles.validityText, selected && styles.validityTextSelected]}>
            {plan.validity}
          </Text>
        </View>
      </View>
      <Text style={[styles.planDesc, selected && styles.planDescSelected]}>
        {plan.description}
      </Text>
      {(plan.data || plan.talktime) && (
        <View style={styles.planDetails}>
          {plan.data && (
            <View style={styles.planDetailItem}>
              <Ionicons name="cellular" size={14} color={selected ? "#fff" : Colors.primary} />
              <Text style={[styles.planDetailText, selected && { color: "rgba(255,255,255,0.9)" }]}>
                {plan.data}
              </Text>
            </View>
          )}
          {plan.talktime && (
            <View style={styles.planDetailItem}>
              <Ionicons name="call" size={14} color={selected ? "#fff" : Colors.primary} />
              <Text style={[styles.planDetailText, selected && { color: "rgba(255,255,255,0.9)" }]}>
                {plan.talktime}
              </Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

export default function PlansScreen() {
  const insets = useSafeAreaInsets();
  const { operatorId, operatorName, subscriberNumber, type } = useLocalSearchParams<{
    operatorId: string;
    operatorName: string;
    subscriberNumber: string;
    type: string;
  }>();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  const [showConfirm, setShowConfirm] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadPlans();
    loadWallet();
  }, []);

  async function loadPlans() {
    try {
      const data = await getPlans(operatorId!);
      const allPlans = data.plans || [];
      setPlans(allPlans);
      const cats = [...new Set(allPlans.map((p: Plan) => p.category))];
      setCategories(cats);
      if (cats.length > 0) setSelectedCategory(cats[0]);
    } catch (error) {
      console.error("Failed to load plans:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadWallet() {
    try {
      const data = await getWallet();
      setWalletBalance(data.wallet?.balance ?? 0);
    } catch {
      setWalletBalance(0);
    } finally {
      setWalletLoading(false);
    }
  }

  const filteredPlans = selectedCategory
    ? plans.filter((p) => p.category === selectedCategory)
    : plans;

  async function handlePayNow() {
    if (!selectedPlan) return;
    setResult(null);
    setShowConfirm(true);
  }

  async function handleConfirmRecharge() {
    if (!selectedPlan) return;
    setProcessing(true);
    try {
      const res = await instantRecharge({
        type: type!,
        operatorId: operatorId!,
        subscriberNumber: subscriberNumber!,
        amount: selectedPlan.amount,
        planId: selectedPlan.id,
      });

      if (res.success) {
        setShowConfirm(false);
        setSelectedPlan(null);
        const txStatus = res.transaction?.rechargeStatus;
        if (txStatus === "RECHARGE_PROCESSING" && res.transaction?.id) {
          router.replace(`/recharge/detail?id=${res.transaction.id}`);
        } else {
          setResult({ success: true, message: res.message || `₹${selectedPlan.amount} recharge for ${subscriberNumber} was successful!` });
        }
      } else {
        setResult({ success: false, message: res.error || "Recharge failed. Please try again." });
      }
    } catch {
      setResult({ success: false, message: "Something went wrong. Please try again." });
    } finally {
      setProcessing(false);
    }
  }

  const insufficient = walletBalance !== null && selectedPlan !== null && walletBalance < selectedPlan.amount;

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{operatorName}</Text>
          <Text style={styles.headerSubtitle}>{subscriberNumber}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {result && (
        <View style={[styles.resultBanner, result.success ? styles.resultSuccess : styles.resultError]}>
          <Ionicons
            name={result.success ? "checkmark-circle" : "close-circle"}
            size={20}
            color="#fff"
          />
          <Text style={styles.resultText}>{result.message}</Text>
          <Pressable onPress={() => setResult(null)} hitSlop={10}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
      )}

      {categories.length > 0 && (
        <View style={styles.categoryRow}>
          <FlatList
            data={categories}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.categoryChip,
                  selectedCategory === item && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategory(item)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    selectedCategory === item && styles.categoryTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredPlans}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PlanCard
              plan={item}
              selected={selectedPlan?.id === item.id}
              onSelect={() => setSelectedPlan(item)}
            />
          )}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 120,
            gap: 10,
          }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!filteredPlans.length}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="pricetag-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No plans available</Text>
            </View>
          }
        />
      )}

      {selectedPlan && (
        <View style={[styles.bottomBar, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedLabel}>Selected Plan</Text>
            <Text style={styles.selectedAmount}>₹{selectedPlan.amount}</Text>
            {!walletLoading && walletBalance !== null && (
              walletBalance < selectedPlan.amount ? (
                <View style={styles.balanceWarningRow}>
                  <Ionicons name="warning" size={12} color="#B45309" />
                  <Text style={styles.balanceWarningText}>Low balance · ₹{walletBalance.toFixed(2)}</Text>
                </View>
              ) : (
                <Text style={styles.balanceOkText}>Wallet: ₹{walletBalance.toFixed(2)}</Text>
              )
            )}
          </View>
          <Pressable
            style={styles.proceedBtn}
            onPress={handlePayNow}
          >
            <Text style={styles.proceedBtnText}>Pay Now</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </Pressable>
        </View>
      )}

      <Modal
        visible={showConfirm}
        transparent
        animationType="slide"
        onRequestClose={() => !processing && setShowConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>Confirm Recharge</Text>

            <View style={styles.rechargeDetails}>
              <View style={styles.rechargeRow}>
                <Text style={styles.rechargeLabel}>Number</Text>
                <Text style={styles.rechargeValue}>{subscriberNumber}</Text>
              </View>
              <View style={styles.rechargeRow}>
                <Text style={styles.rechargeLabel}>Operator</Text>
                <Text style={styles.rechargeValue}>{operatorName}</Text>
              </View>
              <View style={styles.rechargeRow}>
                <Text style={styles.rechargeLabel}>Plan Amount</Text>
                <Text style={[styles.rechargeValue, { color: Colors.primary, fontFamily: "Inter_700Bold" }]}>₹{selectedPlan?.amount}</Text>
              </View>
              {selectedPlan?.validity && (
                <View style={styles.rechargeRow}>
                  <Text style={styles.rechargeLabel}>Validity</Text>
                  <Text style={styles.rechargeValue}>{selectedPlan.validity}</Text>
                </View>
              )}
            </View>

            <View style={styles.walletSection}>
              <Ionicons name="wallet-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.walletLabel}>Wallet Balance</Text>
              {walletLoading ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={[styles.walletBalance, insufficient && styles.walletInsufficient]}>
                  ₹{walletBalance?.toFixed(2) ?? "0.00"}
                </Text>
              )}
            </View>

            {insufficient && (
              <View style={styles.insufficientBanner}>
                <Ionicons name="warning" size={16} color="#B45309" />
                <Text style={styles.insufficientText}>
                  Insufficient balance. Please add money to your wallet.
                </Text>
              </View>
            )}

            {result && !result.success && (
              <View style={styles.errorBanner}>
                <Ionicons name="close-circle" size={16} color="#DC2626" />
                <Text style={styles.errorBannerText}>{result.message}</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => { setShowConfirm(false); setResult(null); }}
                disabled={processing}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmBtn,
                  (insufficient || processing || walletLoading) && styles.confirmBtnDisabled,
                ]}
                onPress={handleConfirmRecharge}
                disabled={!!insufficient || processing || walletLoading}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Confirm & Recharge</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  resultSuccess: {
    backgroundColor: "#16A34A",
  },
  resultError: {
    backgroundColor: "#DC2626",
  },
  resultText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#fff",
  },
  categoryRow: {
    paddingVertical: 14,
  },
  categoryChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  categoryTextActive: {
    color: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  planCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 8,
  },
  planCardSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  planTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  planAmount: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  planAmountSelected: {
    color: "#fff",
  },
  validityBadge: {
    backgroundColor: Colors.primaryLighter,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  validityBadgeSelected: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  validityText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  validityTextSelected: {
    color: "#fff",
  },
  planDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  planDescSelected: {
    color: "rgba(255,255,255,0.85)",
  },
  planDetails: {
    flexDirection: "row",
    gap: 20,
    marginTop: 4,
  },
  planDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  planDetailText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    gap: 16,
  },
  selectedInfo: {
    gap: 2,
    flex: 1,
  },
  selectedLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  selectedAmount: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  balanceWarningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  balanceWarningText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#B45309",
  },
  balanceOkText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  proceedBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
  },
  proceedBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  rechargeDetails: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  rechargeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rechargeLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  rechargeValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  walletSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primaryLighter,
    borderRadius: 12,
    padding: 14,
  },
  walletLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  walletBalance: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
  walletInsufficient: {
    color: "#DC2626",
  },
  insufficientBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    padding: 12,
  },
  insufficientText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#92400E",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    padding: 12,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#991B1B",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
