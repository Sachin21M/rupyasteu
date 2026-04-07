import { useState, useEffect, useRef } from "react";
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
import { getAepsBanks, getAepsMerchant, performAepsTransaction } from "@/lib/api";
import { discoverRdDevice, captureFingerprint, isSimulated } from "@/lib/rd-service";
import type { RdDeviceInfo } from "@/lib/rd-service";
import type { AepsBank } from "@/shared/schema";
import RdServiceBridge from "@/lib/RdServiceBridge";
import type { RdBridgeHandle } from "@/lib/RdServiceBridge";

type MerchantStatus = {
  kycStatus: string;
  dailyAuthDone: boolean;
} | null;

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
  const [biometricCaptured, setBiometricCaptured] = useState(false);
  const [biometricData, setBiometricData] = useState("");
  const [capturingBiometric, setCapturingBiometric] = useState(false);
  const [rdDevice, setRdDevice] = useState<RdDeviceInfo | null>(null);
  const [rdChecking, setRdChecking] = useState(false);
  const [merchantStatus, setMerchantStatus] = useState<MerchantStatus>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const rdBridgeRef = useRef<RdBridgeHandle>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    loadBanks();
    checkMerchantStatus();
    const t = setTimeout(() => checkRdDevice(), 1500);
    return () => clearTimeout(t);
  }, []);

  async function checkRdDevice() {
    if (Platform.OS === "web") return;
    if (!rdBridgeRef.current) return;
    setRdChecking(true);
    try {
      const result = await discoverRdDevice(rdBridgeRef.current);
      setRdDevice(result.device);
    } catch {}
    setRdChecking(false);
  }

  async function checkMerchantStatus() {
    try {
      const result = await getAepsMerchant();
      setMerchantStatus({
        kycStatus: result.merchant?.kycStatus || "NOT_STARTED",
        dailyAuthDone: result.dailyAuthenticated || false,
      });
    } catch {
      setMerchantStatus({ kycStatus: "NOT_STARTED", dailyAuthDone: false });
    } finally {
      setCheckingStatus(false);
    }
  }

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

  async function handleCaptureBiometric() {
    setCapturingBiometric(true);
    if (!rdBridgeRef.current) {
      Alert.alert("Not Ready", "Biometric bridge is initializing. Please try again in a moment.");
      setCapturingBiometric(false);
      return;
    }
    try {
      const result = await captureFingerprint(rdBridgeRef.current, rdDevice?.port);
      if (result.success) {
        setBiometricData(result.pidData);
        setBiometricCaptured(true);
        if (result.deviceInfo) setRdDevice(result.deviceInfo);
        if (isSimulated()) {
          Alert.alert("Biometric Captured", "Simulated biometric data captured for web testing.");
        } else {
          const dev = result.deviceInfo;
          Alert.alert("Biometric Captured", `Fingerprint captured successfully.\n\nDevice: ${dev?.manufacturer} ${dev?.model}\nSerial: ${dev?.serialNo}`);
        }
      } else {
        Alert.alert("Capture Failed", result.error || "Could not capture biometric data.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Biometric capture failed");
    } finally {
      setCapturingBiometric(false);
    }
  }

  const isValid = aadhaar.length === 12 && /^[6-9]\d{9}$/.test(mobile) && selectedBank && (!requiresAmount || (parseInt(amount) > 0)) && biometricCaptured;

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
        fingerprintData: biometricData,
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

  if (checkingStatus) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: 16, fontFamily: "Inter_500Medium", color: Colors.textSecondary }}>Checking AEPS status...</Text>
      </View>
    );
  }

  const kycNotComplete = merchantStatus && merchantStatus.kycStatus !== "COMPLETED";
  const authNotDone = merchantStatus && !merchantStatus.dailyAuthDone;

  if (kycNotComplete) {
    return (
      <View style={[styles.container, { paddingTop: topPadding + 12 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{txLabel}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.gateCard}>
          <MaterialCommunityIcons name="shield-alert" size={48} color="#F59E0B" />
          <Text style={styles.gateTitle}>Merchant Onboarding Required</Text>
          <Text style={styles.gateSub}>
            You need to complete AEPS merchant onboarding (KYC) before performing transactions. Please visit the AEPS Services page to begin onboarding.
          </Text>
          <Pressable
            style={styles.gateBtn}
            onPress={() => router.replace("/aeps")}
          >
            <Text style={styles.gateBtnText}>Go to AEPS Services</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (authNotDone) {
    return (
      <View style={[styles.container, { paddingTop: topPadding + 12 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{txLabel}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.gateCard}>
          <MaterialCommunityIcons name="fingerprint" size={48} color="#6366F1" />
          <Text style={styles.gateTitle}>Daily Authentication Required</Text>
          <Text style={styles.gateSub}>
            You must complete daily 2FA biometric authentication before performing AEPS transactions. Please visit the AEPS Services page to authenticate.
          </Text>
          <Pressable
            style={[styles.gateBtn, { backgroundColor: "#6366F1" }]}
            onPress={() => router.replace("/aeps")}
          >
            <Text style={styles.gateBtnText}>Go to AEPS Services</Text>
          </Pressable>
        </View>
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
            {txType === "AADHAAR_PAY" && parseInt(amount) > 0 && (
              <View style={{ marginTop: 8, backgroundColor: "#FFF7ED", borderRadius: 8, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="information-circle" size={16} color="#F59E0B" />
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#92400E", flex: 1 }}>
                  Service charge: 0.531% = ₹{(parseInt(amount) * 0.00531).toFixed(2)} (0.45% + 18% GST) will be collected from customer
                </Text>
              </View>
            )}
          </View>
        )}

        {Platform.OS !== "web" && (
          <View style={styles.rdStatusRow}>
            <View style={[styles.rdDot, { backgroundColor: rdDevice ? Colors.success : "#EF4444" }]} />
            <Text style={[styles.rdStatusText, { color: rdDevice ? Colors.success : Colors.textSecondary }]}>
              {rdChecking ? "Scanning for RD device..." : rdDevice ? `${rdDevice.manufacturer} ${rdDevice.model} connected` : "No RD device detected"}
            </Text>
            {!rdDevice && !rdChecking && (
              <Pressable onPress={checkRdDevice} hitSlop={8}>
                <Ionicons name="refresh" size={18} color={Colors.primary} />
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.biometricSection}>
          <Text style={styles.fieldLabel}>Biometric Verification</Text>
          <Pressable
            style={[styles.biometricBtn, biometricCaptured && styles.biometricBtnCaptured]}
            onPress={handleCaptureBiometric}
            disabled={capturingBiometric}
          >
            {capturingBiometric ? (
              <ActivityIndicator size={32} color={Colors.primary} />
            ) : (
              <MaterialCommunityIcons
                name="fingerprint"
                size={32}
                color={biometricCaptured ? Colors.success : Colors.primary}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.biometricBtnTitle, biometricCaptured && { color: Colors.success }]}>
                {capturingBiometric ? "Place finger on scanner..." : biometricCaptured ? "Biometric Captured" : "Capture Biometric"}
              </Text>
              <Text style={styles.biometricBtnSub}>
                {capturingBiometric
                  ? "Waiting for fingerprint capture from RD device"
                  : biometricCaptured
                  ? `${rdDevice ? rdDevice.manufacturer + " " + rdDevice.model : "Fingerprint"} data ready`
                  : "Tap to capture fingerprint via RD device"}
              </Text>
            </View>
            {biometricCaptured ? (
              <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
            ) : capturingBiometric ? null : (
              <Ionicons name="finger-print" size={24} color={Colors.primary} />
            )}
          </Pressable>
          {biometricCaptured && (
            <Pressable onPress={handleCaptureBiometric} disabled={capturingBiometric} style={styles.recaptureBtn}>
              <Ionicons name="refresh" size={16} color={Colors.primary} />
              <Text style={styles.recaptureBtnText}>Re-capture</Text>
            </Pressable>
          )}
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

      {Platform.OS !== "web" && (
        <RdServiceBridge ref={rdBridgeRef} />
      )}
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
  rdStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  rdDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rdStatusText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  recaptureBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  recaptureBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  biometricSection: {
    gap: 8,
    marginTop: 4,
  },
  biometricBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.primaryLight,
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: "transparent",
    borderStyle: "dashed",
  },
  biometricBtnCaptured: {
    backgroundColor: Colors.successLight + "30",
    borderColor: Colors.success,
    borderStyle: "solid",
  },
  biometricBtnTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  biometricBtnSub: {
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
  gateCard: {
    margin: 20,
    padding: 28,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    alignItems: "center",
    gap: 14,
  },
  gateTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  gateSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  gateBtn: {
    height: 48,
    backgroundColor: "#F59E0B",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    marginTop: 8,
  },
  gateBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
