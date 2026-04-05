import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import { generateJwtToken, verifyJwtToken } from "./utils/encryption";
import { validateUtr, validatePhone, validateAmount } from "./utils/validators";
import { generateOtp, sendSmsAlert } from "./utils/smsalert";
import { initiateRecharge, checkRechargeStatus, getOperatorInfo } from "./services/paysprint";
import * as aepsService from "./services/aeps";
import { generateAepsReport } from "./services/aeps-report";
import { sendOtpSchema, verifyOtpSchema, createRechargeSchema, submitUtrSchema, aepsTransactionSchema } from "../shared/schema";

const PAYMENT_MODE = process.env.PAYMENT_MODE || "MANUAL";
const PAYEE_UPI_ID = process.env.PAYEE_UPI_ID || "44789692406@sbi";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "rupyasetu@2026";

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.slice(7);
  const payload = verifyJwtToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  (req as any).userId = payload.userId;
  (req as any).phone = payload.phone;
  next();
}

async function autoOnboardMerchant(userId: string, phone: string, firmName: string): Promise<void> {
  const existing = await storage.getAepsMerchant(userId);
  if (existing) {
    if (existing.kycRedirectUrl && existing.kycStatus !== "FAILED") return;
    return retryOnboarding(existing, phone, firmName);
  }

  // PaySprint onboarding API: we send merchantcode, PaySprint registers it as sub-merchant ID.
  // The API does not return a different code — the code we send IS the sub-merchant identifier.
  const merchantCode = "RS-" + Math.random().toString(36).substring(2, 8).toUpperCase();

  let kycRedirectUrl = "";
  let kycStatus: "PENDING" | "FAILED" = "FAILED";
  try {
    const onboardResult = await aepsService.getOnboardingUrl({
      merchantCode,
      mobile: phone,
      email: "",
      firmName: firmName || "RupyaSetu",
      isNew: true,
    });
    if (onboardResult.status && onboardResult.data?.redirecturl) {
      kycRedirectUrl = onboardResult.data.redirecturl;
      kycStatus = "PENDING";
    }
  } catch (err: any) {
    console.error("Auto-onboard PaySprint API call failed:", err.message);
  }

  try {
    await storage.createAepsMerchant(userId, merchantCode, "bank2", {
      phone,
      firmName: firmName || "RupyaSetu",
      kycRedirectUrl: kycRedirectUrl || undefined,
      createdBy: "auto",
    });
    if (kycStatus === "FAILED") {
      await storage.updateAepsMerchant(userId, { kycStatus: "FAILED" });
      console.warn(`[Auto-Onboard] Created merchant ${merchantCode} for ${phone} with FAILED status (API unavailable). Will retry.`);
    } else {
      console.log(`[Auto-Onboard] Created merchant ${merchantCode} for user ${userId} (${phone})`);
    }
  } catch (err: any) {
    if (err.code === "23505") {
      console.log(`[Auto-Onboard] Merchant already exists for user ${userId} (concurrent creation)`);
      return;
    }
    throw err;
  }
}

