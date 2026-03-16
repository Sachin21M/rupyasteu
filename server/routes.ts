import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import { generateJwtToken, verifyJwtToken } from "./utils/encryption";
import { validateUtr, validatePhone, validateAmount } from "./utils/validators";
import { generateOtp, sendSmsAlert } from "./utils/smsalert";
import { initiateRecharge, checkRechargeStatus, getOperatorInfo } from "./services/paysprint";
import { sendOtpSchema, verifyOtpSchema, createRechargeSchema, submitUtrSchema } from "../shared/schema";

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

      const PAYSPRINT_BASE_URL = process.env.PAYSPRINT_BASE_URL || "https://api.paysprint.in/service-api/api/v1";
      const PAYSPRINT_PARTNER_NAME = "RUPYASETU";
      const PAYSPRINT_ENV_VAL = process.env.PAYSPRINT_ENV || "PRODUCTION";
      const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
      const useEncryption = PAYSPRINT_ENV_VAL === "PRODUCTION" || PAYSPRINT_ENV_VAL === "LIVE";

      const timestamp = Math.floor(Date.now() / 1000);
      const uniqueReqId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const jwtPayload = { timestamp, partnerId: PAYSPRINT_PARTNER_NAME, reqid: uniqueReqId };
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
        partnerId: PAYSPRINT_PARTNER_NAME,
        timestamp: timestamp,
        reqid: uniqueReqId,
        ...apiFields,
      };

      console.log("[PAYSPRINT RAW TEST] Payload before encryption:", JSON.stringify(requestBody));

      const fullUrl = `${PAYSPRINT_BASE_URL}${endpoint}`;
      let bodyStr: string;
      let encryptedOutput = "";
      let encryptionActual = useEncryption ? "AES-256-CBC" : "Plain JSON";
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
      const curlCommand = `curl --location --request POST \\\n  "${fullUrl}" \\\n  --header "Content-Type: application/json" \\\n  --header "Authorization: Bearer ${maskedToken}" \\\n  --data-raw '${bodyStr}'`;

      const PAYSPRINT_PROXY_URL = process.env.PAYSPRINT_PROXY_URL || "";
      const paysprintHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + jwtToken,
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
            "Authorization": "Bearer " + jwtToken.substring(0, 20) + "...",
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

  const httpServer = createServer(app);
  return httpServer;
}
