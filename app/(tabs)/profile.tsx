import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  TextInput,
  Alert,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { updateUserProfile } from "@/lib/api";

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
  const { user, logout, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");

  async function handleSaveName() {
    if (!name.trim()) return;
    try {
      await updateUserProfile(name.trim());
      updateUser({ name: name.trim() });
      setEditing(false);
    } catch {
      Alert.alert("Error", "Failed to update name");
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
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
          source={require("@/assets/images/rupyasetu-logo.png")}
          style={styles.profileLogo}
          resizeMode="contain"
        />
        {editing ? (
          <View style={styles.editNameContainer}>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              placeholderTextColor={Colors.textTertiary}
              autoFocus
            />
            <View style={styles.editActions}>
              <Pressable onPress={() => setEditing(false)} style={styles.editActionBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </Pressable>
              <Pressable onPress={handleSaveName} style={[styles.editActionBtn, styles.saveBtn]}>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setEditing(true)}>
            <Text style={styles.profileName}>{user?.name || "Set your name"}</Text>
          </Pressable>
        )}
        <Text style={styles.profilePhone}>+91 {user?.phone}</Text>
      </View>

      <View style={styles.menuSection}>
        <MenuItem
          icon="person-outline"
          label="Edit Profile"
          onPress={() => setEditing(true)}
        />
        <MenuItem
          icon="receipt-outline"
          label="Transaction History"
          onPress={() => router.push("/(tabs)/history")}
        />
        <MenuItem
          icon="shield-checkmark-outline"
          label="Privacy & Security"
          onPress={() => {}}
        />
        <MenuItem
          icon="help-circle-outline"
          label="Help & Support"
          onPress={() => {}}
        />
        <MenuItem
          icon="information-circle-outline"
          label="About RupyaSetu"
          onPress={() => {}}
        />
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
  editNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    minWidth: 180,
  },
  editActions: {
    flexDirection: "row",
    gap: 8,
  },
  editActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  saveBtn: {
    backgroundColor: Colors.primary,
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
});