async function retryOnboarding(merchant: any, phone: string, firmName: string): Promise<void> {
  try {
    let onboardResult = await aepsService.getOnboardingUrl({
      merchantCode: merchant.merchantCode,
      mobile: phone,
      email: "",
      firmName: firmName || "RupyaSetu",
      isNew: true,
    });
    if (!onboardResult.status || !onboardResult.data?.redirecturl) {
      console.log(`[Auto-Onboard] is_new=1 failed (${onboardResult.message}), trying is_new=0...`);
      onboardResult = await aepsService.getOnboardingUrl({
        merchantCode: merchant.merchantCode,
        mobile: phone,
        email: "",
        firmName: firmName || "RupyaSetu",
        isNew: false,
      });
    }
    if (onboardResult.status && onboardResult.data?.redirecturl) {
      await storage.updateAepsMerchant(merchant.userId, {
        kycRedirectUrl: onboardResult.data.redirecturl,
        kycStatus: "PENDING",
      });
      console.log(`[Auto-Onboard] Retry succeeded for merchant ${merchant.merchantCode}`);
    } else {
      console.warn(`[Auto-Onboard] Retry: no URL returned for ${merchant.merchantCode} — ${onboardResult.message}`);
    }
  } catch (err: any) {
    console.error(`[Auto-Onboard] Retry failed for ${merchant.merchantCode}:`, err.message);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {

  app.post("/api/auth/send-otp", async (req: Request, res: Response) => {
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
          expiresAt: Date.now() + 5 * 60 * 1000,
          attempts: 0,
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
          expiresAt: Date.now() + 5 * 60 * 1000,
          attempts: 0,
        });
        console.log(`[OTP] OTP sent to ${phone} via SMS Alert`);
      }

      res.json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
      console.error("Send OTP error:", error);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  });

  app.post("/api/auth/verify-otp", async (req: Request, res: Response) => {
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
        user: { id: user.id, phone: user.phone, name: user.name },
      });

      if (user.name) {
        autoOnboardMerchant(user.id, user.phone, user.name).catch(err =>
          console.error("Login auto-onboard error:", err.message)
        );
      }
    } catch (error) {
      console.error("Verify OTP error:", error);
      res.status(500).json({ error: "Failed to verify OTP" });
    }
  });

  app.get("/api/ip", async (_req: Request, res: Response) => {
    try {
      const sources = [
        "https://api4.ipify.org",
        "https://ipv4.icanhazip.com",
        "https://checkip.amazonaws.com",
      ];
      let ipv4 = "";
      for (const url of sources) {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
          const text = (await r.text()).trim();
          if (/^\d+\.\d+\.\d+\.\d+$/.test(text)) { ipv4 = text; break; }
        } catch { continue; }
      }
      if (!ipv4) throw new Error("No IPv4 found");
      res.json({ ipv4, note: "Whitelist this IPv4 in PaySprint dashboard." });
    } catch {
      res.status(500).json({ error: "Could not determine server IPv4" });
    }
  });

  app.get("/api/user/profile", authMiddleware, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser((req as any).userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ user: { id: user.id, phone: user.phone, name: user.name } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.put("/api/user/profile", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      const user = await storage.updateUser((req as any).userId, { name });
      if (!user) return res.status(404).json({ error: "User not found" });

      autoOnboardMerchant(user.id, user.phone, name || "RupyaSetu").catch((err) => {
        console.error("Auto-onboard after profile update failed:", err.message);
      });

      res.json({ user: { id: user.id, phone: user.phone, name: user.name } });
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.get("/api/operators", authMiddleware, async (req: Request, res: Response) => {
    try {
      const type = req.query.type as string | undefined;
      const operators = await storage.getOperators(type);
      res.json({ operators });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch operators" });
    }
  });

  app.get("/api/plans/:operatorId", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { operatorId } = req.params;
      const category = req.query.category as string | undefined;
      const plans = await storage.getPlans(operatorId, category);
      res.json({ plans });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });

  app.post("/api/recharge/initiate", authMiddleware, async (req: Request, res: Response) => {
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

      let user = await storage.getUser((req as any).userId);
      if (!user) {
        user = await storage.createUserWithId((req as any).userId, (req as any).phone);
      }

      const operator = await storage.getOperator(operatorId);
      if (!operator) {
        return res.status(400).json({ error: "Invalid operator" });
      }

      let planDescription: string | undefined;
      if (planId) {
        const plans = await storage.getPlans(operatorId);
        const plan = plans.find((p) => p.id === planId);
        if (plan) planDescription = plan.description;
      }

      const transaction = await storage.createTransaction({
        userId: (req as any).userId,
        type,
        operatorId,
        operatorName: operator.name,
        subscriberNumber,
        amount,
        planId,
        planDescription,
        paymentStatus: "PAYMENT_PENDING",
        rechargeStatus: "RECHARGE_PENDING",
      });

      const responseData: Record<string, unknown> = {
        success: true,
        transaction: {
          id: transaction.id,
          amount: transaction.amount,
          operatorName: transaction.operatorName,
          subscriberNumber: transaction.subscriberNumber,
        },
        paymentMode: PAYMENT_MODE,
      };

      if (PAYMENT_MODE === "MANUAL") {
        responseData.upiDetails = {
          payeeVpa: PAYEE_UPI_ID,
          amount: transaction.amount,
          note: `Recharge ${transaction.subscriberNumber} - ${transaction.operatorName}`,
          transactionId: transaction.id,
        };
      }

      res.json(responseData);
    } catch (error) {
      console.error("Initiate recharge error:", error);
      res.status(500).json({ error: "Failed to initiate recharge" });
    }
  });

  app.post("/api/recharge/submit-utr", authMiddleware, async (req: Request, res: Response) => {
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

      if (transaction.userId !== (req as any).userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (transaction.paymentStatus !== "PAYMENT_PENDING") {
        return res.status(400).json({ error: "Payment already processed" });
      }

      await storage.updateTransaction(transactionId, {
        utr,
        paymentStatus: "PAYMENT_UNVERIFIED",
        rechargeStatus: "RECHARGE_PENDING",
      });

      const updatedTx = await storage.getTransaction(transactionId);

      res.json({
        success: true,
        message: "Payment reference submitted. Your recharge will be confirmed within 24 hours.",
        transaction: updatedTx,
      });
    } catch (error) {
      console.error("Submit UTR error:", error);
      res.status(500).json({ error: "Failed to process payment" });
    }
  });

  app.get("/api/transactions", authMiddleware, async (req: Request, res: Response) => {
    try {
      const transactions = await storage.getUserTransactions((req as any).userId);
      res.json({ transactions });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.get("/api/transactions/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
      const transaction = await storage.getTransaction(req.params.id);
      if (!transaction) return res.status(404).json({ error: "Transaction not found" });
      if (transaction.userId !== (req as any).userId) return res.status(403).json({ error: "Unauthorized" });
      res.json({ transaction });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transaction" });
    }
  });

  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({
      paymentMode: PAYMENT_MODE,
      payeeUpiId: PAYEE_UPI_ID,
    });
  });

  function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Admin authentication required" });
    }
    const token = authHeader.slice(7);
    const payload = verifyJwtToken(token);
    if (!payload || !(payload as any).isAdmin) {
      return res.status(401).json({ error: "Invalid admin token" });
    }
    next();
  }

  app.post("/api/admin/login", (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = generateJwtToken({ userId: "admin", phone: "admin", isAdmin: true } as any);
      return res.json({ success: true, token });
    }
    return res.status(401).json({ error: "Invalid admin credentials" });
  });

  app.get("/api/admin/transactions", adminAuthMiddleware, async (_req: Request, res: Response) => {
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

  app.post("/api/admin/transactions/:id/approve", adminAuthMiddleware, async (req: Request, res: Response) => {
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
        rechargeStatus: "RECHARGE_PROCESSING",
      });

      const rechargeResult = await initiateRecharge({
        operator: transaction.operatorId,
        canumber: transaction.subscriberNumber,
        amount: transaction.amount,
        recharge_type: transaction.type === "MOBILE" ? "prepaid" : "dth",
        referenceid: req.params.id,
      });

      if (rechargeResult.status) {
        await storage.updateTransaction(req.params.id, {
          paysprintRefId: rechargeResult.data?.ackno as string,
          rechargeStatus: "RECHARGE_SUCCESS",
        });
        try {
          const serviceType = transaction.type === "MOBILE" ? "MOBILE_RECHARGE" : "DTH_RECHARGE";
          const alreadyCredited = await storage.hasCommissionCredit(req.params.id, serviceType);
          if (!alreadyCredited) {
            const commissionConfigs = await storage.getCommissionConfig();
            const commCfg = commissionConfigs.find(c => c.serviceType === serviceType);
            if (commCfg && commCfg.commissionAmount > 0) {
              await storage.creditCommission(
                transaction.userId, commCfg.commissionAmount, serviceType,
                req.params.id, `Commission for ${serviceType.replace(/_/g, " ")} ₹${transaction.amount} - ${transaction.subscriberNumber}`
              );
            }
          }
        } catch (commErr: any) {
          console.error("Commission credit error (approve):", commErr.message);
        }
      } else if (rechargeResult.response_code === 403) {
        await storage.updateTransaction(req.params.id, {
          rechargeStatus: "RECHARGE_PENDING",
        });
      } else {
        await storage.updateTransaction(req.params.id, {
          rechargeStatus: "RECHARGE_FAILED",
        });
      }

      const updatedTx = await storage.getTransaction(req.params.id);
      res.json({ success: true, transaction: updatedTx, rechargeMessage: rechargeResult.message });
    } catch (error) {
      console.error("Admin approve error:", error);
      res.status(500).json({ error: "Failed to approve transaction" });
    }
  });

  app.post("/api/admin/transactions/:id/retry", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const transaction = await storage.getTransaction(req.params.id);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      if (transaction.paymentStatus !== "PAYMENT_VERIFIED" || 
          (transaction.rechargeStatus !== "RECHARGE_PENDING" && transaction.rechargeStatus !== "RECHARGE_FAILED")) {
        return res.status(400).json({ error: "Transaction is not in a retryable state" });
      }

      await storage.updateTransaction(req.params.id, {
        rechargeStatus: "RECHARGE_PROCESSING",
      });

      const rechargeResult = await initiateRecharge({
        operator: transaction.operatorId,
        canumber: transaction.subscriberNumber,
        amount: transaction.amount,
        recharge_type: transaction.type === "MOBILE" ? "prepaid" : "dth",
        referenceid: req.params.id,
      });

      if (rechargeResult.status) {
        await storage.updateTransaction(req.params.id, {
          paysprintRefId: rechargeResult.data?.ackno as string,
          rechargeStatus: "RECHARGE_SUCCESS",
        });
        try {
          const serviceType = transaction.type === "MOBILE" ? "MOBILE_RECHARGE" : "DTH_RECHARGE";
          const alreadyCredited = await storage.hasCommissionCredit(req.params.id, serviceType);
          if (!alreadyCredited) {
            const commissionConfigs = await storage.getCommissionConfig();
            const commCfg = commissionConfigs.find(c => c.serviceType === serviceType);
            if (commCfg && commCfg.commissionAmount > 0) {
              await storage.creditCommission(
                transaction.userId, commCfg.commissionAmount, serviceType,
                req.params.id, `Commission for ${serviceType.replace(/_/g, " ")} ₹${transaction.amount} - ${transaction.subscriberNumber}`
              );
            }
          }
        } catch (commErr: any) {
          console.error("Commission credit error (retry):", commErr.message);
        }
      } else if (rechargeResult.response_code === 403) {
        await storage.updateTransaction(req.params.id, {
          rechargeStatus: "RECHARGE_PENDING",
        });
      } else {
        await storage.updateTransaction(req.params.id, {
          rechargeStatus: "RECHARGE_FAILED",
        });
      }

      const updatedTx = await storage.getTransaction(req.params.id);
      res.json({ success: true, transaction: updatedTx, rechargeMessage: rechargeResult.message });
    } catch (error) {
      console.error("Admin retry error:", error);
      res.status(500).json({ error: "Failed to retry recharge" });
    }
  });

  app.post("/api/admin/transactions/:id/mark-success", adminAuthMiddleware, async (req: Request, res: Response) => {
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
        paysprintRefId: "MANUAL_" + Date.now(),
      });
      try {
        const serviceType = transaction.type === "MOBILE" ? "MOBILE_RECHARGE" : "DTH_RECHARGE";
        const alreadyCredited = await storage.hasCommissionCredit(req.params.id, serviceType);
        if (!alreadyCredited) {
          const commissionConfigs = await storage.getCommissionConfig();
          const commCfg = commissionConfigs.find(c => c.serviceType === serviceType);
          if (commCfg && commCfg.commissionAmount > 0) {
            await storage.creditCommission(
              transaction.userId, commCfg.commissionAmount, serviceType,
              req.params.id, `Commission for ${serviceType.replace(/_/g, " ")} ₹${transaction.amount} - ${transaction.subscriberNumber}`
            );
          }
        }
      } catch (commErr: any) {
        console.error("Commission credit error (mark-success):", commErr.message);
      }

      const updatedTx = await storage.getTransaction(req.params.id);
      res.json({ success: true, transaction: updatedTx });
    } catch (error) {
      console.error("Admin mark-success error:", error);
      res.status(500).json({ error: "Failed to mark transaction as success" });
    }
  });

  app.post("/api/admin/transactions/:id/reject", adminAuthMiddleware, async (req: Request, res: Response) => {
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
        rechargeStatus: "RECHARGE_FAILED",
      });

      const updatedTx = await storage.getTransaction(req.params.id);
      res.json({ success: true, transaction: updatedTx });
    } catch (error) {
      console.error("Admin reject error:", error);
      res.status(500).json({ error: "Failed to reject transaction" });
    }
  });

  app.post("/api/admin/paysprint-test", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { action, operator, canumber, amount, recharge_type, number, type, referenceid } = req.body;

      console.log("\n========================================");
      console.log("[PAYSPRINT TEST] Action:", action);
      console.log("[PAYSPRINT TEST] Timestamp:", new Date().toISOString());
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
          referenceid: testRefId,
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

  app.post("/api/admin/paysprint-test-raw", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { action, operator, canumber, amount, recharge_type, referenceid } = req.body;
      const jwt = await import("jsonwebtoken");
      const { encryptPayload } = await import("./utils/encryption");

      const PAYSPRINT_BASE_URL = process.env.PAYSPRINT_BASE_URL || "https://api.paysprint.in/api/v1";
      const PAYSPRINT_PARTNER_ID = process.env.PAYSPRINT_PARTNER_ID || "";
      const PAYSPRINT_ENV_VAL = process.env.PAYSPRINT_ENV || "PRODUCTION";
      const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
      const useEncryption = PAYSPRINT_ENV_VAL === "PRODUCTION" || PAYSPRINT_ENV_VAL === "LIVE";

      const timestamp = Math.floor(Date.now() / 1000);
      const uniqueReqId = Math.floor(Math.random() * 1000000000).toString();
      const jwtPayload = { timestamp, partnerId: PAYSPRINT_PARTNER_ID, reqid: uniqueReqId };
      const jwtToken = jwt.default.sign(jwtPayload, jwtTokenEnv, { algorithm: "HS256" });

      let endpoint = "/service/recharge/recharge/dorecharge";
      let apiFields: Record<string, unknown> = {};

      if (action === "balance") {
        endpoint = "/service/balance/balance/cashbalance";
        apiFields = {};
      } else if (action === "status") {
        endpoint = "/service/recharge/recharge/status";
        apiFields = { referenceid: referenceid || "TEST123" };
      } else {
        const OPERATOR_MAP: Record<string, number> = { jio: 14, airtel: 4, vi: 33, vodafone: 33, idea: 34, bsnl: 8, mtnl: 10 };
        const opCode = OPERATOR_MAP[(operator || "jio").toLowerCase()] || parseInt(operator) || 14;
        apiFields = {
          operator: opCode,
          canumber: canumber || "7067018549",
          amount: amount || 10,
          referenceid: referenceid || `RSLIVE${timestamp}`,
        };
      }

      const requestBody: Record<string, unknown> = {
        partnerId: PAYSPRINT_PARTNER_ID,
        timestamp: timestamp,
        reqid: uniqueReqId,
        ...apiFields,
      };

      console.log("[PAYSPRINT RAW TEST] Payload before encryption:", JSON.stringify(requestBody));

      const fullUrl = `${PAYSPRINT_BASE_URL}${endpoint}`;
      let bodyStr: string;
      let encryptedOutput = "";
      let encryptionActual = useEncryption ? "AES-128-CBC" : "Plain JSON";
      if (useEncryption) {
        try {
          const encrypted = encryptPayload(requestBody);
          encryptedOutput = encrypted;
          bodyStr = JSON.stringify({ data: encrypted });
        } catch (encErr) {
          console.warn("[PAYSPRINT RAW TEST] AES encryption failed, falling back to plain JSON:", encErr);
          bodyStr = JSON.stringify(requestBody);
          encryptionActual = "Plain JSON (AES fallback)";
        }
      } else {
        bodyStr = JSON.stringify(requestBody);
      }

      const maskedToken = jwtToken.substring(0, 30) + "...";
      const curlCommand = `curl --location --request POST \\\n  "${fullUrl}" \\\n  --header "Content-Type: application/json" \\\n  --header "Token: ${maskedToken}" \\\n  --data-raw '${bodyStr}'`;

      const PAYSPRINT_PROXY_URL = process.env.PAYSPRINT_PROXY_URL || "";
      const paysprintHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Token": jwtToken,
      };

      let rawText: string;
      let httpStatus: number;
      let proxyUsed = false;

      if (PAYSPRINT_PROXY_URL) {
        proxyUsed = true;
        const proxyResponse = await fetch(PAYSPRINT_PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: fullUrl,
            headers: paysprintHeaders,
            payload: JSON.parse(bodyStr),
          }),
        });
        if (!proxyResponse.ok) {
          res.status(502).json({ error: "Lambda proxy error", http_status: proxyResponse.status });
          return;
        }
        const proxyResult = await proxyResponse.json() as { status?: number; body?: string };
        if (typeof proxyResult.status !== "number" || typeof proxyResult.body !== "string") {
          res.status(502).json({ error: "Invalid proxy response", raw: JSON.stringify(proxyResult).substring(0, 200) });
          return;
        }
        httpStatus = proxyResult.status;
        rawText = proxyResult.body;
      } else {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: paysprintHeaders,
          body: bodyStr,
        });
        httpStatus = response.status;
        rawText = await response.text();
      }

      let parsedResponse;
      try {
        const jsonMatch = rawText.match(/\{[^<]*\}$/);
        parsedResponse = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
      } catch {
        parsedResponse = { raw: rawText };
      }

      const decodedJwt = jwt.default.decode(jwtToken);

      res.json({
        debug_report: {
          step1_jwt: {
            payload: jwtPayload,
            decoded: decodedJwt,
            token_preview: jwtToken.substring(0, 30) + "...",
          },
          step2_payload_before_encryption: requestBody,
          step3_encryption: {
            algorithm: encryptionActual,
            encrypted_length: encryptedOutput.length || 0,
            encrypted_preview: encryptedOutput ? encryptedOutput.substring(0, 40) + "..." : "N/A",
          },
          step4_headers: {
            "Token": jwtToken.substring(0, 20) + "...",
            "Content-Type": "application/json",
            "Authorisedkey": "NOT included (LIVE IP BASED)",
          },
          step5_request_body: bodyStr,
          step6_endpoint: fullUrl,
          step7_proxy: proxyUsed ? PAYSPRINT_PROXY_URL : "direct",
          step8_response: {
            http_status: httpStatus,
            body: parsedResponse,
          },
        },
        curl_command: curlCommand,
      });
    } catch (error) {
      console.error("[PAYSPRINT RAW TEST] Error:", error);
      res.status(500).json({ error: "Paysprint raw test failed", details: String(error) });
    }
  });

  let cachedBankList: { banks: any[]; cachedAt: number } | null = null;
  const BANK_CACHE_TTL = 24 * 60 * 60 * 1000;

  app.get("/api/aeps/banks", authMiddleware, async (_req: Request, res: Response) => {
    try {
      if (cachedBankList && (Date.now() - cachedBankList.cachedAt) < BANK_CACHE_TTL) {
        return res.json({ success: true, banks: cachedBankList.banks });
      }
      const result = await aepsService.getAepsBankList();
      const banks = result.banklist?.data || result.data;
      if (result.status && banks) {
        cachedBankList = { banks, cachedAt: Date.now() };
        res.json({ success: true, banks });
      } else {
        res.json({ success: false, error: result.message, banks: [] });
      }
    } catch (error) {
      console.error("AEPS bank list error:", error);
      if (cachedBankList) {
        return res.json({ success: true, banks: cachedBankList.banks });
      }
      res.status(500).json({ error: "Failed to fetch bank list" });
    }
  });

  app.get("/api/aeps/merchant", authMiddleware, async (req: Request, res: Response) => {
    try {
      let merchant = await storage.getAepsMerchant((req as any).userId);
      const user = await storage.getUser((req as any).userId);
      if (!merchant && user) {
        try {
          await autoOnboardMerchant(user.id, user.phone, user.name || "RupyaSetu");
          merchant = await storage.getAepsMerchant(user.id);
        } catch (err: any) {
          console.error("Auto-onboard backfill failed:", err.message);
        }
      } else if (merchant && (!merchant.kycRedirectUrl || merchant.kycStatus === "FAILED") && user) {
        try {
          await retryOnboarding(merchant, user.phone, user.name || "RupyaSetu");
          merchant = await storage.getAepsMerchant(user.id);
        } catch (err: any) {
          console.error("Auto-onboard retry failed:", err.message);
        }
      }
      if (!merchant) {
        return res.json({ merchant: null, onboarded: false });
      }
      const today = new Date().toISOString().split("T")[0];
      const dailyAuth = await storage.getAepsDailyAuth((req as any).userId, today);
      res.json({
        merchant,
        onboarded: merchant.kycStatus === "COMPLETED",
        dailyAuthenticated: dailyAuth?.authenticated || false,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch merchant info" });
    }
  });

  app.post("/api/aeps/onboard", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { merchantCode } = req.body;
      if (!merchantCode) {
        return res.status(400).json({ error: "Merchant code is required" });
      }
      const user = await storage.getUser((req as any).userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      let result = await aepsService.getOnboardingUrl({
        merchantCode,
        mobile: user.phone,
        isNew: true,
      });
      if (!result.status || !result.data?.redirecturl) {
        result = await aepsService.getOnboardingUrl({
          merchantCode,
          mobile: user.phone,
          isNew: false,
        });
      }

      if (result.status && result.data?.redirecturl) {
        const merchant = await storage.getAepsMerchant((req as any).userId);
        if (!merchant) {
          await storage.createAepsMerchant((req as any).userId, merchantCode, "bank2", {
            phone: user.phone,
            createdBy: "self",
            kycRedirectUrl: result.data.redirecturl,
          });
        } else {
          await storage.updateAepsMerchant((req as any).userId, { merchantCode, kycStatus: "PENDING", kycRedirectUrl: result.data.redirecturl });
        }
        res.json({ success: true, redirectUrl: result.data.redirecturl });
      } else {
        res.json({ success: false, response_code: result.response_code ?? null, error: result.message });
      }
    } catch (error) {
      console.error("AEPS onboard error:", error);
      res.status(500).json({ error: "Failed to onboard" });
    }
  });

  app.post("/api/aeps/onboard/complete", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { merchantCode } = req.body;
      const existing = await storage.getAepsMerchant((req as any).userId);
      if (!existing) return res.status(404).json({ error: "Merchant not found. Start onboarding first." });
      if (existing.kycStatus === "COMPLETED") {
        return res.json({ success: true, kycStatus: "COMPLETED" });
      }

      const user = await storage.getUser((req as any).userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const mCode = merchantCode || existing.merchantCode;
      const verifyResult = await aepsService.getOnboardingUrl({
        merchantCode: mCode,
        mobile: user.phone,
      });

      if (verifyResult.status && verifyResult.response_code === 1) {
        const updates: Record<string, string> = { kycStatus: "COMPLETED" };
        if (merchantCode) updates.merchantCode = merchantCode;
        const merchant = await storage.updateAepsMerchant((req as any).userId, updates);
        res.json({ success: true, kycStatus: "COMPLETED" });
      } else {
        res.json({ success: false, kycStatus: "PENDING", message: "KYC verification not yet complete. Please complete the onboarding process first." });
      }
    } catch (error) {
      console.error("AEPS onboard complete error:", error);
      res.status(500).json({ error: "Onboarding verification failed" });
    }
  });

  app.get("/api/aeps/transaction/:id/status", authMiddleware, async (req: Request, res: Response) => {
    try {
      const tx = await storage.getAepsTransaction(req.params.id);
      if (!tx) return res.status(404).json({ error: "Transaction not found" });
      if (tx.userId !== (req as any).userId) return res.status(403).json({ error: "Unauthorized" });

      if (tx.status === "AEPS_PROCESSING" && tx.referenceNo) {
        try {
          const liveStatus = await aepsService.checkAepsTransactionStatus({
            referenceno: tx.referenceNo,
          });
          if (liveStatus.status && liveStatus.data) {
            const newStatus = liveStatus.response_code === 1 ? "AEPS_SUCCESS" : "AEPS_FAILED";
            await storage.updateAepsTransaction(tx.id, {
              status: newStatus,
              message: liveStatus.message,
            });
            tx.status = newStatus;
            tx.message = liveStatus.message;
          }
        } catch {
        }
      }
      res.json({ transaction: tx });
    } catch (error) {
      console.error("AEPS transaction status error:", error);
      res.status(500).json({ error: "Failed to get transaction status" });
    }
  });

  app.post("/api/aeps/2fa/register", authMiddleware, async (req: Request, res: Response) => {
    try {
      const result = await aepsService.twoFactorRegistration(req.body);
      res.json({ success: result.status, message: result.message, data: result.data });
    } catch (error) {
      console.error("AEPS 2FA register error:", error);
      res.status(500).json({ error: "2FA registration failed" });
    }
  });

  app.post("/api/aeps/2fa/authenticate", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { aadhaarNumber, data: biometricData, latitude, longitude } = req.body;
      if (!biometricData) {
        return res.status(400).json({ error: "Biometric data is required for 2FA authentication" });
      }

      const user = await storage.getUser((req as any).userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const merchant = await storage.getAepsMerchant((req as any).userId);
      if (!merchant || merchant.kycStatus !== "COMPLETED") {
        return res.status(403).json({ error: "Complete merchant onboarding first" });
      }

      const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
      const referenceNo = `2FA${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      const fullPayload = {
        accessmodetype: "site",
        adhaarnumber: aadhaarNumber || "",
        mobilenumber: user.phone,
        latitude: latitude || "0.0",
        longitude: longitude || "0.0",
        referenceno: referenceNo,
        submerchantid: merchant.merchantCode || PAYSPRINT_PARTNER_ID,
        data: biometricData,
        ipaddress: ((req as any).ip || "127.0.0.1").replace("::ffff:", ""),
        timestamp,
        is_iris: "NO",
      };

      const result = await aepsService.twoFactorAuthentication(fullPayload);
      if (result.status) {
        const today = new Date().toISOString().split("T")[0];
        await storage.setAepsDailyAuth((req as any).userId, today);
      }
      res.json({ success: result.status, message: result.message, data: result.data });
    } catch (error) {
      console.error("AEPS 2FA auth error:", error);
      res.status(500).json({ error: "2FA authentication failed" });
    }
  });

  app.post("/api/aeps/transaction", authMiddleware, async (req: Request, res: Response) => {
    try {
      const parsed = aepsTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const { type, aadhaarNumber, customerMobile, bankIin, bankName, amount, latitude, longitude, fingerprintData, pipe } = parsed.data;

      const user = await storage.getUser((req as any).userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const merchant = await storage.getAepsMerchant((req as any).userId);
      if (!merchant || merchant.kycStatus !== "COMPLETED") {
        return res.status(403).json({ error: "AEPS merchant onboarding not completed. Please complete KYC first." });
      }

      const today = new Date().toISOString().slice(0, 10);
      const todayAuth = await storage.getAepsDailyAuth((req as any).userId, today);
      if (!todayAuth || !todayAuth.authenticated) {
        return res.status(403).json({ error: "Daily 2FA authentication required. Please authenticate before proceeding." });
      }

      if (!fingerprintData) {
        return res.status(400).json({ error: "Biometric data is required for AEPS transactions." });
      }

      const referenceNo = `AEPS${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const maskedAadhaar = "XXXX-XXXX-" + aadhaarNumber.slice(-4);
      const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

      const aepsTx = await storage.createAepsTransaction({
        userId: (req as any).userId,
        type,
        aadhaarMasked: maskedAadhaar,
        customerMobile,
        bankName,
        bankIin,
        amount: amount || 0,
        status: "AEPS_PROCESSING",
        referenceNo,
      });

      const commonParams = {
        latitude,
        longitude,
        mobilenumber: user.phone,
        referenceno: referenceNo,
        ipaddress: (req.ip || "127.0.0.1").replace("::ffff:", ""),
        adhaarnumber: aadhaarNumber,
        accessmodetype: "site",
        nationalbankidentification: bankIin,
        requestremarks: `${type} via RupyaSetu`,
        data: fingerprintData,
        pipe: pipe || "bank2",
        timestamp,
        transactiontype: type === "CASH_WITHDRAWAL" ? "CW" : type === "BALANCE_ENQUIRY" ? "BE" : type === "MINI_STATEMENT" ? "MS" : type === "AADHAAR_PAY" ? "AP" : "CD",
        submerchantid: merchant.merchantCode || PAYSPRINT_PARTNER_ID,
        is_iris: "NO",
      };

      let result;
      switch (type) {
        case "BALANCE_ENQUIRY":
          result = await aepsService.balanceEnquiry(commonParams);
          break;
        case "MINI_STATEMENT":
          result = await aepsService.miniStatement(commonParams);
          break;
        case "CASH_WITHDRAWAL":
          if (!amount || amount <= 0) {
            await storage.updateAepsTransaction(aepsTx.id, { status: "AEPS_FAILED", message: "Amount is required for cash withdrawal" });
            return res.status(400).json({ error: "Amount is required for cash withdrawal" });
          }
          result = await aepsService.cashWithdrawal({ ...commonParams, amount });
          break;
        case "AADHAAR_PAY":
          if (!amount || amount <= 0) {
            await storage.updateAepsTransaction(aepsTx.id, { status: "AEPS_FAILED", message: "Amount is required for Aadhaar pay" });
            return res.status(400).json({ error: "Amount is required for Aadhaar pay" });
          }
          result = await aepsService.aadhaarPay({ ...commonParams, amount });
          break;
        case "CASH_DEPOSIT":
          if (!amount || amount <= 0) {
            await storage.updateAepsTransaction(aepsTx.id, { status: "AEPS_FAILED", message: "Amount is required for cash deposit" });
            return res.status(400).json({ error: "Amount is required for cash deposit" });
          }
          result = await aepsService.cashDeposit({ ...commonParams, amount });
          break;
        default:
          await storage.updateAepsTransaction(aepsTx.id, { status: "AEPS_FAILED", message: "Invalid transaction type" });
          return res.status(400).json({ error: "Invalid transaction type" });
      }

      const updateData: Record<string, any> = {};
      let commissionCredited = 0;
      let serviceChargeDeducted = 0;
      if (result.status) {
        updateData.status = "AEPS_SUCCESS";
        updateData.paysprintRefId = result.bankrrn || result.txnid || result.data?.ackno || "";
        if (result.balanceamount) updateData.balance = result.balanceamount;
        if (result.ministatement) updateData.miniStatement = JSON.stringify(result.ministatement);
        updateData.message = result.message;

        if (type === "AADHAAR_PAY" && amount && amount > 0) {
          const charge = Math.round(amount * 0.00531 * 100) / 100;
          updateData.serviceCharge = charge;
          serviceChargeDeducted = charge;
        } else {
          try {
            const alreadyCredited = await storage.hasCommissionCredit(referenceNo, type);
            if (!alreadyCredited) {
              const commissionConfigs = await storage.getCommissionConfig();
              const commissionConfig = commissionConfigs.find(c => c.serviceType === type);
              if (commissionConfig && commissionConfig.commissionAmount > 0) {
                let earnedAmount = 0;
                if (commissionConfig.commissionType === "FIXED") {
                  earnedAmount = commissionConfig.commissionAmount;
                } else {
                  earnedAmount = Math.round(((amount || 0) * commissionConfig.commissionAmount / 100) * 100) / 100;
                }
                if (earnedAmount > 0) {
                  await storage.creditCommission(
                    (req as any).userId,
                    earnedAmount,
                    type,
                    referenceNo,
                    `Commission earned for ${type.replace(/_/g, " ")} - Ref: ${referenceNo}`
                  );
                  commissionCredited = earnedAmount;
                }
              }
            }
          } catch (commErr: any) {
            console.error("Commission credit error:", commErr.message);
          }
        }
      } else {
        updateData.status = "AEPS_FAILED";
        updateData.message = result.message;
      }

      const updatedTx = await storage.updateAepsTransaction(aepsTx.id, updateData);

      res.json({
        success: result.status,
        transaction: updatedTx,
        message: result.message,
        balance: result.balanceamount,
        miniStatement: result.ministatement,
        referenceNo: result.bankrrn || referenceNo,
        commissionEarned: commissionCredited,
        serviceCharge: serviceChargeDeducted || undefined,
      });
    } catch (error) {
      console.error("AEPS transaction error:", error);
      res.status(500).json({ error: "AEPS transaction failed" });
    }
  });

  const PAYSPRINT_PARTNER_ID = process.env.PAYSPRINT_PARTNER_ID || "";

  app.get("/api/aeps/transactions", authMiddleware, async (req: Request, res: Response) => {
    try {
      const transactions = await storage.getUserAepsTransactions((req as any).userId);
      res.json({ transactions });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch AEPS transactions" });
    }
  });

  app.get("/api/admin/merchants", adminAuthMiddleware, async (_req: Request, res: Response) => {
    try {
      const merchants = await storage.getAllAepsMerchants();
      const enriched = await Promise.all(
        merchants.map(async (m) => {
          const user = await storage.getUser(m.userId);
          return { ...m, userPhone: user?.phone || m.phone || "Unknown", userName: user?.name || "" };
        })
      );
      res.json({ merchants: enriched });
    } catch (error) {
      console.error("Failed to fetch merchants:", error);
      res.status(500).json({ error: "Failed to fetch merchants" });
    }
  });

  app.post("/api/admin/merchants", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { phone, firmName } = req.body;
      if (!phone || !firmName) {
        return res.status(400).json({ error: "Phone and firm name are required" });
      }
      const phoneClean = phone.replace(/\D/g, "").slice(-10);
      if (!/^[6-9]\d{9}$/.test(phoneClean)) {
        return res.status(400).json({ error: "Invalid Indian mobile number" });
      }

      const existing = await storage.getAepsMerchantByPhone(phoneClean);
      if (existing) {
        return res.status(409).json({ error: "A merchant with this phone number already exists" });
      }

      let user = await storage.getUserByPhone(phoneClean);
      if (!user) {
        user = await storage.createUser(phoneClean);
      }

      const existingByUser = await storage.getAepsMerchant(user.id);
      if (existingByUser) {
        return res.status(409).json({ error: "This user is already registered as a merchant" });
      }

      const merchantCode = "RS-" + Math.random().toString(36).substring(2, 8).toUpperCase();

      let kycRedirectUrl = "";
      try {
        const onboardResult = await aepsService.getOnboardingUrl({
          merchantCode,
          mobile: phoneClean,
          email: "",
          firmName: firmName,
          isNew: true,
        });
        if (onboardResult.status && onboardResult.data?.redirecturl) {
          kycRedirectUrl = onboardResult.data.redirecturl;
        }
      } catch (err: any) {
        console.error("Paysprint onboarding call failed:", err.message);
      }

      const merchant = await storage.createAepsMerchant(user.id, merchantCode, "bank2", {
        phone: phoneClean,
        firmName,
        kycRedirectUrl,
        createdBy: "admin",
      });

      res.json({ success: true, merchant });
    } catch (error) {
      console.error("Failed to create merchant:", error);
      res.status(500).json({ error: "Failed to create merchant" });
    }
  });

  app.patch("/api/admin/merchants/:id", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { kycStatus } = req.body;

      const merchant = await storage.getAepsMerchantById(id);
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      const updated = await storage.updateAepsMerchant(merchant.userId, { kycStatus });
      res.json({ success: true, merchant: updated });
    } catch (error) {
      console.error("Failed to update merchant:", error);
      res.status(500).json({ error: "Failed to update merchant" });
    }
  });

  app.delete("/api/admin/merchants/:id", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteAepsMerchant(id);
      if (!deleted) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete merchant:", error);
      res.status(500).json({ error: "Failed to delete merchant" });
    }
  });

  app.get("/api/wallet", authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const wallet = await storage.getOrCreateWallet(userId);
      const transactions = await storage.getUserWalletTransactions(userId);
      res.json({ wallet, transactions });
    } catch (error) {
      console.error("Failed to fetch wallet:", error);
      res.status(500).json({ error: "Failed to fetch wallet" });
    }
  });

  app.post("/api/wallet/recharge", authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { amount, utr } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      if (!utr || !validateUtr(utr)) {
        return res.status(400).json({ error: "Invalid UTR number" });
      }
      const wallet = await storage.getOrCreateWallet(userId);
      const walletTx = await storage.createWalletTransaction({
        userId,
        type: "RECHARGE",
        amount,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance,
        reference: `WR-${Date.now().toString(36).toUpperCase()}`,
        description: `Wallet recharge of ₹${amount}`,
        status: "PENDING",
        utr,
      });
      res.json({
        success: true,
        transaction: walletTx,
        payeeUpiId: PAYEE_UPI_ID,
        message: "Recharge request submitted. Pending admin approval.",
      });
    } catch (error) {
      console.error("Failed to request wallet recharge:", error);
      res.status(500).json({ error: "Failed to request wallet recharge" });
    }
  });

  app.get("/api/wallet/commission", authMiddleware, async (_req: Request, res: Response) => {
    try {
      const config = await storage.getCommissionConfig();
      res.json({ commission: config });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch commission config" });
    }
  });

  app.get("/api/admin/wallets", adminAuthMiddleware, async (_req: Request, res: Response) => {
    try {
      const wallets = await storage.getAllWallets();
      const pendingRecharges = await storage.getPendingWalletRecharges();
      res.json({ wallets, pendingRecharges });
    } catch (error) {
      console.error("Failed to fetch wallets:", error);
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });

  app.post("/api/admin/wallets/:txId/approve", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { txId } = req.params;
      const { action } = req.body;
      const walletTx = await storage.getWalletTransaction(txId);
      if (!walletTx) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      if (walletTx.status !== "PENDING") {
        return res.status(400).json({ error: "Transaction already processed" });
      }
      if (action === "approve") {
        const wallet = await storage.getOrCreateWallet(walletTx.userId);
        const newBalance = wallet.balance + walletTx.amount;
        await storage.updateWalletBalance(walletTx.userId, walletTx.amount);
        await storage.updateWalletTransaction(txId, { status: "APPROVED", balanceAfter: newBalance });
        res.json({ success: true, message: `Approved ₹${walletTx.amount} recharge`, newBalance });
      } else if (action === "reject") {
        await storage.updateWalletTransaction(txId, { status: "REJECTED" });
        res.json({ success: true, message: "Recharge rejected" });
      } else {
        res.status(400).json({ error: "Invalid action. Use 'approve' or 'reject'" });
      }
    } catch (error) {
      console.error("Failed to process wallet recharge:", error);
      res.status(500).json({ error: "Failed to process wallet recharge" });
    }
  });

  app.post("/api/admin/wallets/:userId/adjust", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { amount, description } = req.body;
      if (!amount || typeof amount !== "number") {
        return res.status(400).json({ error: "Invalid amount" });
      }
      const wallet = await storage.getOrCreateWallet(userId);
      const newBalance = wallet.balance + amount;
      if (newBalance < 0) {
        return res.status(400).json({ error: "Insufficient balance for this adjustment" });
      }
      await storage.updateWalletBalance(userId, amount);
      await storage.createWalletTransaction({
        userId,
        type: "ADJUSTMENT",
        amount: Math.abs(amount),
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        reference: `ADJ-${Date.now().toString(36).toUpperCase()}`,
        description: description || `Admin adjustment of ₹${amount}`,
        status: "COMPLETED",
      });
      res.json({ success: true, newBalance, message: `Balance adjusted by ₹${amount}` });
    } catch (error) {
      console.error("Failed to adjust wallet:", error);
      res.status(500).json({ error: "Failed to adjust wallet" });
    }
  });

  app.get("/api/admin/commission", adminAuthMiddleware, async (_req: Request, res: Response) => {
    try {
      const config = await storage.getCommissionConfig();
      res.json({ commission: config });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch commission config" });
    }
  });

  app.post("/api/admin/commission", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { serviceType, commissionAmount, commissionType } = req.body;
      if (!serviceType || commissionAmount === undefined || !commissionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const config = await storage.updateCommissionConfig(serviceType, commissionAmount, commissionType);
      res.json({ success: true, config });
    } catch (error) {
      console.error("Failed to update commission:", error);
      res.status(500).json({ error: "Failed to update commission" });
    }
  });

  app.get("/api/admin/aeps-transactions", adminAuthMiddleware, async (_req: Request, res: Response) => {
    try {
      const allTx = await storage.getAllAepsTransactions();
      const enriched = await Promise.all(
        allTx.map(async (tx) => {
          const user = await storage.getUser(tx.userId);
          return { ...tx, userPhone: user?.phone || "Unknown" };
        })
      );
      res.json({ transactions: enriched });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch AEPS transactions" });
    }
  });

  app.get("/api/admin/aeps-api-logs", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const endpoint = req.query.endpoint as string | undefined;
      const successParam = req.query.success as string | undefined;
      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;
      const rawLimit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const rawOffset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
      const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

      const filters: { endpoint?: string; success?: boolean; fromDate?: string; toDate?: string; limit: number; offset: number } = { limit, offset };
      if (endpoint) filters.endpoint = endpoint;
      if (successParam === "true") filters.success = true;
      if (successParam === "false") filters.success = false;
      if (fromDate) filters.fromDate = fromDate;
      if (toDate) filters.toDate = toDate;

      const result = await storage.getAepsApiLogs(filters);
      res.json(result);
    } catch (error) {
      console.error("Failed to fetch AEPS API logs:", error);
      res.status(500).json({ error: "Failed to fetch AEPS API logs" });
    }
  });

  app.get("/api/admin/server-info", adminAuthMiddleware, async (_req: Request, res: Response) => {
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json");
      const ipData = await ipRes.json() as { ip: string };

      let proxyIp = "N/A";
      const proxyUrl = process.env.PAYSPRINT_PROXY_URL || "";
      if (proxyUrl) {
        try {
          const proxyIpRes = await fetch(proxyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: "https://checkip.amazonaws.com", headers: {}, payload: {} }),
          });
          const proxyIpData = await proxyIpRes.json() as { body: string };
          proxyIp = proxyIpData.body?.trim() || "unknown";
        } catch { proxyIp = "error"; }
      }

      res.json({
        server_outbound_ip: ipData.ip,
        proxy_outbound_ip: proxyIp,
        proxy_url: proxyUrl || "not configured",
        env: process.env.PAYSPRINT_ENV,
        base_url: process.env.PAYSPRINT_BASE_URL,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to check IP", details: String(error) });
    }
  });

  app.get("/api/admin/aeps-report", adminAuthMiddleware, async (_req: Request, res: Response) => {
    try {
      const pdfBuffer = await generateAepsReport();
      const filename = `RupyaSetu_AEPS_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("AEPS report generation error:", error);
      res.status(500).json({ error: "Failed to generate AEPS report" });
    }
  });

  app.post("/api/paysprint/callback", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      console.log("[PaySprint Recharge Callback]", JSON.stringify(body));
      if (body.referenceid || body.operatorref) {
        const txId = body.referenceid || body.operatorref;
        const tx = await storage.getTransactionByReference(txId);
        if (tx) {
          const newStatus = body.status === "SUCCESS" || body.status === "1" ? "COMPLETED" : "FAILED";
          await storage.updateTransaction(tx.id, {
            rechargeStatus: newStatus,
            paysprintRefId: body.rrn || body.refid || tx.paysprintRefId,
          });
          console.log(`[PaySprint Recharge Callback] Updated tx ${tx.id} → ${newStatus}`);
        }
      }
      res.status(200).json({ status: true });
    } catch (error) {
      console.error("[PaySprint Recharge Callback] Error:", error);
      res.status(200).json({ status: true });
    }
  });

  app.post("/api/paysprint/aeps-callback", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      console.log("[PaySprint AEPS Callback]", JSON.stringify(body));
      if (body.merchantcode) {
        const merchant = await storage.getAepsMerchantByCode(body.merchantcode);
        if (merchant) {
          const kycStatus = body.status === "SUCCESS" || body.kycstatus === "COMPLETED" ? "COMPLETED" : "PENDING";
          await storage.updateAepsMerchant(merchant.userId, { kycStatus });
          console.log(`[PaySprint AEPS Callback] Merchant ${body.merchantcode} KYC → ${kycStatus}`);
        }
      }
      res.status(200).json({ status: true });
    } catch (error) {
      console.error("[PaySprint AEPS Callback] Error:", error);
      res.status(200).json({ status: true });
    }
  });

  app.get("/api/commission/balance", authMiddleware, async (req: Request, res: Response) => {
    try {
      const wallet = await storage.getOrCreateCommissionWallet((req as any).userId);
      res.json({ wallet });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch commission balance" });
    }
  });

  app.get("/api/commission/history", authMiddleware, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;
      const allTransactions = await storage.getUserCommissionTransactions((req as any).userId);
      const total = allTransactions.length;
      const transactions = allTransactions.slice(offset, offset + limit);
      res.json({ transactions, total, page, limit, hasMore: offset + limit < total });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch commission history" });
    }
  });

  app.post("/api/commission/withdraw", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { amount, mode, upiId, accountNumber, ifscCode, accountName, bankName } = req.body;
      if (!amount || amount < 50) {
        return res.status(400).json({ error: "Minimum withdrawal amount is ₹50" });
      }
      if (!mode || !["UPI", "BANK"].includes(mode)) {
        return res.status(400).json({ error: "Invalid withdrawal mode" });
      }
      if (mode === "UPI" && !upiId) {
        return res.status(400).json({ error: "UPI ID is required" });
      }
      if (mode === "BANK" && (!accountNumber || !ifscCode || !accountName || !bankName)) {
        return res.status(400).json({ error: "Bank name, account holder name, account number, and IFSC code are required" });
      }
      const wallet = await storage.getOrCreateCommissionWallet((req as any).userId);
      if (wallet.balance < amount) {
        return res.status(400).json({ error: `Insufficient commission balance. Available: ₹${wallet.balance.toFixed(2)}` });
      }
      const pendingWithdrawals = await storage.getUserCommissionWithdrawals((req as any).userId);
      const hasPending = pendingWithdrawals.some(w => w.status === "PENDING");
      if (hasPending) {
        return res.status(400).json({ error: "You already have a pending withdrawal request" });
      }
      const withdrawal = await storage.createCommissionWithdrawal({
        userId: (req as any).userId,
        amount,
        mode,
        upiId: mode === "UPI" ? upiId : undefined,
        accountNumber: mode === "BANK" ? accountNumber : undefined,
        ifscCode: mode === "BANK" ? ifscCode : undefined,
        accountName: mode === "BANK" ? accountName : undefined,
        bankName: mode === "BANK" ? bankName : undefined,
        status: "PENDING",
      });
      res.json({ success: true, withdrawal });
    } catch (error) {
      console.error("Commission withdraw error:", error);
      res.status(500).json({ error: "Failed to submit withdrawal request" });
    }
  });

  app.get("/api/commission/withdrawals", authMiddleware, async (req: Request, res: Response) => {
    try {
      const withdrawals = await storage.getUserCommissionWithdrawals((req as any).userId);
      res.json({ withdrawals });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch withdrawals" });
    }
  });

  app.get("/api/admin/commission-withdrawals", adminAuthMiddleware, async (_req: Request, res: Response) => {
    try {
      const withdrawals = await storage.getAllCommissionWithdrawals();
      res.json({ withdrawals });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch commission withdrawals" });
    }
  });

  const handleApproveWithdrawal = async (req: Request, res: Response) => {
    try {
      const withdrawal = await storage.getCommissionWithdrawal(req.params.id);
      if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });
      if (withdrawal.status !== "PENDING") return res.status(400).json({ error: "Withdrawal is not pending" });
      const updated = await storage.updateCommissionWithdrawal(req.params.id, {
        status: "APPROVED",
        adminNote: req.body.note || "Approved by admin",
      });
      res.json({ success: true, withdrawal: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to approve withdrawal" });
    }
  };

  const handleRejectWithdrawal = async (req: Request, res: Response) => {
    try {
      const withdrawal = await storage.getCommissionWithdrawal(req.params.id);
      if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });
      if (withdrawal.status !== "PENDING") return res.status(400).json({ error: "Withdrawal is not pending" });
      await storage.refundCommissionWithdrawal(req.params.id, withdrawal.userId, withdrawal.amount);
      const updated = await storage.updateCommissionWithdrawal(req.params.id, {
        status: "REJECTED",
        adminNote: req.body.note || "Rejected by admin",
      });
      res.json({ success: true, withdrawal: updated });
    } catch (error) {
      console.error("Commission withdrawal reject error:", error);
      res.status(500).json({ error: "Failed to reject withdrawal" });
    }
  };

  app.post("/api/admin/commission-withdrawals/:id/approve", adminAuthMiddleware, handleApproveWithdrawal);
  app.patch("/api/admin/commission-withdrawals/:id/approve", adminAuthMiddleware, handleApproveWithdrawal);
  app.post("/api/admin/commission-withdrawals/:id/reject", adminAuthMiddleware, handleRejectWithdrawal);
  app.patch("/api/admin/commission-withdrawals/:id/reject", adminAuthMiddleware, handleRejectWithdrawal);

  const httpServer = createServer(app);
  return httpServer;
}
