import { z } from "zod";

export const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian mobile number");

export const otpSchema = z.string().regex(/^\d{4,6}$/, "Invalid OTP format");

export const utrSchema = z.string().regex(/^[A-Za-z0-9]{12,22}$/, "Invalid UTR format (12-22 alphanumeric characters)");

export const rechargeTypes = ["MOBILE", "DTH"] as const;
export type RechargeType = typeof rechargeTypes[number];

export const paymentStatuses = ["PAYMENT_PENDING", "PAYMENT_UNVERIFIED", "PAYMENT_VERIFIED", "PAYMENT_FAILED", "WALLET_PAYMENT"] as const;
export type PaymentStatus = typeof paymentStatuses[number];

export const rechargeStatuses = ["RECHARGE_PENDING", "RECHARGE_PROCESSING", "RECHARGE_SUCCESS", "RECHARGE_FAILED"] as const;
export type RechargeStatus = typeof rechargeStatuses[number];

export const aepsTransactionTypes = ["BALANCE_ENQUIRY", "MINI_STATEMENT", "CASH_WITHDRAWAL", "AADHAAR_PAY", "CASH_DEPOSIT"] as const;
export type AepsTransactionType = typeof aepsTransactionTypes[number];

export const aepsStatuses = ["AEPS_PENDING", "AEPS_PROCESSING", "AEPS_SUCCESS", "AEPS_FAILED"] as const;
export type AepsStatus = typeof aepsStatuses[number];

export interface User {
  id: string;
  phone: string;
  name?: string;
  lowBalanceThreshold?: number;
  createdAt: string;
}

export interface OtpRecord {
  phone: string;
  otp: string;
  expiresAt: number;
  attempts: number;
}

export interface Operator {
  id: string;
  name: string;
  type: RechargeType;
  icon: string;
}

export interface Plan {
  id: string;
  operatorId: string;
  amount: number;
  validity: string;
  description: string;
  data?: string;
  talktime?: string;
  category: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: RechargeType;
  operatorId: string;
  operatorName: string;
  subscriberNumber: string;
  amount: number;
  planId?: string;
  planDescription?: string;
  paymentStatus: PaymentStatus;
  rechargeStatus: RechargeStatus;
  utr?: string;
  paysprintRefId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AepsMerchant {
  id: string;
  userId: string;
  merchantCode: string;
  phone: string;
  firmName: string;
  kycStatus: "PENDING" | "COMPLETED" | "FAILED" | "NOT_STARTED";
  bankPipes: string;
  kycRedirectUrl?: string;
  createdBy?: string;
  twoFaRegistered?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AepsDailyAuth {
  id: string;
  userId: string;
  authDate: string;
  authenticated: boolean;
  createdAt: string;
}

export interface AepsTransaction {
  id: string;
  userId: string;
  type: AepsTransactionType;
  aadhaarMasked: string;
  customerMobile: string;
  bankName: string;
  bankIin: string;
  amount: number;
  status: AepsStatus;
  referenceNo: string;
  paysprintRefId?: string;
  balance?: string;
  miniStatement?: string;
  message?: string;
  serviceCharge?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AepsBank {
  iinno: string;
  bankName: string;
}

export interface AepsApiLog {
  id: string;
  endpoint: string;
  method: string;
  requestPayload: string;
  responseBody: string;
  httpStatus: number;
  success: boolean;
  durationMs: number;
  errorMessage?: string;
  createdAt: string;
}

export const walletTransactionTypes = ["RECHARGE", "DEBIT", "CREDIT", "COMMISSION", "ADJUSTMENT"] as const;
export type WalletTransactionType = typeof walletTransactionTypes[number];

export const walletTxStatuses = ["PENDING", "APPROVED", "REJECTED", "COMPLETED"] as const;
export type WalletTxStatus = typeof walletTxStatuses[number];

export interface VendorWallet {
  id: string;
  userId: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: WalletTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  description: string;
  status: WalletTxStatus;
  utr?: string;
  createdAt: string;
}

export interface CommissionConfig {
  serviceType: string;
  commissionAmount: number;
  commissionType: "FIXED" | "PERCENTAGE";
}

export interface CommissionWallet {
  id: string;
  userId: string;
  balance: number;
  totalEarned: number;
  totalWithdrawn: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionTransaction {
  id: string;
  userId: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  serviceType: string;
  reference: string;
  description: string;
  createdAt: string;
}

export const commissionWithdrawalStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;
export type CommissionWithdrawalStatus = typeof commissionWithdrawalStatuses[number];

export const commissionWithdrawalModes = ["UPI", "BANK"] as const;
export type CommissionWithdrawalMode = typeof commissionWithdrawalModes[number];

export interface CommissionWithdrawal {
  id: string;
  userId: string;
  amount: number;
  mode: CommissionWithdrawalMode;
  upiId?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountName?: string;
  bankName?: string;
  status: CommissionWithdrawalStatus;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export const sendOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: otpSchema,
});

export const createRechargeSchema = z.object({
  type: z.enum(rechargeTypes),
  operatorId: z.string().min(1),
  subscriberNumber: z.string().min(1),
  amount: z.number().positive(),
  planId: z.string().optional(),
});

export const submitUtrSchema = z.object({
  transactionId: z.string().min(1),
  utr: utrSchema,
});

export const aepsOnboardSchema = z.object({
  merchantCode: z.string().min(1),
});

export const aepsTransactionSchema = z.object({
  type: z.enum(aepsTransactionTypes),
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Invalid Aadhaar number"),
  customerMobile: z.string().regex(/^[6-9]\d{9}$/, "Invalid mobile number"),
  bankIin: z.string().min(1, "Bank is required"),
  bankName: z.string().min(1, "Bank name is required"),
  amount: z.number().optional(),
  latitude: z.string().default("28.6139"),
  longitude: z.string().default("77.2090"),
  fingerprintData: z.string().optional(),
  pipe: z.string().default("bank2"),
});
