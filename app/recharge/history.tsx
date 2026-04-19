import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Platform,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getTransactions } from "@/lib/api";
import type { Transaction } from "@/shared/schema";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

const TYPE_FILTERS = ["All", "Mobile", "DTH"] as const;
const DATE_FILTERS = ["All time", "7 days", "This month", "Custom"] as const;

type TypeFilter = typeof TYPE_FILTERS[number];
type DateFilter = typeof DATE_FILTERS[number];

function getDateRange(dateFilter: DateFilter): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (dateFilter === "7 days") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  if (dateFilter === "This month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to: now };
  }
  return { from: null, to: null };
}

function parseCustomDate(str: string): Date | null {
  const trimmed = str.trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return null;
  const parts = trimmed.split("/");
  const [d, m, y] = parts.map(Number);
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  if (y < 2000 || y > 2100) return null;
  const date = new Date(y, m - 1, d);
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) return null;
  return date;
}

function buildCsv(transactions: Transaction[]): string {
  const headers = ["Date", "Time", "Type", "Operator", "Subscriber Number", "Plan", "Amount (INR)", "Status"];
  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const rows = transactions.map((tx) => {
    const date = new Date(tx.createdAt);
    const formattedDate = date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
    const formattedTime = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const status = tx.rechargeStatus === "RECHARGE_SUCCESS" ? "Success" : tx.rechargeStatus === "RECHARGE_FAILED" ? "Failed" : "Pending";
    return [
      escape(formattedDate),
      escape(formattedTime),
      escape(tx.type === "MOBILE" ? "Mobile" : "DTH"),
      escape(tx.operatorName || ""),
      escape(tx.subscriberNumber || ""),
      escape(tx.planDescription || "Custom amount"),
      String(tx.amount),
      escape(status),
    ].join(",");
  });
  return [headers.map((h) => `"${h}"`).join(","), ...rows].join("\n");
}

async function exportCsv(transactions: Transaction[]) {
  if (transactions.length === 0) {
    Alert.alert("Nothing to export", "There are no transactions matching the current filters.");
    return;
  }
  const csv = buildCsv(transactions);
  const filename = `recharge-history-${Date.now()}.csv`;

  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + filename;
  await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: "Export Recharge History" });
  } else {
    Alert.alert("Exported", `File saved to: ${fileUri}`);
  }
}

function statusInfo(tx: Transaction) {
  const isSuccess = tx.rechargeStatus === "RECHARGE_SUCCESS";
  const isFailed = tx.rechargeStatus === "RECHARGE_FAILED";
  return {
    label: isSuccess ? "Success" : isFailed ? "Failed" : "Pending",
    color: isSuccess ? Colors.success : isFailed ? Colors.error : Colors.warning,
    bg: isSuccess ? Colors.successLight : isFailed ? Colors.errorLight : Colors.warningLight,
  };
}

