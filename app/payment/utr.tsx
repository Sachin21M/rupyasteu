import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { submitUtr } from "@/lib/api";

export default function UtrScreen() {
  const insets = useSafeAreaInsets();
  const { transactionId, amount, operatorName, subscriberNumber, upiVpa, upiNote } =
    useLocalSearchParams<{
      transactionId: string;
      amount: string;
      operatorName: string;
      subscriberNumber: string;
      upiVpa: string;
      upiNote: string;
    }>();

  const [utr, setUtr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isValidUtr = /^[A-Za-z0-9]{12,22}$/.test(utr.trim());

  async function handleOpenUpi() {
    const upiUrl = `upi://pay?pa=${upiVpa}&pn=RupyaSetu&am=${amount}&tn=${encodeURIComponent(upiNote || "Recharge")}&cu=INR`;
    try {
      await Linking.openURL(upiUrl);
    } catch {
      Alert.alert(
        "No UPI App Found",
        "Could not open a UPI app. Please make sure you have Google Pay, PhonePe, Paytm, or another UPI app installed.",
        [{ text: "OK" }]
      );
    }
  }

  async function handleSubmit() {
    if (!isValidUtr) return;

    setLoading(true);
    setError("");

    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      const result = await submitUtr(transactionId!, utr.trim());
      if (result.success) {
        router.replace({
          pathname: "/payment/status",
          params: { transactionId: transactionId! },
        });
      } else {
        setError(result.error || "Failed to submit UTR");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Complete Payment</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Amount to Pay</Text>
          <Text style={styles.amountValue}>₹{amount}</Text>
          <View style={styles.amountDetails}>
            <Text style={styles.amountDetailText}>{operatorName}</Text>
            <Text style={styles.amountDetailDot}>|</Text>
            <Text style={styles.amountDetailText}>{subscriberNumber}</Text>
          </View>
        </View>

        {Platform.OS !== "web" && (
          <Pressable
            style={({ pressed }) => [styles.upiButton, pressed && { opacity: 0.85 }]}
            onPress={handleOpenUpi}
          >
            <Ionicons name="wallet" size={24} color={Colors.primary} />
            <View style={styles.upiButtonContent}>
              <Text style={styles.upiButtonTitle}>Pay via UPI App</Text>
              <Text style={styles.upiButtonSubtitle}>Google Pay, PhonePe, Paytm, etc.</Text>
            </View>
            <Ionicons name="open-outline" size={20} color={Colors.primary} />
          </Pressable>
        )}

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>THEN</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.utrSection}>
          <View style={styles.utrHeaderRow}>
            <Ionicons name="receipt" size={20} color={Colors.primary} />
            <Text style={styles.utrTitle}>Enter UPI Reference Number (UTR)</Text>
          </View>
          <Text style={styles.utrSubtitle}>
            After completing the payment, find the UTR/Reference number in your UPI app transaction details
          </Text>

          <TextInput
            style={[styles.utrInput, error ? styles.utrInputError : null]}
            placeholder="e.g., 312345678901"
            placeholderTextColor={Colors.textTertiary}
            value={utr}
            onChangeText={(text) => {
              setUtr(text.replace(/[^A-Za-z0-9]/g, ""));
              setError("");
            }}
            autoCapitalize="characters"
            maxLength={22}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.utrHints}>
            <View style={styles.hintRow}>
              <Ionicons name="information-circle" size={16} color={Colors.textTertiary} />
              <Text style={styles.hintText}>UTR is 12-22 characters long</Text>
            </View>
            <View style={styles.hintRow}>
              <Ionicons name="information-circle" size={16} color={Colors.textTertiary} />
              <Text style={styles.hintText}>Only alphanumeric characters allowed</Text>
            </View>
            <View style={styles.hintRow}>
              <Ionicons name="shield-checkmark" size={16} color={Colors.primary} />
              <Text style={styles.hintText}>Each UTR can only be used once</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
        <Pressable
          style={[styles.submitBtn, !isValidUtr && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isValidUtr || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.submitBtnText}>Submit & Verify</Text>
            </>
          )}
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
  amountCard: {
    margin: 20,
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  amountLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
  },
  amountValue: {
    fontSize: 40,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  amountDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  amountDetailText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.8)",
  },
  amountDetailDot: {
    color: "rgba(255,255,255,0.5)",
  },
  upiButton: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 14,
    borderWidth: 1.5,
    borderColor: Colors.primary + "30",
    marginBottom: 8,
  },
  upiButtonContent: {
    flex: 1,
    gap: 2,
  },
  upiButtonTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  upiButtonSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  utrSection: {
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 22,
    gap: 12,
  },
  utrHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  utrTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  utrSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  utrInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    letterSpacing: 1,
    backgroundColor: Colors.surfaceSecondary,
  },
  utrInputError: {
    borderColor: Colors.error,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.error,
  },
  utrHints: {
    gap: 8,
    marginTop: 4,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hintText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
