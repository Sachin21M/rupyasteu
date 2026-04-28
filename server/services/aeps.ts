import jwt from "jsonwebtoken";
import crypto from "crypto";
import { storage } from "../storage";

// In-memory store for eKYC OTP sessions (merchantCode → otpreqid)
const ekycOtpStore = new Map<string, { otpreqid: string; expiresAt: number }>();

function cleanExpiredEkycSessions() {
  const now = Date.now();
  for (const [key, val] of ekycOtpStore.entries()) {
    if (val.expiresAt < now) ekycOtpStore.delete(key);
  }
}

export function encryptAesBody(payload: Record<string, unknown>): string {
  const keyHex = process.env.PAYSPRINT_AES_KEY || "";
  const ivHex = process.env.PAYSPRINT_AES_IV || "";
  if (!keyHex || !ivHex) throw new Error("AES key/IV not configured");
  const key = Buffer.from(keyHex, "utf8").slice(0, 16);
  const iv = Buffer.from(ivHex, "utf8").slice(0, 16);
  const jsonStr = JSON.stringify(payload);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  let encrypted = cipher.update(jsonStr, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

export function extractAndEncryptPid(pidXml: string): string {
  if (!pidXml.includes("<PidData>") && !pidXml.includes("<PidData ")) {
    throw new Error("Invalid PID XML: missing <PidData>");
  }
  const errMatch = pidXml.match(/errCode="(\d+)"/);
  if (errMatch && errMatch[1] !== "0") {
    throw new Error(`Biometric capture failed (errCode=${errMatch[1]})`);
  }
  if (!pidXml.includes("<Skey") && !pidXml.includes("<Skey>")) {
    throw new Error("Invalid PID XML: missing <Skey> (session key)");
  }
  if (!pidXml.includes("<Hmac>") && !pidXml.includes("<Hmac ")) {
    throw new Error("Invalid PID XML: missing <Hmac>");
  }
  const dataMatch = pidXml.match(/<Data[^>]*>([^<]+)<\/Data>/);
  if (!dataMatch || !dataMatch[1]) {
    throw new Error("Invalid PID XML: <Data> tag missing or empty");
  }
  const rawData = dataMatch[1].trim();
  if (rawData.length < 500) {
    throw new Error(`Invalid biometric data: PID <Data> too short (${rawData.length} chars, need ≥ 500)`);
  }

  console.log("[eKYC] PID length:", pidXml.length);
  console.log("[eKYC] Extracted data length:", rawData.length);

  const keyHex = process.env.PAYSPRINT_AES_KEY || "";
  const ivHex = process.env.PAYSPRINT_AES_IV || "";
  if (!keyHex || !ivHex) throw new Error("AES key/IV not configured");
  const key = Buffer.from(keyHex, "utf8").slice(0, 16);
  const iv = Buffer.from(ivHex, "utf8").slice(0, 16);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  let encrypted = cipher.update(rawData, "utf8", "base64");
  encrypted += cipher.final("base64");

  console.log("[eKYC] Encrypted PID length:", encrypted.length);

  return encrypted;
}

const SENSITIVE_KEYS = new Set([
  "adhaarnumber", "aadhaar", "aadhar", "aadharnumber",
  "piddata", "pid", "biometric", "biometricdata",
  "data", "hmac", "skey", "ci", "sessionkey",
]);

function maskSensitiveFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return obj.replace(/\b\d{12}\b/g, (m) => "XXXX-XXXX-" + m.slice(-4));
  }
  if (Array.isArray(obj)) return obj.map(maskSensitiveFields);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        if (lowerKey === "adhaarnumber" || lowerKey === "aadhaar" || lowerKey === "aadhar" || lowerKey === "aadharnumber") {
          result[key] = typeof value === "string" && value.length >= 4
            ? "XXXX-XXXX-" + value.slice(-4)
            : "[REDACTED]";
        } else {
          result[key] = "[REDACTED]";
        }
      } else {
        result[key] = maskSensitiveFields(value);
      }
    }
    return result;
  }
  return obj;
}

