import { z } from "zod";

export const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian mobile number");

export const otpSchema = z.string().regex(/^\d{4,6}$/, "Invalid OTP format");

export const utrSchema = z.string().regex(/^[A-Za-z0-9]{12,22}$/, "Invalid UTR format (12-22 alphanumeric characters)");

export const rechargeTypes = ["MOBILE", "DTH"] as const;
export type RechargeType = typeof rechargeTypes[number];

export const paymentStatuses = ["PAYMENT_PENDING", "PAYMENT_UNVERIFIED", "PAYMENT_VERIFIED", "PAYMENT_FAILED"] as const;
export type PaymentStatus = typeof paymentStatuses[number];

export const rechargeStatuses = ["RECHARGE_PENDING", "RECHARGE_PROCESSING", "RECHARGE_SUCCESS", "RECHARGE_FAILED"] as const;
export type RechargeStatus = typeof rechargeStatuses[number];

export interface User {
  id: string;
  phone: string;
  name?: string;
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
