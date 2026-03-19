import jwt from "jsonwebtoken";
import { encryptPayload } from "../utils/encryption";

const PAYSPRINT_BASE_URL = process.env.PAYSPRINT_BASE_URL || "https://api.paysprint.in/api/v1";
const PAYSPRINT_PARTNER_ID = process.env.PAYSPRINT_PARTNER_ID || "";
const PAYSPRINT_ENV = process.env.PAYSPRINT_ENV || "PRODUCTION";
const PAYSPRINT_PROXY_URL = process.env.PAYSPRINT_PROXY_URL || "";

function isProductionEnv(): boolean {
  return PAYSPRINT_ENV === "PRODUCTION" || PAYSPRINT_ENV === "LIVE";
}

function generateUniqueReqId(): string {
  return Math.floor(Math.random() * 1000000000).toString();
}

function generatePaysprintJWT(): { token: string; payload: Record<string, unknown> } {
  const timestamp = Math.floor(Date.now() / 1000);
  const reqid = generateUniqueReqId();
  const payload = {
    timestamp: timestamp,
    partnerId: PAYSPRINT_PARTNER_ID,
    reqid: reqid,
  };
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  const token = jwt.sign(payload, jwtTokenEnv, { algorithm: "HS256" });
  return { token, payload };
}

interface PaysprintResponse {
  status: boolean;
  response_code: number;
  message: string;
  data?: Record<string, unknown>;
}

async function makePaysprintRequest(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<PaysprintResponse> {
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  if (!jwtTokenEnv) {
    console.log("[Paysprint SIMULATION] No JWT token configured. Simulating:", endpoint, payload);
    return simulateResponse(endpoint, payload);
  }

  const fullUrl = `${PAYSPRINT_BASE_URL}${endpoint}`;

  try {
    const useEncryption = isProductionEnv();

    const timestamp = Math.floor(Date.now() / 1000);
    const reqid = generateUniqueReqId();

    const fullPayload: Record<string, unknown> = {
      partnerId: PAYSPRINT_PARTNER_ID,
      timestamp: timestamp,
      reqid: reqid,
      ...payload,
    };

    console.log("=== [PAYSPRINT DEBUG REPORT] ===");
    console.log("[STEP 1] JWT TOKEN:");
    const jwtResult = generatePaysprintJWT();
    const jwtToken = jwtResult.token;
    console.log("  JWT Payload:", JSON.stringify(jwtResult.payload));
    const decoded = jwt.decode(jwtToken);
    console.log("  JWT Decoded (verify):", JSON.stringify(decoded));
    console.log("  JWT Token (first 30 chars):", jwtToken.substring(0, 30) + "...");

    console.log("[STEP 2] REQUEST PAYLOAD (before encryption):");
    console.log("  ", JSON.stringify(fullPayload));
    console.log("  partnerId:", fullPayload.partnerId);
    console.log("  timestamp:", fullPayload.timestamp);
    console.log("  reqid:", fullPayload.reqid);

    let requestBody: string;

    if (useEncryption) {
      try {
        const encrypted = encryptPayload(fullPayload);
        requestBody = JSON.stringify({ data: encrypted });
        console.log("[STEP 3] AES ENCRYPTION:");
        console.log("  Algorithm: AES-128-CBC");
        console.log("  Output encoding: Base64");
        console.log("  Encrypted length:", encrypted.length, "chars");
        console.log("  Encrypted (first 40 chars):", encrypted.substring(0, 40) + "...");
      } catch (encErr) {
        console.warn("[STEP 3] AES encryption FAILED:", encErr);
        requestBody = JSON.stringify(fullPayload);
      }
    } else {
      requestBody = JSON.stringify(fullPayload);
      console.log("[STEP 3] AES ENCRYPTION: SKIPPED (non-production env)");
    }

    console.log("[STEP 4] REQUEST HEADERS:");
    const paysprintHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Token": jwtToken,
    };
    console.log("  Token:", jwtToken.substring(0, 20) + "...");
    console.log("  Content-Type: application/json");
    console.log("  Authorisedkey: NOT included (LIVE IP BASED)");

    console.log("[STEP 5] REQUEST BODY:");
    console.log("  ", requestBody);

    console.log("[STEP 6] API ENDPOINT:");
    console.log("  URL:", fullUrl);
    console.log("  Method: POST");

    let rawText: string;
    let httpStatus: number;

    if (PAYSPRINT_PROXY_URL) {
      console.log("[STEP 7] SERVER IP: Using proxy for whitelisted IP 88.222.246.128");
      console.log("  Proxy URL:", PAYSPRINT_PROXY_URL);
      const proxyResponse = await fetch(PAYSPRINT_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: fullUrl,
          headers: paysprintHeaders,
          payload: JSON.parse(requestBody),
        }),
      });
      if (!proxyResponse.ok) {
        console.error("[PAYSPRINT] Proxy returned HTTP", proxyResponse.status);
        return { status: false, response_code: 502, message: `Proxy error: HTTP ${proxyResponse.status}` };
      }
      const proxyResult = await proxyResponse.json() as { status?: number; body?: string };
      if (typeof proxyResult.status !== "number" || typeof proxyResult.body !== "string") {
        console.error("[PAYSPRINT] Invalid proxy response format:", JSON.stringify(proxyResult).substring(0, 200));
        return { status: false, response_code: 502, message: "Invalid response from proxy" };
      }
      httpStatus = proxyResult.status;
      rawText = proxyResult.body;
    } else {
      console.log("[STEP 7] SERVER IP: Direct request (no proxy)");
      const response = await fetch(fullUrl, {
        method: "POST",
        headers: paysprintHeaders,
        body: requestBody,
      });
      httpStatus = response.status;
      rawText = await response.text();
    }

    console.log("[STEP 8] API RESPONSE:");
    console.log("  HTTP Status:", httpStatus);
    console.log("  Raw Response Body:", rawText);
    console.log("=== [END PAYSPRINT DEBUG REPORT] ===");

    let jsonText = rawText;
    const jsonMatch = rawText.match(/\{[^<]*\}$/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    let data: PaysprintResponse;
    try {
      data = JSON.parse(jsonText) as PaysprintResponse;
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
      message: "Failed to connect to Paysprint API",
    };
  }
}