const PAYSPRINT_BASE_URL = process.env.PAYSPRINT_BASE_URL || "https://api.paysprint.in/api/v1";
const PAYSPRINT_PARTNER_ID = process.env.PAYSPRINT_PARTNER_ID || "";
const PAYSPRINT_ENV = process.env.PAYSPRINT_ENV || "PRODUCTION";
const PAYSPRINT_PROXY_URL = process.env.PAYSPRINT_PROXY_URL || "";

const AEPS_TIMEOUT = 180000;

function isProductionEnv(): boolean {
  return PAYSPRINT_ENV === "PRODUCTION" || PAYSPRINT_ENV === "LIVE";
}

function generateUniqueReqId(): number {
  return Math.floor(Math.random() * 1000000000);
}

function generatePaysprintJWT(): { token: string; payload: Record<string, unknown> } {
  const timestamp = Math.floor(Date.now() / 1000);
  const reqid = generateUniqueReqId();
  const payload = {
    iss: "PAYSPRINT",
    timestamp,
    partnerId: PAYSPRINT_PARTNER_ID,
    product: "WALLET",
    reqid,
  };
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  const token = jwt.sign(payload, jwtTokenEnv, { algorithm: "HS256" });
  return { token, payload };
}

interface AepsResponse {
  status: boolean;
  response_code: number;
  message: string;
  data?: any;
  redirecturl?: string;
  banklist?: { status: boolean; message: string; data: any[] };
  balanceamount?: string;
  bankrrn?: string;
  ministatement?: any[];
  txnid?: string;
}

async function logAepsApiCall(
  endpoint: string,
  requestPayload: Record<string, unknown>,
  responseBody: string,
  httpStatus: number,
  success: boolean,
  durationMs: number,
  errorMessage?: string
) {
  try {
    const maskedPayload = maskSensitiveFields(requestPayload) as Record<string, unknown>;
    let maskedResponse = responseBody;
    try {
      const parsed = JSON.parse(responseBody);
      maskedResponse = JSON.stringify(maskSensitiveFields(parsed));
    } catch {
      maskedResponse = typeof responseBody === "string"
        ? responseBody.replace(/\b\d{12}\b/g, (m) => "XXXX-XXXX-" + m.slice(-4))
        : responseBody;
    }
    await storage.createAepsApiLog({
      endpoint,
      method: "POST",
      requestPayload: JSON.stringify(maskedPayload, null, 2),
      responseBody: maskedResponse,
      httpStatus,
      success,
      durationMs,
      errorMessage,
    });
  } catch (err) {
    console.error("[AEPS LOG] Failed to save API log:", err);
  }
}

