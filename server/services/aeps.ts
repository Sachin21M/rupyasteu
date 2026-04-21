import jwt from "jsonwebtoken";
import crypto from "crypto";
import { storage } from "../storage";

// PaySprint AES-128-CBC encryption for PID body field.
// The body field must contain ONLY the <Data> element value from the PID XML,
// AES-128-CBC encrypted with PAYSPRINT_AES_KEY/IV, then base64 encoded.
// PHP reference: openssl_encrypt($dataValue, "AES-128-CBC", $key, OPENSSL_RAW_DATA, $iv)
function aes128cbcEncrypt(plaintext: string, keyStr: string, ivStr: string): string {
  const key = Buffer.from(keyStr.trim()).slice(0, 16);
  const iv  = Buffer.from(ivStr.trim()).slice(0, 16);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  return encrypted.toString("base64");
}

export function encryptPidForPaySprint(pidData: string): string {
  const keyStr = process.env.PAYSPRINT_AES_KEY || "";
  const ivStr  = process.env.PAYSPRINT_AES_IV  || "";
  if (!keyStr || !ivStr) {
    return Buffer.from(pidData).toString("base64");
  }
  try {
    // PaySprint expects only the <Data> element value encrypted, not the full PID XML.
    // Extract the base64 blob from <Data type="X">...</Data>
    const dataMatch = pidData.match(/<Data[^>]*>([^<]+)<\/Data>/);
    const toEncrypt = dataMatch ? dataMatch[1].trim() : pidData.trim();
    console.log(`[AEPS] Encrypting PID: extracted=${!!dataMatch} inputLen=${toEncrypt.length} keyLen=${keyStr.trim().length} ivLen=${ivStr.trim().length} keyLast4=${keyStr.trim().slice(-4)} ivLast4=${ivStr.trim().slice(-4)}`);
    const result = aes128cbcEncrypt(toEncrypt, keyStr, ivStr);
    console.log(`[AEPS] Encrypted body length: ${result.length}`);
    return result;
  } catch (err) {
    console.error("[AEPS] PID encryption error:", err);
    return Buffer.from(pidData).toString("base64");
  }
}

const SENSITIVE_KEYS = new Set([
  "adhaarnumber", "aadhaar", "aadhar", "aadharnumber",
  "piddata", "pid", "biometric", "biometricdata",
  "hmac", "skey", "ci", "sessionkey",
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
  const timestamp = Date.now(); // PaySprint expects milliseconds (e.g. 1541044257000)
  const reqid = generateUniqueReqId();
  const payload = {
    timestamp,
    partnerId: PAYSPRINT_PARTNER_ID,
    reqid: String(reqid),
  };
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  // noTimestamp: true prevents jsonwebtoken from auto-adding 'iat' claim
  const token = jwt.sign(payload, jwtTokenEnv, { algorithm: "HS256", noTimestamp: true });
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

    const jwtTokenSecret = process.env.PAYSPRINT_JWT_TOKEN || "";
    console.log(`[AEPS] JWT secret: len=${jwtTokenSecret.length} prefix=${jwtTokenSecret.substring(0,6)} looksLikeJWT=${jwtTokenSecret.startsWith("eyJ")}`);
    const jwtResult = generatePaysprintJWT();
    const jwtToken = jwtResult.token;
    console.log(`[AEPS] JWT payload: ${JSON.stringify(jwtResult.payload)}`);
    console.log(`[AEPS] Signed JWT (first 40): ${jwtToken.substring(0, 40)}...`);

    // AEPS transaction endpoints (/service/aeps/) require the entire payload AES-128-CBC
    // encrypted and sent as a single "body" field (IP-BASED mode).
    // Onboarding endpoints (/service/onboard/) expect plain JSON — they do NOT decrypt
    // the AES body wrapper and will reject the request saying fields are missing.
    const aesKey = process.env.PAYSPRINT_AES_KEY || "";
    const aesIv  = process.env.PAYSPRINT_AES_IV  || "";
    const useBodyEncryption = !!(aesKey && aesIv && endpoint.includes("/service/aeps/"));
    let requestBody: string;
    if (useBodyEncryption) {
      const encrypted = aes128cbcEncrypt(JSON.stringify(fullPayload), aesKey, aesIv);
      requestBody = JSON.stringify({ body: encrypted });
      console.log(`[AEPS] Body encrypted: keyLen=${aesKey.trim().length} ivLen=${aesIv.trim().length} keyLast4=${aesKey.trim().slice(-4)} encLen=${encrypted.length}`);
    } else {
      requestBody = JSON.stringify(fullPayload);
      console.log(`[AEPS] Body plain: endpoint=${endpoint} aesConfigured=${!!(aesKey && aesIv)}`);
    }

    // IP BASED partners do NOT use Authorisedkey — authentication is via whitelisted IP only.
    const paysprintHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Token": jwtToken,
    };
    console.log(`[AEPS] Headers: Token(len=${jwtToken.length}) [IP-BASED: no Authorisedkey sent]`);

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
  if (endpoint.includes("onboard")) {
    return {
      status: true, response_code: 1, message: "Onboarding URL generated",
      data: { redirecturl: "https://api.paysprint.in/onboard/kyc-form" },
    };
  }
  if (endpoint.includes("Twofactorkyc")) {
    return { status: true, response_code: 1, message: "2FA operation successful" };
  }
  return { status: true, response_code: 1, message: "Success" };
}

export async function getAepsBankList(): Promise<AepsResponse> {
  return makeAepsRequest("/service/aeps/banklist/index", {});
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
  return makeAepsRequest("/service/aeps/kyc/Twofactorkyc/authentication", params);
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
