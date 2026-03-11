var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/utils/encryption.ts
var encryption_exports = {};
__export(encryption_exports, {
  decryptPayload: () => decryptPayload,
  encryptPayload: () => encryptPayload,
  generateJwtToken: () => generateJwtToken,
  verifyJwtToken: () => verifyJwtToken
});
import crypto from "crypto";
function encryptPayload(data) {
  const text = JSON.stringify(data);
  const key = Buffer.from(AES_KEY.slice(0, 16), "utf-8");
  const iv = Buffer.from(AES_IV.slice(0, 16), "utf-8");
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}
function decryptPayload(encrypted) {
  const key = Buffer.from(AES_KEY.slice(0, 16), "utf-8");
  const iv = Buffer.from(AES_IV.slice(0, 16), "utf-8");
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}
function generateJwtToken(payload) {
  const secret = process.env.SESSION_SECRET || "rupyasetu_secret_key";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1e3), exp: Math.floor(Date.now() / 1e3) + 86400 * 7 })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}
function verifyJwtToken(token) {
  try {
    const secret = process.env.SESSION_SECRET || "rupyasetu_secret_key";
    const [header, body, signature] = token.split(".");
    const expectedSig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1e3)) return null;
    return payload;
  } catch {
    return null;
  }
}
var AES_KEY, AES_IV;
var init_encryption = __esm({
  "server/utils/encryption.ts"() {
    "use strict";
    AES_KEY = process.env.PAYSPRINT_AES_KEY || "default_aes_key_for_uat_testing";
    AES_IV = process.env.PAYSPRINT_AES_IV || "default_iv_for_uat";
  }
});

// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";