async function makeAepsRequest(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<AepsResponse> {
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  if (!jwtTokenEnv) {
    console.log("[AEPS SIMULATION] No JWT token configured. Simulating:", endpoint);
    const simResult = simulateAepsResponse(endpoint, payload);
    await logAepsApiCall(endpoint, payload, JSON.stringify(simResult), 200, simResult.status, 0, "SIMULATION MODE");
    return simResult;
  }

  const fullUrl = `${PAYSPRINT_BASE_URL}${endpoint}`;
  const startTime = Date.now();
  const timestamp = Math.floor(Date.now() / 1000);
  const reqid = generateUniqueReqId();
  const fullPayload: Record<string, unknown> = {
    partnerid: PAYSPRINT_PARTNER_ID,
    timestamp,
    reqid,
    ...payload,
  };

  try {
    console.log(`[AEPS] Request to ${endpoint}`);

    const jwtResult = generatePaysprintJWT();
    const jwtToken = jwtResult.token;

    const requestBody = JSON.stringify(fullPayload);

    const PAYSPRINT_AUTHORIZED_KEY = process.env.PAYSPRINT_AUTHORIZED_KEY || "";
    const paysprintHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Token": jwtToken,
      // Authorisedkey is only required in UAT (not in LIVE when using dedicated IP whitelist)
      ...(!isProductionEnv() && PAYSPRINT_AUTHORIZED_KEY ? { "Authorisedkey": PAYSPRINT_AUTHORIZED_KEY } : {}),
    };

    let rawText: string;
    let httpStatus: number;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AEPS_TIMEOUT);

    try {
      if (PAYSPRINT_PROXY_URL) {
        const proxyResponse = await fetch(PAYSPRINT_PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: fullUrl,
            headers: paysprintHeaders,
            payload: JSON.parse(requestBody),
          }),
          signal: controller.signal,
        });
        if (!proxyResponse.ok) {
          const duration = Date.now() - startTime;
          const errResult = { status: false, response_code: 502, message: `Proxy error: HTTP ${proxyResponse.status}` };
          await logAepsApiCall(endpoint, fullPayload, JSON.stringify(errResult), proxyResponse.status, false, duration, `Proxy error: HTTP ${proxyResponse.status}`);
          return errResult;
        }
        const proxyResult = await proxyResponse.json() as { status?: number; body?: string };
        if (typeof proxyResult.status !== "number" || typeof proxyResult.body !== "string") {
          const duration = Date.now() - startTime;
          const errResult = { status: false, response_code: 502, message: "Invalid response from proxy" };
          await logAepsApiCall(endpoint, fullPayload, JSON.stringify(proxyResult), 502, false, duration, "Invalid proxy response format");
          return errResult;
        }
        httpStatus = proxyResult.status;
        rawText = proxyResult.body;
      } else {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: paysprintHeaders,
          body: requestBody,
          signal: controller.signal,
        });
        httpStatus = response.status;
        rawText = await response.text();
      }
    } finally {
      clearTimeout(timeout);
    }

    const duration = Date.now() - startTime;
    console.log(`[AEPS] Response from ${endpoint}: HTTP ${httpStatus} (${duration}ms)`);
    console.log(`[AEPS] Body: ${rawText.substring(0, 500)}`);

    let jsonText = rawText;
    const jsonMatch = rawText.match(/\{[^<]*\}$/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    let data: AepsResponse;
    try {
      data = JSON.parse(jsonText) as AepsResponse;
    } catch {
      if (rawText.includes("not available in your region")) {
        const errResult = { status: false, response_code: 403, message: "AEPS API blocked: geographic restriction" };
        await logAepsApiCall(endpoint, fullPayload, rawText, httpStatus, false, duration, "Geographic restriction");
        return errResult;
      }
      const errResult = { status: false, response_code: 500, message: "Invalid JSON response from Paysprint AEPS" };
      await logAepsApiCall(endpoint, fullPayload, rawText, httpStatus, false, duration, "Invalid JSON response");
      return errResult;
    }

    await logAepsApiCall(endpoint, fullPayload, rawText, httpStatus, data.status, duration);

    return data;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    if (error.name === "AbortError") {
      const errResult = { status: false, response_code: 408, message: "AEPS request timeout (180s)" };
      await logAepsApiCall(endpoint, fullPayload, JSON.stringify(errResult), 408, false, duration, "Request timeout (180s)");
      return errResult;
    }
    console.error("[AEPS] Network Error:", error);
    const errResult = { status: false, response_code: 500, message: "Failed to connect to AEPS service" };
    await logAepsApiCall(endpoint, fullPayload, JSON.stringify(errResult), 500, false, duration, error.message);
    return errResult;
  }
}