function simulateResponse(
  endpoint: string,
  payload: Record<string, unknown>
): PaysprintResponse {
  if (endpoint.includes("recharge")) {
    return {
      status: true,
      response_code: 1,
      message: "Recharge initiated successfully",
      data: {
        ackno: `UAT${Date.now()}`,
        status: "PENDING",
        utr: "",
        operator_ref: `OP${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      },
    };
  }

  if (endpoint.includes("status")) {
    return {
      status: true,
      response_code: 1,
      message: "Transaction status fetched",
      data: {
        status: "SUCCESS",
        operator_ref: payload.referenceid || "",
      },
    };
  }

  return {
    status: true,
    response_code: 1,
    message: "Success",
  };
}

const OPERATOR_MAP: Record<string, number> = {
  "jio": 14,
  "airtel": 4,
  "vi": 33,
  "vodafone": 33,
  "idea": 34,
  "bsnl": 8,
  "mtnl": 10,
};

export async function initiateRecharge(params: {
  operator: string;
  canumber: string;
  amount: number;
  recharge_type: string;
  referenceid: string;
}): Promise<PaysprintResponse> {
  const operatorCode = OPERATOR_MAP[params.operator.toLowerCase()] || parseInt(params.operator) || 14;
  return makePaysprintRequest("/service/recharge/recharge/dorecharge", {
    operator: operatorCode,
    canumber: params.canumber,
    amount: params.amount,
    referenceid: params.referenceid,
  });
}

export async function checkRechargeStatus(referenceId: string): Promise<PaysprintResponse> {
  return makePaysprintRequest("/service/recharge/recharge/status", {
    referenceid: referenceId,
  });
}

export async function checkBalance(): Promise<PaysprintResponse> {
  return makePaysprintRequest("/service/balance/balance/cashbalance", {});
}

export async function getOperatorInfo(params: {
  number: string;
  type: string;
}): Promise<PaysprintResponse> {
  return makePaysprintRequest("/service/recharge/hlr/api/hlr/browseplan", {
    number: params.number,
    type: params.type,
  });
}
