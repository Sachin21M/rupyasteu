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
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getAepsBanks, performAepsTransaction } from "@/lib/api";
import type { AepsBank } from "@/shared/schema";

export default function AepsTransactionScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type: string; label: string; requiresAmount: string }>();
  const txType = params.type || "BALANCE_ENQUIRY";
  const txLabel = params.label || "AEPS Transaction";
  const requiresAmount = params.requiresAmount === "1";

  const [aadhaar, setAadhaar] = useState("");
  const [mobile, setMobile] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedBank, setSelectedBank] = useState<AepsBank | null>(null);
  const [banks, setBanks] = useState<AepsBank[]>([]);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [banksLoading, setBanksLoading] = useState(true);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    loadBanks();
  }, []);

  async function loadBanks() {
    try {
      const result = await getAepsBanks();
      if (result.banks && result.banks.length > 0) {
        setBanks(result.banks);
      }
    } catch {
      setBanks([
        { iinno: "607094", bankName: "State Bank of India" },
        { iinno: "608001", bankName: "Punjab National Bank" },
        { iinno: "508505", bankName: "Bank of India" },
        { iinno: "607161", bankName: "Bank of Baroda" },
        { iinno: "607387", bankName: "Union Bank of India" },
      ]);
    } finally {
      setBanksLoading(false);
    }
  }

  const isValid = aadhaar.length === 12 && /^[6-9]\d{9}$/.test(mobile) && selectedBank && (!requiresAmount || (parseInt(amount) > 0));

  async function handleSubmit() {
    if (!isValid || !selectedBank) return;
    setLoading(true);
    try {
      const result = await performAepsTransaction({
        type: txType,
        aadhaarNumber: aadhaar,
        customerMobile: mobile,
        bankIin: selectedBank.iinno,
        bankName: selectedBank.bankName,
        amount: requiresAmount ? parseInt(amount) : undefined,
      });

      router.replace({
        pathname: "/aeps/result",
        params: {
          success: result.success ? "1" : "0",
          type: txType,
          label: txLabel,
          message: result.message || "",
          balance: result.balance || "",
          referenceNo: result.referenceNo || "",
          miniStatement: result.miniStatement ? JSON.stringify(result.miniStatement) : "",
          amount: requiresAmount ? amount : "0",
          bankName: selectedBank.bankName,
          aadhaarMasked: "XXXX-XXXX-" + aadhaar.slice(-4),
        },
      });
    } catch (err: any) {
      Alert.alert("Error", err.message || "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  const filteredBanks = bankSearch
    ? banks.filter((b) => b.bankName.toLowerCase().includes(bankSearch.toLowerCase()))
    : banks;

  if (showBankPicker) {
    return (
      <View style={[styles.container, { paddingTop: topPadding + 12 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => setShowBankPicker(false)} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Select Bank</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search bank..."
            placeholderTextColor={Colors.textTertiary}
            value={bankSearch}
            onChangeText={setBankSearch}
            autoFocus
          />
        </View>
        {banksLoading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {filteredBanks.map((bank) => (
              <Pressable
                key={bank.iinno}
                style={({ pressed }) => [styles.bankItem, pressed && { backgroundColor: Colors.primaryLight }]}
                onPress={() => {
                  setSelectedBank(bank);
                  setShowBankPicker(false);
                  setBankSearch("");
                }}
              >
                <View style={styles.bankIcon}>
                  <Ionicons name="business" size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bankName}>{bank.bankName}</Text>
                  <Text style={styles.bankIin}>IIN: {bank.iinno}</Text>
                </View>
                {selectedBank?.iinno === bank.iinno && (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: (bottomPadding || 24) + 20 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{txLabel}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.form}>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Aadhaar Number</Text>
          <View style={[styles.inputRow, aadhaar.length === 12 && styles.inputRowValid]}>
            <MaterialCommunityIcons name="card-account-details" size={20} color={Colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="Enter 12-digit Aadhaar"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="number-pad"
              maxLength={12}
              value={aadhaar}
              onChangeText={(t) => setAadhaar(t.replace(/[^0-9]/g, ""))}
              testID="aadhaar-input"
            />
            {aadhaar.length === 12 && <Ionicons name="checkmark-circle" size={20} color={Colors.success} />}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Customer Mobile</Text>
          <View style={[styles.inputRow, /^[6-9]\d{9}$/.test(mobile) && styles.inputRowValid]}>
            <Ionicons name="call" size={20} color={Colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="Enter 10-digit mobile"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="phone-pad"
              maxLength={10}
              value={mobile}
              onChangeText={(t) => setMobile(t.replace(/[^0-9]/g, ""))}
              testID="mobile-input"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Bank</Text>
          <Pressable
            style={[styles.inputRow, selectedBank && styles.inputRowValid]}
            onPress={() => setShowBankPicker(true)}
          >
            <Ionicons name="business" size={20} color={Colors.textSecondary} />
            <Text style={[styles.inputPlaceholder, selectedBank && { color: Colors.text }]}>
              {selectedBank?.bankName || "Select Bank"}
            </Text>
            <Ionicons name="chevron-down" size={20} color={Colors.textTertiary} />
          </Pressable>
        </View>

        {requiresAmount && (
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Amount (₹)</Text>
            <View style={[styles.inputRow, parseInt(amount) > 0 && styles.inputRowValid]}>
              <Text style={{ fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary }}>₹</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter amount"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="number-pad"
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))}
                testID="amount-input"
              />
            </View>
          </View>
        )}

        <View style={styles.biometricNote}>
          <MaterialCommunityIcons name="fingerprint" size={24} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.biometricNoteTitle}>Biometric Verification</Text>
            <Text style={styles.biometricNoteSub}>
              In production, a UIDAI-certified fingerprint/iris device captures biometric data for authentication
            </Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            !isValid && styles.submitBtnDisabled,
            pressed && isValid && { opacity: 0.88, transform: [{ scale: 0.988 }] },
          ]}
          onPress={handleSubmit}
          disabled={!isValid || loading}
          testID="submit-btn"
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="fingerprint" size={22} color="#fff" />
              <Text style={styles.submitBtnText}>Authenticate & Proceed</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
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
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  form: {
    paddingHorizontal: 20,
    gap: 18,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 54,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    gap: 12,
  },
  inputRowValid: {
    borderColor: Colors.success,
    backgroundColor: Colors.successLight + "30",
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    height: "100%",
  },
  inputPlaceholder: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textTertiary,
  },
  biometricNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.primaryLight,
    borderRadius: 14,
    padding: 16,
    marginTop: 4,
  },
  biometricNoteTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  biometricNoteSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  submitBtn: {
    height: 56,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    height: "100%",
  },
  bankItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  bankIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  bankName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  bankIin: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    marginTop: 2,
  },
});