function simulateAepsResponse(endpoint: string, payload: Record<string, unknown>): AepsResponse {
  if (endpoint.includes("banklist")) {
    return {
      status: true, response_code: 1, message: "Bank list fetched",
      data: [
        { iinno: "607094", bankName: "State Bank of India" },
        { iinno: "608001", bankName: "Punjab National Bank" },
        { iinno: "508505", bankName: "Bank of India" },
        { iinno: "607161", bankName: "Bank of Baroda" },
        { iinno: "607387", bankName: "Union Bank of India" },
        { iinno: "607095", bankName: "Canara Bank" },
        { iinno: "607027", bankName: "Indian Bank" },
        { iinno: "607105", bankName: "Central Bank of India" },
        { iinno: "607153", bankName: "IDBI Bank" },
        { iinno: "607021", bankName: "UCO Bank" },
      ],
    };
  }
  if (endpoint.includes("balanceenquiry")) {
    return {
      status: true, response_code: 1, message: "Balance enquiry successful",
      balanceamount: "15432.50", bankrrn: `RRN${Date.now()}`,
    };
  }
  if (endpoint.includes("ministatement")) {
    return {
      status: true, response_code: 1, message: "Mini statement fetched",
      balanceamount: "15432.50", bankrrn: `RRN${Date.now()}`,
      ministatement: [
        { date: "15/03/2026", txnType: "CR", amount: "5000.00", narration: "NEFT-CREDIT" },
        { date: "14/03/2026", txnType: "DR", amount: "2000.00", narration: "ATM-WITHDRAWAL" },
        { date: "13/03/2026", txnType: "CR", amount: "25000.00", narration: "SALARY" },
      ],
    };
  }
  if (endpoint.includes("cashwithdraw")) {
    return {
      status: true, response_code: 1, message: "Cash withdrawal successful",
      balanceamount: "13432.50", bankrrn: `RRN${Date.now()}`,
      data: { ackno: `AEPS${Date.now()}` },
    };
  }
  if (endpoint.includes("aadharpay")) {
    return {
      status: true, response_code: 1, message: "Aadhaar pay successful",
      bankrrn: `RRN${Date.now()}`,
      data: { ackno: `AEPS${Date.now()}` },
    };
  }
  if (endpoint.includes("cashdeposit")) {
    return {
      status: true, response_code: 1, message: "Cash deposit successful",
      bankrrn: `RRN${Date.now()}`,
      data: { ackno: `AEPS${Date.now()}` },
    };
  }
  if (endpoint.includes("dmt-casa")) {
    return { status: true, response_code: 1, message: "Merchant found", is_casa: "1" } as any;
  }
  if (endpoint.includes("onboard")) {
    return {
      status: true, response_code: 1, message: "Onboarding URL generated",
      data: { redirecturl: "https://api.paysprint.in/onboard/kyc-form" },
    };
  }
  if (endpoint.includes("Twofactorkyc") || endpoint.includes("v6/authentication")) {
    return { status: true, response_code: 1, message: "2FA operation successful" };
  }
  if (endpoint.includes("send_otp")) {
    return { status: true, response_code: 1, message: "OTP sent successfully", otpreqid: `OTPREQ${Date.now()}` } as any;
  }
  if (endpoint.includes("verify_otp")) {
    return { status: true, response_code: 1, message: "OTP verified successfully" };
  }
  if (endpoint.includes("/V3/kyc")) {
    return { status: true, response_code: 1, message: "eKYC completed successfully" };
  }
  return { status: true, response_code: 1, message: "Success" };
}

export async function getAepsBankList(): Promise<AepsResponse> {
  return makeAepsRequest("/service/aeps/banklist/index", {});
}

/**
 * Check merchant CASA/AEPS activation status via PaySprint's CASA endpoint.
 * This is the CORRECT endpoint for detecting whether a merchant has completed
 * onboarding. The old STAGES endpoints both returned HTTP 404.
 *
 * PaySprint /service/dmt-casa/merchant/index returns:
 *   is_casa: "1" → fully activated ✅
 *   is_casa: "2" → pending bank activation
 *   is_casa: "0" → KYC not completed
 */
export async function checkMerchantCasaStatus(merchantCode: string): Promise<{ isCasaActive: boolean; is_casa: string; raw: any }> {
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  if (!jwtTokenEnv) {
    console.log("[AEPS SIMULATION] checkMerchantCasaStatus: returning is_casa=1 (simulation)");
    return { isCasaActive: true, is_casa: "1", raw: { status: true, response_code: 1, message: "Simulation", is_casa: "1" } };
  }

  const result = await makeAepsRequest("/service/dmt-casa/merchant/index", {
    merchantcode: merchantCode,
  }) as AepsResponse & { is_casa?: string; data?: any };

  // is_casa may appear at top-level or inside data
  const isCasaRaw: string =
    result.is_casa ||
    result.data?.is_casa ||
    "";

  const isCasaActive = isCasaRaw === "1";

  console.log(`[CASA-Check] merchant=${merchantCode} response_code=${result.response_code} is_casa="${isCasaRaw}" casaActive=${isCasaActive} msg="${result.message}" full_response=${JSON.stringify(result).substring(0, 800)}`);

  return { isCasaActive, is_casa: isCasaRaw, raw: result };
}

