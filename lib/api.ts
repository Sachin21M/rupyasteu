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
