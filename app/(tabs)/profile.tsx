import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

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
