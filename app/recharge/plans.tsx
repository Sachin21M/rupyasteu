import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getPlans, initiateRecharge } from "@/lib/api";
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
  const [initiating, setInitiating] = useState(false);

  useEffect(() => {
    loadPlans();
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

  const filteredPlans = selectedCategory
    ? plans.filter((p) => p.category === selectedCategory)
    : plans;

  async function handleProceed() {
    if (!selectedPlan) return;
    setInitiating(true);
    try {
      const result = await initiateRecharge({
        type: type!,
        operatorId: operatorId!,
        subscriberNumber: subscriberNumber!,
        amount: selectedPlan.amount,
        planId: selectedPlan.id,
      });

      if (result.success) {
        router.push({
          pathname: "/payment/utr",
          params: {
            transactionId: result.transaction.id,
            amount: String(result.transaction.amount),
            operatorName: result.transaction.operatorName,
            subscriberNumber: result.transaction.subscriberNumber,
            upiVpa: result.upiDetails?.payeeVpa || "",
            upiNote: result.upiDetails?.note || "",
          },
        });
      }
    } catch (error) {
      console.error("Failed to initiate recharge:", error);
    } finally {
      setInitiating(false);
    }
  }

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
          </View>
          <Pressable
            style={[styles.proceedBtn, initiating && { opacity: 0.7 }]}
            onPress={handleProceed}
            disabled={initiating}
          >
            {initiating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.proceedBtnText}>Pay Now</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </Pressable>
        </View>
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
});
