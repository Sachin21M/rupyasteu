import { fetch } from "expo/fetch";
import { getApiUrl } from "./query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem("rupyasetu_token");
}

async function authFetch(route: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url.toString(), {
    ...options,
    headers,
  });

  return res;
}

export async function sendOtp(phone: string) {
  const res = await authFetch("/api/auth/send-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  return res.json();
}

export async function verifyOtp(phone: string, otp: string) {
  const res = await authFetch("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone, otp }),
  });
  return res.json();
}

export async function getOperators(type?: string) {
  const query = type ? `?type=${type}` : "";
  const res = await authFetch(`/api/operators${query}`);
  return res.json();
}

export async function getPlans(operatorId: string, category?: string) {
  const query = category ? `?category=${category}` : "";
  const res = await authFetch(`/api/plans/${operatorId}${query}`);
  return res.json();
}

export async function initiateRecharge(data: {
  type: string;
  operatorId: string;
  subscriberNumber: string;
  amount: number;
  planId?: string;
}) {
  const res = await authFetch("/api/recharge/initiate", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function instantRecharge(data: {
  type: string;
  operatorId: string;
  subscriberNumber: string;
  amount: number;
  planId?: string;
}) {
  const res = await authFetch("/api/recharge/instant", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function submitUtr(transactionId: string, utr: string) {
  const res = await authFetch("/api/recharge/submit-utr", {
    method: "POST",
    body: JSON.stringify({ transactionId, utr }),
  });
  return res.json();
}

export async function getTransactions() {
  const res = await authFetch("/api/transactions");
  return res.json();
}

export async function getTransaction(id: string) {
  const res = await authFetch(`/api/transactions/${id}`);
  return res.json();
}

export async function getUserProfile() {
  const res = await authFetch("/api/user/profile");
  return res.json();
}

export async function updateUserProfile(name: string) {
  const res = await authFetch("/api/user/profile", {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function updateLowBalanceThreshold(threshold: number) {
  const res = await authFetch("/api/user/profile", {
    method: "PUT",
    body: JSON.stringify({ lowBalanceThreshold: threshold }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to save threshold (${res.status})`);
  }
  return res.json();
}

async function handleAepsResponse(res: Response) {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function getAepsBanks() {
  const res = await authFetch("/api/aeps/banks");
  return handleAepsResponse(res);
}

export async function getAepsMerchant() {
  const res = await authFetch("/api/aeps/merchant");
  return handleAepsResponse(res);
}

export async function aepsOnboard(merchantCode: string) {
  const res = await authFetch("/api/aeps/onboard", {
    method: "POST",
    body: JSON.stringify({ merchantCode }),
  });
  return handleAepsResponse(res);
}

export async function aeps2faRegister(data: Record<string, unknown>) {
  const res = await authFetch("/api/aeps/2fa/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleAepsResponse(res);
}

export async function aeps2faAuthenticate(data: Record<string, unknown>) {
  const res = await authFetch("/api/aeps/2fa/authenticate", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleAepsResponse(res);
}

export async function performAepsTransaction(data: {
  type: string;
  aadhaarNumber: string;
  customerMobile: string;
  bankIin: string;
  bankName: string;
  amount?: number;
  latitude?: string;
  longitude?: string;
  fingerprintData?: string;
  pipe?: string;
}) {
  const res = await authFetch("/api/aeps/transaction", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleAepsResponse(res);
}

export async function aepsOnboardComplete(data: { status: string; merchantCode?: string }) {
  const res = await authFetch("/api/aeps/onboard/complete", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleAepsResponse(res);
}

export async function getAepsKycStatus() {
  const res = await authFetch("/api/aeps/kyc-status");
  return handleAepsResponse(res);
}

export async function kycWebviewComplete() {
  const res = await authFetch("/api/aeps/kyc-webview-complete", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return handleAepsResponse(res);
}

export async function getAepsTransactionStatus(id: string) {
  const res = await authFetch(`/api/aeps/transaction/${id}/status`);
  return handleAepsResponse(res);
}

export async function getAepsTransactions() {
  const res = await authFetch("/api/aeps/transactions");
  return handleAepsResponse(res);
}

export async function getWallet() {
  const res = await authFetch("/api/wallet");
  return handleAepsResponse(res);
}

export async function requestWalletRecharge(amount: number, utr: string) {
  const res = await authFetch("/api/wallet/recharge", {
    method: "POST",
    body: JSON.stringify({ amount, utr }),
  });
  return handleAepsResponse(res);
}

export async function getCommissionConfig() {
  const res = await authFetch("/api/wallet/commission");
  return handleAepsResponse(res);
}

export async function getCommissionBalance() {
  const res = await authFetch("/api/commission/balance");
  return handleAepsResponse(res);
}

export async function getCommissionHistory() {
  const res = await authFetch("/api/commission/history");
  return handleAepsResponse(res);
}

export async function getCommissionWithdrawals() {
  const res = await authFetch("/api/commission/withdrawals");
  return handleAepsResponse(res);
}

export async function requestCommissionWithdrawal(data: {
  amount: number;
  mode: "UPI" | "BANK";
  upiId?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountName?: string;
  bankName?: string;
}) {
  const res = await authFetch("/api/commission/withdraw", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleAepsResponse(res);
}
