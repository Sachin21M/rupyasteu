import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getOperators } from "@/lib/api";
import type { Operator } from "@/shared/schema";

const DTH_COLORS: Record<string, string> = {
  tatasky: "#1E3A6F",
  dishtv: "#F7931E",
  d2h: "#D32F2F",
  sundirect: "#FF6600",
  airteldth: "#ED1C24",
};

export default function DthRechargeScreen() {
  const insets = useSafeAreaInsets();
  const [subscriberId, setSubscriberId] = useState("");
  const [operators, setOperators] = useState<Operator[]>([]);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOperators();
  }, []);

  async function loadOperators() {
    try {
      const data = await getOperators("DTH");
      setOperators(data.operators || []);
    } catch (error) {
      console.error("Failed to load operators:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    if (!selectedOperator || !subscriberId || subscriberId.length < 8) return;
    router.push({
      pathname: "/recharge/plans",
      params: {
        operatorId: selectedOperator.id,
        operatorName: selectedOperator.name,
        subscriberNumber: subscriberId,
        type: "DTH",
      },
    });
  }

  const isValid = selectedOperator && subscriberId.length >= 8;
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>DTH Recharge</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inputSection}>
          <Text style={styles.label}>Subscriber ID / Registered Mobile</Text>
          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="satellite-uplink" size={22} color={Colors.textSecondary} style={{ marginLeft: 16 }} />
            <TextInput
              style={styles.input}
              placeholder="Enter subscriber ID"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="default"
              value={subscriberId}
              onChangeText={setSubscriberId}
            />
          </View>
        </View>

        <View style={styles.operatorSection}>
          <Text style={styles.label}>Select DTH Provider</Text>
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <View style={styles.operatorList}>
              {operators.map((op) => {
                const color = DTH_COLORS[op.id] || Colors.primary;
                const selected = selectedOperator?.id === op.id;
                return (
                  <Pressable
                    key={op.id}
                    style={[
                      styles.operatorRow,
                      selected && { borderColor: color, borderWidth: 2, backgroundColor: color + "08" },
                    ]}
                    onPress={() => setSelectedOperator(op)}
                  >
                    <View style={[styles.operatorIcon, { backgroundColor: color + "15" }]}>
                      <Text style={[styles.operatorInitial, { color }]}>
                        {op.name.charAt(0)}
                      </Text>
                    </View>
                    <Text style={styles.operatorName}>{op.name}</Text>
                    {selected ? (
                      <View style={[styles.radioSelected, { borderColor: color }]}>
                        <View style={[styles.radioInner, { backgroundColor: color }]} />
                      </View>
                    ) : (
                      <View style={styles.radio} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
        <Pressable
          style={[styles.continueBtn, !isValid && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!isValid}
        >
          <Text style={styles.continueBtnText}>Browse Plans</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      </View>
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
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  content: {
    flex: 1,
  },
  inputSection: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    gap: 8,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 16,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  operatorSection: {
    paddingHorizontal: 20,
  },
  operatorList: {
    gap: 10,
  },
  operatorRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  operatorIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  operatorInitial: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  operatorName: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  radioSelected: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
  },
  continueBtnDisabled: {
    opacity: 0.5,
  },
  continueBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