// server/storage.ts
import { randomUUID } from "crypto";
import pg from "pg";
var pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : void 0
});
pool.query("SELECT 1").then(() => console.log("Connected to PostgreSQL successfully")).catch((err) => console.error("PostgreSQL connection error:", err.message));
var OPERATORS = [
  { id: "jio", name: "Jio", type: "MOBILE", icon: "jio" },
  { id: "airtel", name: "Airtel", type: "MOBILE", icon: "airtel" },
  { id: "vi", name: "Vi (Vodafone Idea)", type: "MOBILE", icon: "vi" },
  { id: "bsnl", name: "BSNL", type: "MOBILE", icon: "bsnl" },
  { id: "tatasky", name: "Tata Play", type: "DTH", icon: "tataplay" },
  { id: "dishtv", name: "Dish TV", type: "DTH", icon: "dishtv" },
  { id: "d2h", name: "D2H", type: "DTH", icon: "d2h" },
  { id: "sundirect", name: "Sun Direct", type: "DTH", icon: "sundirect" },
  { id: "airteldth", name: "Airtel DTH", type: "DTH", icon: "airteldth" }
];
var PLANS = [
  { id: "jio-1", operatorId: "jio", amount: 239, validity: "28 days", description: "2GB/day + Unlimited Calls", data: "2GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "jio-2", operatorId: "jio", amount: 299, validity: "28 days", description: "2.5GB/day + Unlimited Calls", data: "2.5GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "jio-3", operatorId: "jio", amount: 479, validity: "56 days", description: "1.5GB/day + Unlimited Calls", data: "1.5GB/day", talktime: "Unlimited", category: "Data" },
  { id: "jio-4", operatorId: "jio", amount: 666, validity: "84 days", description: "1.5GB/day + Unlimited Calls", data: "1.5GB/day", talktime: "Unlimited", category: "Data" },
  { id: "jio-5", operatorId: "jio", amount: 999, validity: "84 days", description: "2.5GB/day + Unlimited Calls", data: "2.5GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "jio-6", operatorId: "jio", amount: 2999, validity: "365 days", description: "2.5GB/day + Unlimited Calls", data: "2.5GB/day", talktime: "Unlimited", category: "Annual" },
  { id: "airtel-1", operatorId: "airtel", amount: 265, validity: "28 days", description: "1GB/day + Unlimited Calls", data: "1GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "airtel-2", operatorId: "airtel", amount: 299, validity: "28 days", description: "1.5GB/day + Unlimited Calls", data: "1.5GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "airtel-3", operatorId: "airtel", amount: 479, validity: "56 days", description: "1.5GB/day + Unlimited Calls", data: "1.5GB/day", talktime: "Unlimited", category: "Data" },
  { id: "airtel-4", operatorId: "airtel", amount: 719, validity: "84 days", description: "1.5GB/day + Unlimited Calls", data: "1.5GB/day", talktime: "Unlimited", category: "Data" },
  { id: "airtel-5", operatorId: "airtel", amount: 2999, validity: "365 days", description: "2.5GB/day + Unlimited Calls", data: "2.5GB/day", talktime: "Unlimited", category: "Annual" },
  { id: "vi-1", operatorId: "vi", amount: 249, validity: "28 days", description: "1GB/day + Unlimited Calls", data: "1GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "vi-2", operatorId: "vi", amount: 299, validity: "28 days", description: "1.5GB/day + Unlimited Calls", data: "1.5GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "vi-3", operatorId: "vi", amount: 449, validity: "56 days", description: "1GB/day + Unlimited Calls", data: "1GB/day", talktime: "Unlimited", category: "Data" },
  { id: "bsnl-1", operatorId: "bsnl", amount: 197, validity: "30 days", description: "2GB/day + Unlimited Calls", data: "2GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "bsnl-2", operatorId: "bsnl", amount: 397, validity: "60 days", description: "2GB/day + Unlimited Calls", data: "2GB/day", talktime: "Unlimited", category: "Data" },
  { id: "tatasky-1", operatorId: "tatasky", amount: 220, validity: "1 Month", description: "Hindi Basic HD", category: "Basic" },
  { id: "tatasky-2", operatorId: "tatasky", amount: 350, validity: "1 Month", description: "Hindi Smart HD", category: "Popular" },
  { id: "tatasky-3", operatorId: "tatasky", amount: 550, validity: "1 Month", description: "Hindi Premium HD", category: "Premium" },
  { id: "dishtv-1", operatorId: "dishtv", amount: 199, validity: "1 Month", description: "South Jumbo Family", category: "Basic" },
  { id: "dishtv-2", operatorId: "dishtv", amount: 325, validity: "1 Month", description: "DishNXT HD", category: "Popular" },
  { id: "d2h-1", operatorId: "d2h", amount: 250, validity: "1 Month", description: "Gold HD", category: "Popular" },
  { id: "d2h-2", operatorId: "d2h", amount: 400, validity: "1 Month", description: "Diamond HD", category: "Premium" },
  { id: "sundirect-1", operatorId: "sundirect", amount: 180, validity: "1 Month", description: "Value Pack", category: "Basic" },
  { id: "sundirect-2", operatorId: "sundirect", amount: 320, validity: "1 Month", description: "Premium Pack", category: "Premium" },
  { id: "airteldth-1", operatorId: "airteldth", amount: 258, validity: "1 Month", description: "Value Lite HD", category: "Basic" },
  { id: "airteldth-2", operatorId: "airteldth", amount: 410, validity: "1 Month", description: "Premium HD", category: "Popular" }
];
function rowToUser(row) {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name || void 0,
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}
function rowToTransaction(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    subscriberNumber: row.subscriber_number,
    amount: parseFloat(row.amount),
    planId: row.plan_id || void 0,
    planDescription: row.plan_description || void 0,
    paymentStatus: row.payment_status,
    rechargeStatus: row.recharge_status,
    utr: row.utr || void 0,
    paysprintRefId: row.paysprint_ref_id || void 0,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at
  };
}
var PgStorage = class {
  async getUser(id) {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return result.rows[0] ? rowToUser(result.rows[0]) : void 0;
  }
  async getUserByPhone(phone) {
    const result = await pool.query("SELECT * FROM users WHERE phone = $1", [phone]);
    return result.rows[0] ? rowToUser(result.rows[0]) : void 0;
  }
  async createUser(phone) {
    const id = randomUUID();
    const result = await pool.query(
      "INSERT INTO users (id, phone) VALUES ($1, $2) RETURNING *",
      [id, phone]
    );
    return rowToUser(result.rows[0]);
  }
  async createUserWithId(id, phone) {
    const result = await pool.query(
      "INSERT INTO users (id, phone) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING *",
      [id, phone]
    );
    if (result.rows[0]) return rowToUser(result.rows[0]);
    const existing = await this.getUser(id);
    return existing;
  }
  async updateUser(id, data) {
    const fields = [];
    const values = [];
    let idx = 1;
    if (data.name !== void 0) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.phone !== void 0) {
      fields.push(`phone = $${idx++}`);
      values.push(data.phone);
    }
    if (fields.length === 0) return this.getUser(id);
    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToUser(result.rows[0]) : void 0;
  }
  async saveOtp(record) {
    await pool.query(
      `INSERT INTO otp_records (phone, otp, expires_at, attempts)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone) DO UPDATE SET otp = $2, expires_at = $3, attempts = $4`,
      [record.phone, record.otp, record.expiresAt, record.attempts]
    );
  }
  async getOtp(phone) {
    const result = await pool.query("SELECT * FROM otp_records WHERE phone = $1", [phone]);
    if (!result.rows[0]) return void 0;
    const row = result.rows[0];
    return {
      phone: row.phone,
      otp: row.otp,
      expiresAt: parseInt(row.expires_at),
      attempts: row.attempts
    };
  }
  async deleteOtp(phone) {
    await pool.query("DELETE FROM otp_records WHERE phone = $1", [phone]);
  }
  async getOperators(type) {
    if (type) return OPERATORS.filter((o) => o.type === type);
    return OPERATORS;
  }
  async getOperator(id) {
    return OPERATORS.find((o) => o.id === id);
  }
  async getPlans(operatorId, category) {
    let plans = PLANS.filter((p) => p.operatorId === operatorId);
    if (category) plans = plans.filter((p) => p.category === category);
    return plans;
  }
  async createTransaction(data) {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO transactions (id, user_id, type, operator_id, operator_name, subscriber_number, amount, plan_id, plan_description, payment_status, recharge_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [id, data.userId, data.type, data.operatorId, data.operatorName, data.subscriberNumber, data.amount, data.planId || null, data.planDescription || null, data.paymentStatus, data.rechargeStatus]
    );
    return rowToTransaction(result.rows[0]);
  }
  async getTransaction(id) {
    const result = await pool.query("SELECT * FROM transactions WHERE id = $1", [id]);
    return result.rows[0] ? rowToTransaction(result.rows[0]) : void 0;
  }
  async updateTransaction(id, data) {
    const fields = [];
    const values = [];
    let idx = 1;
    if (data.paymentStatus !== void 0) {
      fields.push(`payment_status = $${idx++}`);
      values.push(data.paymentStatus);
    }
    if (data.rechargeStatus !== void 0) {
      fields.push(`recharge_status = $${idx++}`);
      values.push(data.rechargeStatus);
    }
    if (data.utr !== void 0) {
      fields.push(`utr = $${idx++}`);
      values.push(data.utr);
    }
    if (data.paysprintRefId !== void 0) {
      fields.push(`paysprint_ref_id = $${idx++}`);
      values.push(data.paysprintRefId);
    }
    if (fields.length === 0) return this.getTransaction(id);
    values.push(id);
    const result = await pool.query(
      `UPDATE transactions SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToTransaction(result.rows[0]) : void 0;
  }
  async getUserTransactions(userId) {
    const result = await pool.query(
      "SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map(rowToTransaction);
  }
  async getAllTransactions() {
    const result = await pool.query("SELECT * FROM transactions ORDER BY created_at DESC");
    return result.rows.map(rowToTransaction);
  }
  async findTransactionByUtr(utr) {
    const result = await pool.query("SELECT * FROM transactions WHERE utr = $1", [utr]);
    return result.rows[0] ? rowToTransaction(result.rows[0]) : void 0;
  }
};
var storage = new PgStorage();

// server/routes.ts
init_encryption();

// server/utils/validators.ts
function validateUtr(utr) {
  if (!utr || typeof utr !== "string") {
    return { valid: false, error: "UTR is required" };
  }
  const trimmed = utr.trim();
  if (trimmed.length < 12 || trimmed.length > 22) {
    return { valid: false, error: "UTR must be 12-22 characters long" };
  }
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
    return { valid: false, error: "UTR must contain only alphanumeric characters" };
  }
  return { valid: true };
}
function validateAmount(amount) {
  if (typeof amount !== "number" || isNaN(amount)) {
    return { valid: false, error: "Amount must be a number" };
  }
  if (amount <= 0) {
    return { valid: false, error: "Amount must be positive" };
  }
  if (amount > 1e5) {
    return { valid: false, error: "Amount exceeds maximum limit" };
  }
  return { valid: true };
}

// server/utils/smsalert.ts
var SMSALERT_API_URL = "https://www.smsalert.co.in/api/push.json";
function generateOtp() {
  return Math.floor(1e5 + Math.random() * 9e5).toString();
}
async function sendSmsAlert(phone, otp) {
  const apiKey = process.env.SMSALERT_API_KEY;
  const sender = process.env.SMSALERT_SENDER || "ESTORE";
  const template = process.env.SMSALERT_TEMPLATE || "Your verification code for mobile verification is #{OTP}";
  if (!apiKey) {
    console.error("[SMS Alert] API key not configured");
    return { success: false, error: "SMS service not configured" };
  }
  const message = template.replace("#{OTP}", otp);
  const formattedPhone = phone.startsWith("91") ? phone : `91${phone}`;
  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      sender,
      mobileno: formattedPhone,
      text: message
    });
    const response = await fetch(`${SMSALERT_API_URL}?${params.toString()}`, {
      method: "GET"
    });
    const data = await response.json();
    if (data.status === "success" || data.description?.status === "success") {
      console.log(`[SMS Alert] OTP sent to ${phone}`);
      return { success: true };
    }
    console.error(`[SMS Alert] Failed:`, JSON.stringify(data));
    return { success: false, error: data.description?.desc || "SMS delivery failed" };
  } catch (error) {
    console.error("[SMS Alert] Network error:", error);
    return { success: false, error: "Failed to connect to SMS service" };
  }
}

// server/services/paysprint.ts
init_encryption();
import jwt from "jsonwebtoken";
var PAYSPRINT_BASE_URL = process.env.PAYSPRINT_BASE_URL || "https://api.paysprint.in/service-api/api/v1";
var PAYSPRINT_AUTH_KEY = process.env.PAYSPRINT_AUTHORIZED_KEY || "";
var PAYSPRINT_PARTNER_ID = process.env.PAYSPRINT_PARTNER_ID || "";
var PAYSPRINT_ENV = process.env.PAYSPRINT_ENV || "PRODUCTION";
function isProductionEnv() {
  return PAYSPRINT_ENV === "PRODUCTION" || PAYSPRINT_ENV === "LIVE";
}
function generatePaysprintJWT() {
  const timestamp = Date.now();
  const reqid = timestamp.toString() + Math.floor(Math.random() * 1e4).toString();
  const payload = {
    iss: "PAYSPRINT",
    timestamp,
    partnerId: PAYSPRINT_PARTNER_ID,
    product: "WALLET",
    reqid
  };
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  return jwt.sign(payload, jwtTokenEnv, { algorithm: "HS256" });
}
async function makePaysprintRequest(endpoint, payload) {
  if (!PAYSPRINT_AUTH_KEY || !PAYSPRINT_PARTNER_ID) {
    console.log("[Paysprint SIMULATION] No credentials configured. Simulating:", endpoint, payload);
    return simulateResponse(endpoint, payload);
  }
  const fullUrl = `${PAYSPRINT_BASE_URL}${endpoint}`;
  try {
    const useEncryption = isProductionEnv();
    let requestBody;
    if (useEncryption) {
      try {
        const encrypted = encryptPayload(payload);
        requestBody = JSON.stringify({ body: encrypted });
      } catch (encErr) {
        console.warn("[PAYSPRINT] AES encryption failed, falling back to plain JSON:", encErr);
        requestBody = JSON.stringify(payload);
      }
    } else {
      requestBody = JSON.stringify(payload);
    }
    console.log("=== [PAYSPRINT RAW API LOG] ===");
    console.log("[PAYSPRINT] Mode:", useEncryption ? "PRODUCTION (AES Encrypted)" : "UAT/SIT (Plain JSON)");
    console.log("[PAYSPRINT] Environment:", PAYSPRINT_ENV);
    console.log("[PAYSPRINT] Timestamp:", (/* @__PURE__ */ new Date()).toISOString());
    console.log("[PAYSPRINT] Request URL:", fullUrl);
    console.log("[PAYSPRINT] Request Method: POST");
    console.log("[PAYSPRINT] Request Headers: { Content-Type: application/json, Authorisedkey: [MASKED], Token: [MASKED] }");
    console.log("[PAYSPRINT] Original Payload:", JSON.stringify(payload));
    console.log("[PAYSPRINT] Request Body (sent):", requestBody);
    const jwtToken = generatePaysprintJWT();
    console.log("[PAYSPRINT] JWT Token (masked):", jwtToken.substring(0, 20) + "...[MASKED]");
    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorisedkey": PAYSPRINT_AUTH_KEY,
        "Token": jwtToken
      },
      body: requestBody
    });
    const rawText = await response.text();
    console.log("[PAYSPRINT] HTTP Status:", response.status);
    console.log("[PAYSPRINT] Raw Response Body:", rawText);
    console.log("=== [END PAYSPRINT RAW API LOG] ===");
    let jsonText = rawText;
    const jsonMatch = rawText.match(/\{[^<]*\}$/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      console.error("[PAYSPRINT] Failed to parse response as JSON. Raw text:", rawText);
      if (rawText.includes("not available in your region")) {
        return { status: false, response_code: 403, message: "Paysprint API blocked: geographic restriction. Server IP not whitelisted for LIVE access." };
      }
      return { status: false, response_code: 500, message: "Invalid JSON response from Paysprint" };
    }
    return data;
  } catch (error) {
    console.error("[PAYSPRINT] Network/Connection Error:", error);
    return {
      status: false,
      response_code: 500,
      message: "Failed to connect to Paysprint API"
    };
  }
}
function simulateResponse(endpoint, payload) {
  if (endpoint.includes("recharge")) {
    return {
      status: true,
      response_code: 1,
      message: "Recharge initiated successfully",
      data: {
        ackno: `UAT${Date.now()}`,
        status: "PENDING",
        utr: "",
        operator_ref: `OP${Math.random().toString(36).slice(2, 10).toUpperCase()}`
      }
    };
  }
  if (endpoint.includes("status")) {
    return {
      status: true,
      response_code: 1,
      message: "Transaction status fetched",
      data: {
        status: "SUCCESS",
        operator_ref: payload.referenceid || ""
      }
    };
  }
  return {
    status: true,
    response_code: 1,
    message: "Success"
  };
}
var OPERATOR_MAP = {
  "jio": 14,
  "airtel": 4,
  "vi": 33,
  "vodafone": 33,
  "idea": 34,
  "bsnl": 8,
  "mtnl": 10
};
async function initiateRecharge(params) {
  const operatorCode = OPERATOR_MAP[params.operator.toLowerCase()] || parseInt(params.operator) || 14;
  return makePaysprintRequest("/service/recharge/recharge/dorecharge", {
    operator: operatorCode,
    canumber: params.canumber,
    amount: params.amount,
    referenceid: params.referenceid
  });
}
async function checkRechargeStatus(referenceId) {
  return makePaysprintRequest("/service/recharge/recharge/status", {
    referenceid: referenceId
  });
}
async function getOperatorInfo(params) {
  return makePaysprintRequest("/service/recharge/hlr/api/hlr/browseplan", {
    number: params.number,
    type: params.type
  });
}

// shared/schema.ts
import { z } from "zod";
var phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian mobile number");
var otpSchema = z.string().regex(/^\d{4,6}$/, "Invalid OTP format");
var utrSchema = z.string().regex(/^[A-Za-z0-9]{12,22}$/, "Invalid UTR format (12-22 alphanumeric characters)");
var rechargeTypes = ["MOBILE", "DTH"];
var sendOtpSchema = z.object({
  phone: phoneSchema
});
var verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: otpSchema
});
var createRechargeSchema = z.object({
  type: z.enum(rechargeTypes),
  operatorId: z.string().min(1),
  subscriberNumber: z.string().min(1),
  amount: z.number().positive(),
  planId: z.string().optional()
});
var submitUtrSchema = z.object({
  transactionId: z.string().min(1),
  utr: utrSchema
});

// server/routes.ts
var PAYMENT_MODE = process.env.PAYMENT_MODE || "MANUAL";
var PAYEE_UPI_ID = process.env.PAYEE_UPI_ID || "rupyasetu@upi";
var ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
var ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "rupyasetu@2026";
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.slice(7);
  const payload = verifyJwtToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.userId = payload.userId;
  req.phone = payload.phone;
  next();
}
async function registerRoutes(app2) {
  app2.post("/api/auth/send-otp", async (req, res) => {
    try {
      const parsed = sendOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      const { phone } = parsed.data;
      const DEMO_PHONE = "7067018549";
      const DEMO_OTP = "123456";
      if (phone === DEMO_PHONE) {
        await storage.saveOtp({
          phone,
          otp: DEMO_OTP,
          expiresAt: Date.now() + 5 * 60 * 1e3,
          attempts: 0
        });
        console.log(`[OTP] Demo OTP set for ${phone}`);
      } else {
        const otp = generateOtp();
        const smsResult = await sendSmsAlert(phone, otp);
        if (!smsResult.success) {
          return res.status(500).json({ error: smsResult.error || "Failed to send OTP" });
        }
        await storage.saveOtp({
          phone,
          otp,
          expiresAt: Date.now() + 5 * 60 * 1e3,
          attempts: 0
        });
        console.log(`[OTP] OTP sent to ${phone} via SMS Alert`);
      }
      res.json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
      console.error("Send OTP error:", error);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  });
  app2.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const parsed = verifyOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      const { phone, otp } = parsed.data;
      const otpRecord = await storage.getOtp(phone);
      if (!otpRecord) {
        return res.status(400).json({ error: "OTP not found. Please request a new OTP." });
      }
      if (Date.now() > otpRecord.expiresAt) {
        await storage.deleteOtp(phone);
        return res.status(400).json({ error: "OTP expired. Please request a new OTP." });
      }
      if (otpRecord.attempts >= 5) {
        await storage.deleteOtp(phone);
        return res.status(429).json({ error: "Too many attempts. Please request a new OTP." });
      }
      if (otpRecord.otp !== otp) {
        await storage.saveOtp({ ...otpRecord, attempts: otpRecord.attempts + 1 });
        return res.status(400).json({ error: "Invalid OTP" });
      }
      await storage.deleteOtp(phone);
      let user = await storage.getUserByPhone(phone);
      if (!user) {
        user = await storage.createUser(phone);
      }
      const token = generateJwtToken({ userId: user.id, phone: user.phone });
      res.json({
        success: true,
        token,
        user: { id: user.id, phone: user.phone, name: user.name }
      });
    } catch (error) {
      console.error("Verify OTP error:", error);
      res.status(500).json({ error: "Failed to verify OTP" });
    }
  });
  app2.get("/api/user/profile", authMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ user: { id: user.id, phone: user.phone, name: user.name } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });
  app2.put("/api/user/profile", authMiddleware, async (req, res) => {
    try {
      const { name } = req.body;
      const user = await storage.updateUser(req.userId, { name });
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ user: { id: user.id, phone: user.phone, name: user.name } });
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });
  app2.get("/api/operators", authMiddleware, async (req, res) => {
    try {
      const type = req.query.type;
      const operators = await storage.getOperators(type);
      res.json({ operators });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch operators" });
    }
  });
  app2.get("/api/plans/:operatorId", authMiddleware, async (req, res) => {
    try {
      const { operatorId } = req.params;
      const category = req.query.category;
      const plans = await storage.getPlans(operatorId, category);
      res.json({ plans });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });
  app2.post("/api/recharge/initiate", authMiddleware, async (req, res) => {
    try {
      const parsed = createRechargeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      const { type, operatorId, subscriberNumber, amount, planId } = parsed.data;
      const amountValidation = validateAmount(amount);
      if (!amountValidation.valid) {
        return res.status(400).json({ error: amountValidation.error });
      }
      let user = await storage.getUser(req.userId);
      if (!user) {
        user = await storage.createUserWithId(req.userId, req.phone);
      }
      const operator = await storage.getOperator(operatorId);
      if (!operator) {
        return res.status(400).json({ error: "Invalid operator" });
      }
      let planDescription;
      if (planId) {
        const plans = await storage.getPlans(operatorId);
        const plan = plans.find((p) => p.id === planId);
        if (plan) planDescription = plan.description;
      }
      const transaction = await storage.createTransaction({
        userId: req.userId,
        type,
        operatorId,
        operatorName: operator.name,
        subscriberNumber,
        amount,
        planId,
        planDescription,
        paymentStatus: "PAYMENT_PENDING",
        rechargeStatus: "RECHARGE_PENDING"
      });
      const responseData = {
        success: true,
        transaction: {
          id: transaction.id,
          amount: transaction.amount,
          operatorName: transaction.operatorName,
          subscriberNumber: transaction.subscriberNumber
        },
        paymentMode: PAYMENT_MODE
      };
      if (PAYMENT_MODE === "MANUAL") {
        responseData.upiDetails = {
          payeeVpa: PAYEE_UPI_ID,
          amount: transaction.amount,
          note: `Recharge ${transaction.subscriberNumber} - ${transaction.operatorName}`,
          transactionId: transaction.id
        };
      }
      res.json(responseData);
    } catch (error) {
      console.error("Initiate recharge error:", error);
      res.status(500).json({ error: "Failed to initiate recharge" });
    }
  });
  app2.post("/api/recharge/submit-utr", authMiddleware, async (req, res) => {
    try {
      const parsed = submitUtrSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      const { transactionId, utr } = parsed.data;
      const utrValidation = validateUtr(utr);
      if (!utrValidation.valid) {
        return res.status(400).json({ error: utrValidation.error });
      }
      const existingUtr = await storage.findTransactionByUtr(utr);
      if (existingUtr) {
        return res.status(400).json({ error: "This UTR has already been used" });
      }
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      if (transaction.userId !== req.userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      if (transaction.paymentStatus !== "PAYMENT_PENDING") {
        return res.status(400).json({ error: "Payment already processed" });
      }
      await storage.updateTransaction(transactionId, {
        utr,
        paymentStatus: "PAYMENT_UNVERIFIED",
        rechargeStatus: "RECHARGE_PENDING"
      });
      const updatedTx = await storage.getTransaction(transactionId);
      res.json({
        success: true,
        message: "Payment reference submitted. Your recharge will be confirmed within 24 hours.",
        transaction: updatedTx
      });
    } catch (error) {
      console.error("Submit UTR error:", error);
      res.status(500).json({ error: "Failed to process payment" });
    }
  });
  app2.get("/api/transactions", authMiddleware, async (req, res) => {
    try {
      const transactions = await storage.getUserTransactions(req.userId);
      res.json({ transactions });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });
  app2.get("/api/transactions/:id", authMiddleware, async (req, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.id);
      if (!transaction) return res.status(404).json({ error: "Transaction not found" });
      if (transaction.userId !== req.userId) return res.status(403).json({ error: "Unauthorized" });
      res.json({ transaction });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transaction" });
    }
  });
  app2.get("/api/config", (_req, res) => {
    res.json({
      paymentMode: PAYMENT_MODE,
      payeeUpiId: PAYEE_UPI_ID
    });
  });
  function adminAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Admin authentication required" });
    }
    const token = authHeader.slice(7);
    const payload = verifyJwtToken(token);
    if (!payload || !payload.isAdmin) {
      return res.status(401).json({ error: "Invalid admin token" });
    }
    next();
  }
  app2.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = generateJwtToken({ userId: "admin", phone: "admin", isAdmin: true });
      return res.json({ success: true, token });
    }
    return res.status(401).json({ error: "Invalid admin credentials" });
  });
  app2.get("/api/admin/transactions", adminAuthMiddleware, async (_req, res) => {
    try {
      const allTransactions = await storage.getAllTransactions();
      const enriched = await Promise.all(
        allTransactions.map(async (tx) => {
          const user = await storage.getUser(tx.userId);
          return { ...tx, userPhone: user?.phone || "Unknown" };
        })
      );
      res.json({ transactions: enriched });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });
  app2.post("/api/admin/transactions/:id/approve", adminAuthMiddleware, async (req, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.id);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      if (transaction.paymentStatus !== "PAYMENT_UNVERIFIED" || transaction.rechargeStatus !== "RECHARGE_PENDING") {
        return res.status(400).json({ error: "Transaction is not in a pending approval state" });
      }
      await storage.updateTransaction(req.params.id, {
        paymentStatus: "PAYMENT_VERIFIED",
        rechargeStatus: "RECHARGE_PROCESSING"
      });
      const rechargeResult = await initiateRecharge({
        operator: transaction.operatorId,
        canumber: transaction.subscriberNumber,
        amount: transaction.amount,
        recharge_type: transaction.type === "MOBILE" ? "prepaid" : "dth",
        referenceid: req.params.id
      });
      if (rechargeResult.status) {
        await storage.updateTransaction(req.params.id, {
          paysprintRefId: rechargeResult.data?.ackno,
          rechargeStatus: "RECHARGE_SUCCESS"
        });
      } else if (rechargeResult.response_code === 403) {
        await storage.updateTransaction(req.params.id, {
          rechargeStatus: "RECHARGE_PENDING"
        });
      } else {
        await storage.updateTransaction(req.params.id, {
          rechargeStatus: "RECHARGE_FAILED"
        });
      }
      const updatedTx = await storage.getTransaction(req.params.id);
      res.json({ success: true, transaction: updatedTx, rechargeMessage: rechargeResult.message });
    } catch (error) {
      console.error("Admin approve error:", error);
      res.status(500).json({ error: "Failed to approve transaction" });
    }
  });
  app2.post("/api/admin/transactions/:id/retry", adminAuthMiddleware, async (req, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.id);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      if (transaction.paymentStatus !== "PAYMENT_VERIFIED" || transaction.rechargeStatus !== "RECHARGE_PENDING" && transaction.rechargeStatus !== "RECHARGE_FAILED") {
        return res.status(400).json({ error: "Transaction is not in a retryable state" });
      }
      await storage.updateTransaction(req.params.id, {
        rechargeStatus: "RECHARGE_PROCESSING"
      });
      const rechargeResult = await initiateRecharge({
        operator: transaction.operatorId,
        canumber: transaction.subscriberNumber,
        amount: transaction.amount,
        recharge_type: transaction.type === "MOBILE" ? "prepaid" : "dth",
        referenceid: req.params.id
      });
      if (rechargeResult.status) {
        await storage.updateTransaction(req.params.id, {
          paysprintRefId: rechargeResult.data?.ackno,
          rechargeStatus: "RECHARGE_SUCCESS"
        });
      } else if (rechargeResult.response_code === 403) {
        await storage.updateTransaction(req.params.id, {
          rechargeStatus: "RECHARGE_PENDING"
        });
      } else {
        await storage.updateTransaction(req.params.id, {
          rechargeStatus: "RECHARGE_FAILED"
        });
      }
      const updatedTx = await storage.getTransaction(req.params.id);
      res.json({ success: true, transaction: updatedTx, rechargeMessage: rechargeResult.message });
    } catch (error) {
      console.error("Admin retry error:", error);
      res.status(500).json({ error: "Failed to retry recharge" });
    }
  });
  app2.post("/api/admin/transactions/:id/mark-success", adminAuthMiddleware, async (req, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.id);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      if (transaction.paymentStatus !== "PAYMENT_VERIFIED") {
        return res.status(400).json({ error: "Payment must be verified before marking recharge as success" });
      }
      await storage.updateTransaction(req.params.id, {
        rechargeStatus: "RECHARGE_SUCCESS",
        paysprintRefId: "MANUAL_" + Date.now()
      });
      const updatedTx = await storage.getTransaction(req.params.id);
      res.json({ success: true, transaction: updatedTx });
    } catch (error) {
      console.error("Admin mark-success error:", error);
      res.status(500).json({ error: "Failed to mark transaction as success" });
    }
  });
  app2.post("/api/admin/transactions/:id/reject", adminAuthMiddleware, async (req, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.id);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      if (transaction.paymentStatus !== "PAYMENT_UNVERIFIED" || transaction.rechargeStatus !== "RECHARGE_PENDING") {
        return res.status(400).json({ error: "Transaction is not in a pending approval state" });
      }
      await storage.updateTransaction(req.params.id, {
        paymentStatus: "PAYMENT_FAILED",
        rechargeStatus: "RECHARGE_FAILED"
      });
      const updatedTx = await storage.getTransaction(req.params.id);
      res.json({ success: true, transaction: updatedTx });
    } catch (error) {
      console.error("Admin reject error:", error);
      res.status(500).json({ error: "Failed to reject transaction" });
    }
  });
  app2.post("/api/admin/paysprint-test", adminAuthMiddleware, async (req, res) => {
    try {
      const { action, operator, canumber, amount, recharge_type, number, type, referenceid } = req.body;
      console.log("\n========================================");
      console.log("[PAYSPRINT TEST] Action:", action);
      console.log("[PAYSPRINT TEST] Timestamp:", (/* @__PURE__ */ new Date()).toISOString());
      console.log("========================================\n");
      let result;
      if (action === "browseplan") {
        result = await getOperatorInfo({ number: number || "7067018549", type: type || "MOBILE" });
      } else if (action === "dorecharge") {
        const testRefId = referenceid || `RSTEST${Date.now()}`;
        result = await initiateRecharge({
          operator: operator || "jio",
          canumber: canumber || "7067018549",
          amount: amount || 10,
          recharge_type: recharge_type || "prepaid",
          referenceid: testRefId
        });
      } else if (action === "status") {
        result = await checkRechargeStatus(referenceid || "TEST123");
      } else {
        return res.status(400).json({ error: "Invalid action. Use: browseplan, dorecharge, status" });
      }
      res.json({ action, result });
    } catch (error) {
      console.error("[PAYSPRINT TEST] Error:", error);
      res.status(500).json({ error: "Paysprint test failed" });
    }
  });
  app2.post("/api/admin/paysprint-test-raw", adminAuthMiddleware, async (req, res) => {
    try {
      const { action, operator, canumber, amount, recharge_type, referenceid } = req.body;
      const jwt2 = await import("jsonwebtoken");
      const { encryptPayload: encryptPayload2 } = await Promise.resolve().then(() => (init_encryption(), encryption_exports));
      const PAYSPRINT_BASE_URL2 = process.env.PAYSPRINT_BASE_URL || "https://api.paysprint.in/service-api/api/v1";
      const PAYSPRINT_AUTH_KEY2 = process.env.PAYSPRINT_AUTHORIZED_KEY || "";
      const PAYSPRINT_PARTNER_ID2 = process.env.PAYSPRINT_PARTNER_ID || "";
      const PAYSPRINT_ENV_VAL = process.env.PAYSPRINT_ENV || "PRODUCTION";
      const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
      const useEncryption = PAYSPRINT_ENV_VAL === "PRODUCTION" || PAYSPRINT_ENV_VAL === "LIVE";
      const timestamp = Date.now();
      const reqid = timestamp.toString() + Math.floor(Math.random() * 1e4).toString();
      const jwtPayload = { iss: "PAYSPRINT", timestamp, partnerId: PAYSPRINT_PARTNER_ID2, product: "WALLET", reqid };
      const jwtToken = jwt2.default.sign(jwtPayload, jwtTokenEnv, { algorithm: "HS256" });
      let endpoint = "/service/recharge/recharge/dorecharge";
      let requestBody = {};
      if (action === "status") {
        endpoint = "/service/recharge/recharge/status";
        requestBody = { referenceid: referenceid || "TEST123" };
      } else {
        const OPERATOR_MAP2 = { jio: 14, airtel: 4, vi: 33, vodafone: 33, idea: 34, bsnl: 8, mtnl: 10 };
        const opCode = OPERATOR_MAP2[(operator || "jio").toLowerCase()] || parseInt(operator) || 14;
        requestBody = {
          operator: opCode,
          canumber: canumber || "7067018549",
          amount: amount || 10,
          referenceid: referenceid || `RSLIVE${timestamp}`
        };
      }
      const fullUrl = `${PAYSPRINT_BASE_URL2}${endpoint}`;
      let bodyStr;
      let encryptionActual = useEncryption ? "AES-128-CBC" : "Plain JSON";
      if (useEncryption) {
        try {
          const encrypted = encryptPayload2(requestBody);
          bodyStr = JSON.stringify({ body: encrypted });
        } catch (encErr) {
          console.warn("[PAYSPRINT RAW TEST] AES encryption failed, falling back to plain JSON:", encErr);
          bodyStr = JSON.stringify(requestBody);
          encryptionActual = "Plain JSON (AES fallback)";
        }
      } else {
        bodyStr = JSON.stringify(requestBody);
      }
      const maskedAuthKey = PAYSPRINT_AUTH_KEY2 ? PAYSPRINT_AUTH_KEY2.substring(0, 8) + "..." : "(not set)";
      const maskedToken = jwtToken.substring(0, 20) + "...";
      const curlCommand = `curl --location --request POST \\
  "${fullUrl}" \\
  --header "Content-Type: application/json" \\
  --header "Authorisedkey: ${maskedAuthKey}" \\
  --header "Token: ${maskedToken}" \\
  --data-raw '${bodyStr}'`;
      const response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorisedkey": PAYSPRINT_AUTH_KEY2,
          "Token": jwtToken
        },
        body: bodyStr
      });
      const rawText = await response.text();
      let parsedResponse;
      try {
        const jsonMatch = rawText.match(/\{[^<]*\}$/);
        parsedResponse = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
      } catch {
        parsedResponse = { raw: rawText };
      }
      res.json({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        environment: PAYSPRINT_ENV_VAL,
        encryption: encryptionActual,
        request_url: fullUrl,
        request_headers: {
          "Content-Type": "application/json",
          "Authorisedkey": PAYSPRINT_AUTH_KEY2 ? PAYSPRINT_AUTH_KEY2.substring(0, 8) + "..." : "(not set)",
          "Token": jwtToken.substring(0, 20) + "..."
        },
        request_body: requestBody,
        request_body_sent: bodyStr,
        jwt_payload: jwtPayload,
        http_status: response.status,
        response: parsedResponse,
        curl_command: curlCommand
      });
    } catch (error) {
      console.error("[PAYSPRINT RAW TEST] Error:", error);
      res.status(500).json({ error: "Paysprint raw test failed", details: String(error) });
    }
  });
  app2.get("/api/admin/server-info", adminAuthMiddleware, async (_req, res) => {
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json");
      const ipData = await ipRes.json();
      res.json({ outbound_ip: ipData.ip, env: process.env.PAYSPRINT_ENV, base_url: process.env.PAYSPRINT_BASE_URL });
    } catch (error) {
      res.status(500).json({ error: "Failed to check IP", details: String(error) });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs from "fs";
import * as path from "path";
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    origins.add("https://rupyasetuadmin.site");
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path2 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path2.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path === "/admin") {
      const adminPath = path.resolve(process.cwd(), "server", "templates", "admin-panel.html");
      if (fs.existsSync(adminPath)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(fs.readFileSync(adminPath, "utf-8"));
      }
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app2.use(express.static(path.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