const ONBOARD_PIPES = ["bank2", "bank3", "bank5", "bank6"];

export interface OnboardBankStatus {
  pipe: string;
  isApproved: boolean;
  isRejected: boolean;
  isPending: boolean;
  reason: string;
}

export interface OnboardStatusResult {
  overallStatus: "APPROVED" | "REJECTED" | "PENDING" | "UNKNOWN";
  approvedBank: string | null;
  rejectedReasons: string[];
  banks: OnboardBankStatus[];
}

/**
 * Check merchant AEPS onboarding status across all banks via PaySprint's
 * getonboardstatus endpoint. Returns per-bank approval/rejection reasons.
 * Strips hyphens from merchant code (PaySprint requires alphanumeric only).
 */
export async function getOnboardStatus(merchantCode: string, mobile: string): Promise<OnboardStatusResult> {
  const psCode = merchantCode.replace(/-/g, "");

  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  if (!jwtTokenEnv) {
    return { overallStatus: "UNKNOWN", approvedBank: null, rejectedReasons: [], banks: [] };
  }

  const bankResults: OnboardBankStatus[] = [];

  for (const pipe of ONBOARD_PIPES) {
    try {
      const result = await makeAepsRequest("/service/onboard/onboard/getonboardstatus", {
        merchantcode: psCode,
        mobile,
        pipe,
      }) as AepsResponse & { is_approved?: string };

      const isApproved = result.is_approved === "Approved" || result.is_approved === "approved";
      const isRejected = result.is_approved === "Rejected" || result.is_approved === "rejected";
      const reason = result.message || "";

      console.log(`[OnboardStatus] merchant=${psCode} pipe=${pipe} approved=${isApproved} rejected=${isRejected} msg="${reason}"`);

      bankResults.push({ pipe, isApproved, isRejected, isPending: !isApproved && !isRejected, reason });
    } catch (err) {
      console.warn(`[OnboardStatus] merchant=${psCode} pipe=${pipe} error:`, err);
      bankResults.push({ pipe, isApproved: false, isRejected: false, isPending: true, reason: "Check failed" });
    }
  }

  const approvedBank = bankResults.find(b => b.isApproved)?.pipe || null;
  const rejectedBanks = bankResults.filter(b => b.isRejected);
  const rejectedReasons = rejectedBanks.map(b => b.reason).filter(Boolean);

  let overallStatus: OnboardStatusResult["overallStatus"] = "PENDING";
  if (approvedBank) {
    overallStatus = "APPROVED";
  } else if (rejectedBanks.length === ONBOARD_PIPES.length) {
    overallStatus = "REJECTED";
  }

  return { overallStatus, approvedBank, rejectedReasons, banks: bankResults };
}

export async function getOnboardingUrl(params: {
  merchantCode: string;
  mobile: string;
  email?: string;
  firmName?: string;
  callbackUrl?: string;
  isNew?: boolean;
}): Promise<AepsResponse> {
  const result = await makeAepsRequest("/service/onboard/onboard/getonboardurl", {
    merchantcode: params.merchantCode,
    mobile: params.mobile,
    is_new: params.isNew === false ? "0" : "1",
    email: params.email || `${params.mobile}@rupyasetu.in`,
    firm: params.firmName || "RupyaSetu",
    callback: params.callbackUrl || "https://rupyasetuapi.site/api/paysprint/aeps-callback",
  });

  // PaySprint returns redirecturl as a top-level field (not inside data)
  if (result.redirecturl) {
    console.log(`[AEPS] Onboarding URL: ${result.redirecturl.substring(0, 80)}...`);
  } else {
    console.log(`[AEPS] Onboarding no URL found. response_code=${result.response_code} keys=${Object.keys(result).join(",")}`);
  }

  return result;
}

export async function twoFactorRegistration(params: {
  accessmodetype: string;
  adhaarnumber: string;
  mobilenumber: string;
  latitude: string;
  longitude: string;
  referenceno: string;
  submerchantid: string;
  data: string;
  ipaddress: string;
  timestamp: string;
  is_iris: string;
}): Promise<AepsResponse> {
  return makeAepsRequest("/service/aeps/kyc/Twofactorkyc/registration", params);
}

