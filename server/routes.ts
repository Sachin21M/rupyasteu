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
const PAYEE_UPI_ID = process.env.PAYEE_UPI_ID || "rupyasetu@upi";
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
    } catch (error) {
      console.error("Verify OTP error:", error);
      res.status(500).json({ error: "Failed to verify OTP" });
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
      if (result.status && result.data) {
        cachedBankList = { banks: result.data, cachedAt: Date.now() };
        res.json({ success: true, banks: result.data });
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
      const merchant = await storage.getAepsMerchant((req as any).userId);
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

      const result = await aepsService.getOnboardingUrl({
        merchantCode,
        mobile: user.phone,
      });

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
        res.json({ success: false, error: result.message });
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
      if (result.status) {
        updateData.status = "AEPS_SUCCESS";
        updateData.paysprintRefId = result.bankrrn || result.txnid || result.data?.ackno || "";
        if (result.balanceamount) updateData.balance = result.balanceamount;
        if (result.ministatement) updateData.miniStatement = JSON.stringify(result.ministatement);
        updateData.message = result.message;
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
          firm: firmName,
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

  const httpServer = createServer(app);
  return httpServer;
}
