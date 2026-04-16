import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

import { LOW_BALANCE_KEY, DEFAULT_THRESHOLD } from "@/constants/wallet";

const PRESETS = [25, 50, 100, 200, 500];

function MenuItem({ icon, label, onPress, danger }: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <Ionicons
        name={icon as any}
        size={22}
        color={danger ? Colors.error : Colors.textSecondary}
      />
      <Text style={[styles.menuLabel, danger && { color: Colors.error }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [inputError, setInputError] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(LOW_BALANCE_KEY).then((val) => {
      if (val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed > 0) setThreshold(parsed);
      }
    });
  }, []);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  function openThresholdModal() {
    setCustomInput("");
    setInputError("");
    setShowThresholdModal(true);
  }

  async function saveThreshold(value: number) {
    if (value < 1 || value > 10000) {
      setInputError("Please enter an amount between ₹1 and ₹10,000.");
      return;
    }
    await AsyncStorage.setItem(LOW_BALANCE_KEY, String(value));
    setThreshold(value);
    setShowThresholdModal(false);
  }

  async function handleCustomSave() {
    const val = parseInt(customInput.trim(), 10);
    if (isNaN(val) || val <= 0) {
      setInputError("Please enter a valid amount.");
      return;
    }
    await saveThreshold(val);
  }

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 + 34 : 100 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <View style={styles.profileCard}>
        <Image
          source={require("@/assets/images/rupyasetu-profile-logo.png")}
          style={styles.profileLogo}
          resizeMode="contain"
        />
        <Text style={styles.profileName}>{user?.name || "Set your name"}</Text>
        <Text style={styles.profilePhone}>+91 {user?.phone}</Text>
      </View>

      <View style={styles.menuSection}>
        <MenuItem
          icon="person-outline"
          label="Edit Profile"
          onPress={() => router.push("/edit-profile")}
        />
        <MenuItem
          icon="receipt-outline"
          label="Transaction History"
          onPress={() => router.push("/(tabs)/history")}
        />
        <MenuItem
          icon="shield-checkmark-outline"
          label="Privacy & Security"
          onPress={() => router.push("/privacy")}
        />
        <MenuItem
          icon="help-circle-outline"
          label="Help & Support"
          onPress={() => router.push("/help")}
        />
        <MenuItem
          icon="information-circle-outline"
          label="About RupyaSetu"
          onPress={() => router.push("/about")}
        />
      </View>

      <View style={styles.menuSection}>
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
          onPress={openThresholdModal}
          testID="low-balance-threshold-setting"
        >
          <Ionicons name="notifications-outline" size={22} color={Colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.menuLabel}>Low Balance Alert</Text>
            <Text style={styles.menuSubLabel}>Warn when below ₹{threshold}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </Pressable>
      </View>

      <View style={styles.menuSection}>
        <MenuItem
          icon="log-out-outline"
          label="Logout"
          onPress={handleLogout}
          danger
        />
      </View>

      <Text style={styles.version}>RupyaSetu v1.0.0</Text>

      <Modal
        visible={showThresholdModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowThresholdModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Low Balance Alert</Text>
              <Text style={styles.modalSubtitle}>
                Get a warning on the home screen when your wallet balance falls below this amount.
              </Text>

              <View style={styles.presetRow}>
                {PRESETS.map((p) => (
                  <Pressable
                    key={p}
                    style={[styles.presetChip, threshold === p && styles.presetChipActive]}
                    onPress={() => saveThreshold(p)}
                  >
                    <Text style={[styles.presetChipText, threshold === p && styles.presetChipTextActive]}>
                      ₹{p}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.orText}>or enter custom amount</Text>

              <View style={styles.customRow}>
                <View style={styles.inputWrap}>
                  <Text style={styles.currencyPrefix}>₹</Text>
                  <TextInput
                    style={styles.customInput}
                    placeholder="e.g. 150"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="number-pad"
                    value={customInput}
                    onChangeText={(t) => { setCustomInput(t); setInputError(""); }}
                    returnKeyType="done"
                    onSubmitEditing={handleCustomSave}
                  />
                </View>
                <Pressable style={styles.saveBtn} onPress={handleCustomSave}>
                  <Text style={styles.saveBtnText}>Set</Text>
                </Pressable>
              </View>

              {inputError ? (
                <Text style={styles.inputError}>{inputError}</Text>
              ) : null}

              <Pressable style={styles.cancelBtn} onPress={() => setShowThresholdModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
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
  profileCard: {
    alignItems: "center",
    backgroundColor: Colors.surface,
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 28,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 8,
  },
  profileLogo: {
    width: 100,
    height: 80,
    marginBottom: 8,
  },
  profileName: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  profilePhone: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  menuSection: {
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    marginTop: 8,
    marginBottom: 16,
  },
  menuSubLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
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
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  presetChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  presetChipText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  presetChipTextActive: {
    color: "#fff",
  },
  orText: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
  },
  customRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
  },
  currencyPrefix: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginRight: 4,
  },
  customInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    paddingVertical: 14,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  inputError: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.error,
    textAlign: "center",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