export async function twoFactorAuthentication(params: {
  accessmodetype: string;
  adhaarnumber: string;
  mobilenumber: string;
  latitude: string;
  longitude: string;
  referenceno: string;
  submerchantid: string;
  data: string;
  ipaddress: string;
  timestamp: string;
  is_iris: string;
}): Promise<AepsResponse> {
  return makeAepsRequest("/service/aeps/kyc/v6/authentication", params);
}

export async function ekycSendOtp(merchantCode: string): Promise<AepsResponse & { otpreqid?: string }> {
  cleanExpiredEkycSessions();
  const result = await makeAepsRequest("/service/aeps/kyc/V3/send_otp", { merchantcode: merchantCode }) as AepsResponse & { otpreqid?: string };
  if (result.status && result.otpreqid) {
    ekycOtpStore.set(merchantCode, {
      otpreqid: result.otpreqid,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    console.log(`[eKYC] OTP sent for merchant ${merchantCode}, otpreqid stored`);
  }
  return result;
}

export async function ekycVerifyOtp(merchantCode: string, otp: string, otpreqid: string): Promise<AepsResponse> {
  return makeAepsRequest("/service/aeps/kyc/V3/verify_otp", {
    merchantcode: merchantCode,
    otp,
    otpreqid,
  });
}

export async function ekycComplete(params: {
  merchantCode: string;
  aadhaar: string;
  pidXml: string;
  mobile: string;
}): Promise<AepsResponse> {
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  const encryptedPid = jwtTokenEnv
    ? extractAndEncryptPid(params.pidXml)
    : "SIMULATED_ENCRYPTED_PID_FOR_TESTING_ONLY";
  console.log(`[eKYC] Complete for merchant ${params.merchantCode}, pidLen=${params.pidXml.length}, encryptedLen=${encryptedPid.length}`);

  if (!jwtTokenEnv) {
    console.log("[AEPS SIMULATION] No JWT token — simulating eKYC complete");
    return { status: true, response_code: 1, message: "eKYC completed (simulated)" };
  }

  // /V3/kyc requires encrypted body format — different from other AEPS endpoints
  const innerPayload: Record<string, unknown> = {
    partnerid: PAYSPRINT_PARTNER_ID,
    merchantcode: params.merchantCode.replace(/-/g, ""),
    mobile: params.mobile,
    pipe: "bank2",
    piddata: encryptedPid,
  };

  console.log("[eKYC] Final payload before encryption:", JSON.stringify({ ...innerPayload, piddata: "[REDACTED]" }));

  const encryptedBody = encryptAesBody(innerPayload);
  const requestBody = JSON.stringify({ body: encryptedBody });

  const endpoint = "/service/aeps/kyc/V3/kyc";
  const fullUrl = `${PAYSPRINT_BASE_URL}${endpoint}`;
  const startTime = Date.now();

  const jwtResult = generatePaysprintJWT();
  const PAYSPRINT_AUTHORIZED_KEY = process.env.PAYSPRINT_AUTHORIZED_KEY || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Token": jwtResult.token,
    ...(!isProductionEnv() && PAYSPRINT_AUTHORIZED_KEY ? { "Authorisedkey": PAYSPRINT_AUTHORIZED_KEY } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AEPS_TIMEOUT);

  try {
    console.log(`[AEPS] Request to ${endpoint} (encrypted body)`);

    let rawText: string;
    let httpStatus: number;

    if (PAYSPRINT_PROXY_URL) {
      const proxyResponse = await fetch(PAYSPRINT_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fullUrl, headers, payload: { body: encryptedBody } }),
        signal: controller.signal,
      });
      const proxyResult = await proxyResponse.json() as { status?: number; body?: string };
      httpStatus = typeof proxyResult.status === "number" ? proxyResult.status : proxyResponse.status;
      rawText = typeof proxyResult.body === "string" ? proxyResult.body : JSON.stringify(proxyResult);
    } else {
      const response = await fetch(fullUrl, {
        method: "POST",
        headers,
        body: requestBody,
        signal: controller.signal,
      });
      httpStatus = response.status;
      rawText = await response.text();
    }

    clearTimeout(timeout);
    const duration = Date.now() - startTime;
    console.log(`[AEPS] Response from ${endpoint}: HTTP ${httpStatus} (${duration}ms)`);
    console.log(`[AEPS] Body: ${rawText.substring(0, 500)}`);

    let data: AepsResponse;
    try {
      data = JSON.parse(rawText) as AepsResponse;
    } catch {
      return { status: false, response_code: 500, message: "Invalid JSON response from PaySprint eKYC" };
    }

    await logAepsApiCall(endpoint, { ...innerPayload, piddata: "[REDACTED]" }, rawText, httpStatus, data.status, duration);
    return data;
  } catch (error: any) {
    clearTimeout(timeout);
    const duration = Date.now() - startTime;
    if (error.name === "AbortError") {
      return { status: false, response_code: 408, message: "eKYC request timeout" };
    }
    await logAepsApiCall(endpoint, { ...innerPayload, piddata: "[REDACTED]" }, String(error), 0, false, duration, String(error));
    return { status: false, response_code: 500, message: `eKYC request failed: ${error.message}` };
  }
}