function RechargeHistoryCard({ tx }: { tx: Transaction }) {
  const status = statusInfo(tx);
  const date = new Date(tx.createdAt);
  const formattedDate = date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const formattedTime = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const isMobile = tx.type === "MOBILE";

  return (
    <Pressable
      testID={`recharge-history-card-${tx.id}`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
      onPress={() => router.push({ pathname: "/recharge/detail", params: { transactionId: tx.id } })}
    >
      <View style={styles.cardTop}>
        <View style={[styles.iconBox, { backgroundColor: isMobile ? Colors.primaryLight : Colors.pendingLight }]}>
          <Ionicons
            name={isMobile ? "phone-portrait" : "tv"}
            size={22}
            color={isMobile ? Colors.primary : Colors.pending}
          />
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.operatorText}>{tx.operatorName}</Text>
          <Text style={styles.numberText}>{tx.subscriberNumber}</Text>
          <Text style={styles.planText} numberOfLines={1}>
            {tx.planDescription || "Custom amount"}
          </Text>
        </View>

        <View style={styles.cardRight}>
          <Text style={styles.amountText}>₹{tx.amount}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <Text style={styles.dateText}>{formattedDate} · {formattedTime}</Text>
        <View style={[styles.typeBadge, { backgroundColor: isMobile ? Colors.primaryLight : Colors.pendingLight }]}>
          <Text style={[styles.typeBadgeText, { color: isMobile ? Colors.primary : Colors.pending }]}>
            {isMobile ? "Mobile" : "DTH"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function CustomDateModal({
  visible,
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  onApply,
  onClose,
}: {
  visible: boolean;
  fromValue: string;
  toValue: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const fromDate = parseCustomDate(fromValue);
  const toDate = parseCustomDate(toValue);
  const hasFromError = fromValue.length === 10 && !fromDate;
  const hasToError = toValue.length === 10 && !toDate;
  const hasRangeError = !!(fromDate && toDate && fromDate > toDate);
  const canApply = !hasFromError && !hasToError && !hasRangeError && (!!fromDate || !!toDate);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>Custom Date Range</Text>
          <Text style={styles.modalHint}>Enter dates as DD/MM/YYYY</Text>

          <View style={styles.modalFieldRow}>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>From</Text>
              <TextInput
                testID="custom-date-from"
                style={[styles.modalInput, hasFromError && styles.modalInputError]}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={Colors.textTertiary}
                value={fromValue}
                onChangeText={onFromChange}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
              {hasFromError && (
                <Text style={styles.modalFieldError}>Invalid date</Text>
              )}
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>To</Text>
              <TextInput
                testID="custom-date-to"
                style={[styles.modalInput, hasToError && styles.modalInputError]}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={Colors.textTertiary}
                value={toValue}
                onChangeText={onToChange}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
              {hasToError && (
                <Text style={styles.modalFieldError}>Invalid date</Text>
              )}
            </View>
          </View>

          {hasRangeError && (
            <Text testID="custom-date-range-error" style={styles.modalRangeError}>
              "From" date must be before "To" date
            </Text>
          )}

          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalApplyBtn, !canApply && styles.modalApplyBtnDisabled]}
              onPress={canApply ? onApply : undefined}
              testID="custom-date-apply"
            >
              <Text style={styles.modalApplyText}>Apply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const FILTER_STORAGE_KEY = "recharge_history_filters";

export default function RechargeHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [dateFilter, setDateFilter] = useState<DateFilter>("All time");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedCustomFrom, setAppliedCustomFrom] = useState<Date | null>(null);
  const [appliedCustomTo, setAppliedCustomTo] = useState<Date | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const hasLoadedFilters = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(FILTER_STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          if (saved.typeFilter && TYPE_FILTERS.includes(saved.typeFilter)) {
            setTypeFilter(saved.typeFilter);
          }
          if (saved.dateFilter && DATE_FILTERS.includes(saved.dateFilter)) {
            setDateFilter(saved.dateFilter);
          }
          if (typeof saved.searchQuery === "string") {
            setSearchQuery(saved.searchQuery);
          }
          if (typeof saved.customFrom === "string") {
            setCustomFrom(saved.customFrom);
          }
          if (typeof saved.customTo === "string") {
            setCustomTo(saved.customTo);
          }
          if (saved.appliedCustomFromISO) {
            setAppliedCustomFrom(new Date(saved.appliedCustomFromISO));
          }
          if (saved.appliedCustomToISO) {
            setAppliedCustomTo(new Date(saved.appliedCustomToISO));
          }
        } catch {}
      }
      hasLoadedFilters.current = true;
    });
  }, []);

  useEffect(() => {
    if (!hasLoadedFilters.current) return;
    const payload = {
      typeFilter,
      dateFilter,
      searchQuery,
      customFrom,
      customTo,
      appliedCustomFromISO: appliedCustomFrom ? appliedCustomFrom.toISOString() : null,
      appliedCustomToISO: appliedCustomTo ? appliedCustomTo.toISOString() : null,
    };
    AsyncStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload));
  }, [typeFilter, dateFilter, searchQuery, customFrom, customTo, appliedCustomFrom, appliedCustomTo]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["transactions"],
    queryFn: getTransactions,
  });

  const allTransactions: Transaction[] = data?.transactions || [];

  const filtered = useMemo(() => {
    let result = allTransactions;

    if (typeFilter === "Mobile") result = result.filter((tx) => tx.type === "MOBILE");
    else if (typeFilter === "DTH") result = result.filter((tx) => tx.type === "DTH");

    if (dateFilter !== "All time") {
      let from: Date | null = null;
      let to: Date | null = null;
      if (dateFilter === "Custom") {
        from = appliedCustomFrom;
        to = appliedCustomTo;
      } else {
        ({ from, to } = getDateRange(dateFilter));
      }
      if (from) {
        result = result.filter((tx) => new Date(tx.createdAt) >= from!);
      }
      if (to) {
        const toEnd = new Date(to);
        toEnd.setHours(23, 59, 59, 999);
        result = result.filter((tx) => new Date(tx.createdAt) <= toEnd);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (tx) =>
          tx.subscriberNumber?.toLowerCase().includes(q) ||
          tx.operatorName?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [allTransactions, typeFilter, dateFilter, searchQuery, appliedCustomFrom, appliedCustomTo]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDateFilterPress = (f: DateFilter) => {
    if (f === "Custom") {
      setShowCustomModal(true);
    } else {
      setDateFilter(f);
      setAppliedCustomFrom(null);
      setAppliedCustomTo(null);
    }
  };

  const handleApplyCustom = () => {
    const from = parseCustomDate(customFrom);
    const to = parseCustomDate(customTo);
    setAppliedCustomFrom(from);
    setAppliedCustomTo(to);
    setDateFilter("Custom");
    setShowCustomModal(false);
  };

  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportCsv(filtered);
    } catch (err) {
      Alert.alert("Export failed", "Something went wrong while exporting. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [filtered, isExporting]);

  const activeFiltersCount =
    (typeFilter !== "All" ? 1 : 0) +
    (dateFilter !== "All time" ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const getEmptyMessage = () => {
    if (searchQuery.trim()) return `No results for "${searchQuery.trim()}"`;
    if (dateFilter !== "All time") return "No recharges in this period";
    if (typeFilter !== "All") return `No ${typeFilter} recharges yet`;
    return "Your mobile and DTH recharges will appear here";
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Pressable
          testID="recharge-history-back"
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Recharge History</Text>
        <Pressable
          testID="export-history-btn"
          style={({ pressed }) => [styles.exportBtn, pressed && { opacity: 0.7 }]}
          onPress={handleExport}
          disabled={isExporting || isLoading}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="download-outline" size={22} color={Colors.primary} />
          )}
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textTertiary} style={styles.searchIcon} />
          <TextInput
            testID="recharge-search-input"
            style={styles.searchInput}
            placeholder="Search by number or operator"
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && Platform.OS !== "ios" && (
            <Pressable onPress={() => setSearchQuery("")} testID="search-clear">
              <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.filterRow}>
          {TYPE_FILTERS.map((f) => (
            <Pressable
              key={f}
              testID={`type-filter-${f}`}
              style={[styles.filterChip, typeFilter === f && styles.filterChipActive]}
              onPress={() => setTypeFilter(f)}
            >
              <Text style={[styles.filterChipText, typeFilter === f && styles.filterChipTextActive]}>
                {f}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateFilterScrollContent}
          style={styles.dateFilterScroll}
        >
          {DATE_FILTERS.map((f) => {
            const isActive = dateFilter === f;
            return (
              <Pressable
                key={f}
                testID={`date-filter-${f.replace(" ", "-")}`}
                style={[styles.filterChip, styles.dateChip, isActive && styles.filterChipActive]}
                onPress={() => handleDateFilterPress(f)}
              >
                {f === "Custom" && isActive && (appliedCustomFrom || appliedCustomTo) ? (
                  <Ionicons name="calendar" size={13} color="#fff" style={{ marginRight: 4 }} />
                ) : null}
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {activeFiltersCount > 0 && (
        <View style={styles.activeFiltersRow}>
          <Text style={styles.resultCount}>
            {filtered.length} {filtered.length === 1 ? "result" : "results"}
          </Text>
          <Pressable
            testID="clear-filters"
            onPress={() => {
              setTypeFilter("All");
              setDateFilter("All time");
              setSearchQuery("");
              setCustomFrom("");
              setCustomTo("");
              setAppliedCustomFrom(null);
              setAppliedCustomTo(null);
            }}
          >
            <Text style={styles.clearFiltersText}>Clear filters</Text>
          </Pressable>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cloud-offline-outline" size={56} color={Colors.textTertiary} />
          <Text style={styles.emptyText}>Couldn't load history</Text>
          <Text style={styles.emptySubtext}>Check your connection and try again</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <RechargeHistoryCard tx={item} />}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: Platform.OS === "web" ? 34 : 40,
            paddingTop: 4,
            gap: 10,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          scrollEnabled={!!filtered.length}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name={searchQuery.trim() ? "search-outline" : "receipt-outline"}
                size={56}
                color={Colors.textTertiary}
              />
              <Text style={styles.emptyText}>
                {searchQuery.trim() ? "No results found" : "No recharge history"}
              </Text>
              <Text style={styles.emptySubtext}>{getEmptyMessage()}</Text>
            </View>
          }
        />
      )}

      <CustomDateModal
        visible={showCustomModal}
        fromValue={customFrom}
        toValue={customTo}
        onFromChange={setCustomFrom}
        onToChange={setCustomTo}
        onApply={handleApplyCustom}
        onClose={() => setShowCustomModal(false)}
      />
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
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  exportBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    paddingVertical: 0,
  },
  filterSection: {
    gap: 8,
    marginBottom: 4,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    flexWrap: "nowrap",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateChip: {
    paddingHorizontal: 12,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  activeFiltersRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  resultCount: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  clearFiltersText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  operatorText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  numberText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  planText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    marginTop: 2,
  },
  cardRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  amountText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  dateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  typeBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  retryBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    gap: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  modalHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    marginTop: -8,
  },
  modalFieldRow: {
    flexDirection: "row",
    gap: 12,
  },
  modalField: {
    flex: 1,
    gap: 6,
  },
  modalLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  modalApplyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
  },
  modalApplyText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  modalApplyBtnDisabled: {
    backgroundColor: Colors.textTertiary,
  },
  modalInputError: {
    borderColor: Colors.error,
  },
  modalFieldError: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.error,
    marginTop: 2,
  },
  modalRangeError: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.error,
    marginTop: -8,
  },
  dateFilterScroll: {
    flexShrink: 0,
  },
  dateFilterScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: "row",
  },
});
