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
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getOperators } from "@/lib/api";
import type { Operator } from "@/shared/schema";

const OPERATOR_COLORS: Record<string, string> = {
  jio: "#0A3A7A",
  airtel: "#ED1C24",
  vi: "#E60000",
  bsnl: "#1B75BC",
};

export default function MobileRechargeScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [operators, setOperators] = useState<Operator[]>([]);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOperators();
  }, []);

  async function loadOperators() {
    try {
      const data = await getOperators("MOBILE");
      setOperators(data.operators || []);
    } catch (error) {
      console.error("Failed to load operators:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    if (!selectedOperator || !phone || phone.length < 10) return;
    router.push({
      pathname: "/recharge/plans",
      params: {
        operatorId: selectedOperator.id,
        operatorName: selectedOperator.name,
        subscriberNumber: phone,
        type: "MOBILE",
      },
    });
  }

  const isValid = selectedOperator && /^[6-9]\d{9}$/.test(phone);
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Mobile Recharge</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inputSection}>
          <Text style={styles.label}>Mobile Number</Text>
          <View style={styles.phoneRow}>
            <View style={styles.prefix}>
              <Text style={styles.prefixText}>+91</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              placeholder="Enter 10 digit number"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ""))}
            />
          </View>
        </View>

        <View style={styles.operatorSection}>
          <Text style={styles.label}>Select Operator</Text>
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <View style={styles.operatorGrid}>
              {operators.map((op) => {
                const color = OPERATOR_COLORS[op.id] || Colors.primary;
                const selected = selectedOperator?.id === op.id;
                return (
                  <Pressable
                    key={op.id}
                    style={[
                      styles.operatorCard,
                      selected && { borderColor: color, borderWidth: 2 },
                    ]}
                    onPress={() => setSelectedOperator(op)}
                  >
                    <View style={[styles.operatorIcon, { backgroundColor: color + "15" }]}>
                      <Text style={[styles.operatorInitial, { color }]}>
                        {op.name.charAt(0)}
                      </Text>
                    </View>
                    <Text style={styles.operatorName}>{op.name}</Text>
                    {selected && (
                      <View style={[styles.checkMark, { backgroundColor: color }]}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
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
  phoneRow: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  prefix: {
    paddingHorizontal: 16,
    justifyContent: "center",
    backgroundColor: Colors.surfaceSecondary,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  prefixText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    letterSpacing: 1,
  },
  operatorSection: {
    paddingHorizontal: 20,
  },
  operatorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  operatorCard: {
    width: "47%",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  operatorIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  operatorInitial: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  operatorName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "center",
  },
  checkMark: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
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