export function getStoredEkycOtpreqid(merchantCode: string): string | undefined {
  cleanExpiredEkycSessions();
  return ekycOtpStore.get(merchantCode)?.otpreqid;
}

export function clearEkycSession(merchantCode: string): void {
  ekycOtpStore.delete(merchantCode);
}

export async function balanceEnquiry(params: {
  latitude: string;
  longitude: string;
  mobilenumber: string;
  referenceno: string;
  ipaddress: string;
  adhaarnumber: string;
  accessmodetype: string;
  nationalbankidentification: string;
  requestremarks: string;
  data: string;
  pipe: string;
  timestamp: string;
  transactiontype: string;
  submerchantid: string;
  is_iris: string;
}): Promise<AepsResponse> {
  return makeAepsRequest("/service/aeps/balanceenquiry/index", params);
}

export async function miniStatement(params: {
  latitude: string;
  longitude: string;
  mobilenumber: string;
  referenceno: string;
  ipaddress: string;
  adhaarnumber: string;
  accessmodetype: string;
  nationalbankidentification: string;
  requestremarks: string;
  data: string;
  pipe: string;
  timestamp: string;
  transactiontype: string;
  submerchantid: string;
  is_iris: string;
}): Promise<AepsResponse> {
  return makeAepsRequest("/service/aeps/ministatement/index", params);
}

export async function cashWithdrawal(params: {
  latitude: string;
  longitude: string;
  mobilenumber: string;
  referenceno: string;
  ipaddress: string;
  adhaarnumber: string;
  accessmodetype: string;
  nationalbankidentification: string;
  requestremarks: string;
  data: string;
  pipe: string;
  timestamp: string;
  transactiontype: string;
  submerchantid: string;
  is_iris: string;
  amount: number;
}): Promise<AepsResponse> {
  return makeAepsRequest("/service/aeps/v3/cashwithdraw/index", params);
}

export async function aadhaarPay(params: {
  latitude: string;
  longitude: string;
  mobilenumber: string;
  referenceno: string;
  ipaddress: string;
  adhaarnumber: string;
  accessmodetype: string;
  nationalbankidentification: string;
  requestremarks: string;
  data: string;
  pipe: string;
  timestamp: string;
  transactiontype: string;
  submerchantid: string;
  is_iris: string;
  amount: number;
}): Promise<AepsResponse> {
  return makeAepsRequest("/service/aeps/aadharpay/index", params);
}

export async function cashDeposit(params: {
  latitude: string;
  longitude: string;
  mobilenumber: string;
  referenceno: string;
  ipaddress: string;
  adhaarnumber: string;
  accessmodetype: string;
  nationalbankidentification: string;
  requestremarks: string;
  data: string;
  pipe: string;
  timestamp: string;
  transactiontype: string;
  submerchantid: string;
  is_iris: string;
  amount: number;
}): Promise<AepsResponse> {
  return makeAepsRequest("/service/aeps/cashdeposit/index", params);
}

export async function checkAepsTransactionStatus(params: {
  referenceno: string;
}): Promise<AepsResponse> {
  return makeAepsRequest("/service/aeps/cashwithdraw/status", params);
}
