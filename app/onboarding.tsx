import { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  FlatList,
  Dimensions,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const ONBOARDING_KEY = "rupyasetu_onboarding_seen";

const slides = [
  {
    id: "1",
    icon: "flash" as const,
    headline: "Recharge in Seconds",
    subtext: "Fast, simple and hassle-free mobile & DTH recharges.",
  },
  {
    id: "2",
    icon: "finger-print" as const,
    headline: "AEPS Banking",
    subtext: "Aadhaar-enabled payments — balance, withdrawal, mini statement & more.",
  },
  {
    id: "3",
    icon: "shield-checkmark" as const,
    headline: "100% Secure",
    subtext: "Your payments and data are protected with advanced security.",
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const markSeen = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    } catch {}
  }, []);

  const goToLogin = useCallback(async () => {
    await markSeen();
    router.replace("/login");
  }, [markSeen]);

  const handleNext = useCallback(() => {
    if (activeIndex < slides.length - 1) {
      const nextIndex = activeIndex + 1;
      flatListRef.current?.scrollToIndex({ index: nextIndex });
      setActiveIndex(nextIndex);
    } else {
      goToLogin();
    }
  }, [activeIndex, goToLogin]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderSlide = ({ item, index }: { item: typeof slides[0]; index: number }) => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];

    const iconScale = scrollX.interpolate({
      inputRange,
      outputRange: [0.6, 1, 0.6],
      extrapolate: "clamp",
    });

    const iconOpacity = scrollX.interpolate({
      inputRange,
      outputRange: [0, 1, 0],
      extrapolate: "clamp",
    });

    const textTranslate = scrollX.interpolate({
      inputRange,
      outputRange: [30, 0, -30],
      extrapolate: "clamp",
    });

    const textOpacity = scrollX.interpolate({
      inputRange,
      outputRange: [0, 1, 0],
      extrapolate: "clamp",
    });

    return (
      <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
        <View style={styles.illustrationArea}>
          <Animated.View
            style={[
              styles.iconCircle,
              { transform: [{ scale: iconScale }], opacity: iconOpacity },
            ]}
          >
            <View style={styles.iconRing}>
              <Ionicons name={item.icon} size={56} color="#FFFFFF" />
            </View>
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.textArea,
            {
              opacity: textOpacity,
              transform: [{ translateX: textTranslate }],
            },
          ]}
        >
          <Text style={styles.headline}>{item.headline}</Text>
          <Text style={styles.subtext}>{item.subtext}</Text>
        </Animated.View>
      </View>
    );
  };

  const isLast = activeIndex === slides.length - 1;

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: topPadding + 12 }]}>
        <View />
        <Pressable onPress={goToLogin} hitSlop={12}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <Animated.FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
        style={styles.flatList}
      />

      <View style={[styles.bottomArea, { paddingBottom: bottomPadding || 24 }]}>
        <View style={styles.pagination}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.cta,
            pressed && { opacity: 0.88, transform: [{ scale: 0.988 }] },
          ]}
          onPress={handleNext}
        >
          <Text style={styles.ctaText}>
            {isLast ? "Get Started" : "Next"}
          </Text>
          {!isLast && (
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  skipText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
  },
  flatList: {
    flex: 1,
  },
  slide: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  illustrationArea: {
    alignItems: "center",
    marginBottom: 48,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(46, 158, 91, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#2E9E5B",
    alignItems: "center",
    justifyContent: "center",
  },
  textArea: {
    alignItems: "center",
  },
  headline: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#1A1D26",
    textAlign: "center",
    marginBottom: 12,
  },
  subtext: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  bottomArea: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 24,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: "#2E9E5B",
  },
  dotInactive: {
    width: 8,
    backgroundColor: "rgba(46, 158, 91, 0.25)",
  },
  cta: {
    height: 54,
    backgroundColor: "#2E9E5B",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
});
