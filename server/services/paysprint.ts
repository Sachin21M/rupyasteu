import jwt from "jsonwebtoken";
import { encryptPayload } from "../utils/encryption";

const PAYSPRINT_BASE_URL = process.env.PAYSPRINT_BASE_URL || "https://api.paysprint.in/api/v1";
const PAYSPRINT_AUTH_KEY = process.env.PAYSPRINT_AUTHORIZED_KEY || "";
const PAYSPRINT_PARTNER_ID = process.env.PAYSPRINT_PARTNER_ID || "";
const PAYSPRINT_ENV = process.env.PAYSPRINT_ENV || "PRODUCTION";
const PAYSPRINT_PROXY_URL = process.env.PAYSPRINT_PROXY_URL || "";

function isProductionEnv(): boolean {
  return PAYSPRINT_ENV === "PRODUCTION" || PAYSPRINT_ENV === "LIVE";
}

function generatePaysprintJWT(): string {
  const timestamp = Date.now();
  const reqid = timestamp.toString() + Math.floor(Math.random() * 10000).toString();
  const payload = {
    iss: "PAYSPRINT",
    timestamp: timestamp,
    partnerId: PAYSPRINT_PARTNER_ID,
    product: "WALLET",
    reqid: reqid,
  };
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  return jwt.sign(payload, jwtTokenEnv, { algorithm: "HS256" });
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
  if (!PAYSPRINT_AUTH_KEY || !PAYSPRINT_PARTNER_ID) {
    console.log("[Paysprint SIMULATION] No credentials configured. Simulating:", endpoint, payload);
    return simulateResponse(endpoint, payload);
  }

  const fullUrl = `${PAYSPRINT_BASE_URL}${endpoint}`;

  try {
    const useEncryption = isProductionEnv();
    let requestBody: string;

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
    console.log("[PAYSPRINT] Timestamp:", new Date().toISOString());
    console.log("[PAYSPRINT] Request URL:", fullUrl);
    console.log("[PAYSPRINT] Request Method: POST");
    console.log("[PAYSPRINT] Request Headers: { Content-Type: application/json, Authorisedkey: [MASKED], Token: [MASKED] }");
    console.log("[PAYSPRINT] Original Payload:", JSON.stringify(payload));
    console.log("[PAYSPRINT] Request Body (sent):", requestBody);

    const jwtToken = generatePaysprintJWT();
    console.log("[PAYSPRINT] JWT Token (masked):", jwtToken.substring(0, 20) + "...[MASKED]");

    const paysprintHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorisedkey": PAYSPRINT_AUTH_KEY,
      "Token": jwtToken,
    };

    let rawText: string;
    let httpStatus: number;

    if (PAYSPRINT_PROXY_URL) {
      console.log("[PAYSPRINT] Using Lambda proxy:", PAYSPRINT_PROXY_URL);
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
        return { status: false, response_code: 502, message: `Lambda proxy error: HTTP ${proxyResponse.status}` };
      }
      const proxyResult = await proxyResponse.json() as { status?: number; body?: string };
      if (typeof proxyResult.status !== "number" || typeof proxyResult.body !== "string") {
        console.error("[PAYSPRINT] Invalid proxy response format:", JSON.stringify(proxyResult).substring(0, 200));
        return { status: false, response_code: 502, message: "Invalid response from Lambda proxy" };
      }
      httpStatus = proxyResult.status;
      rawText = proxyResult.body;
    } else {
      const response = await fetch(fullUrl, {
        method: "POST",
        headers: paysprintHeaders,
        body: requestBody,
      });
      httpStatus = response.status;
      rawText = await response.text();
    }

    console.log("[PAYSPRINT] HTTP Status:", httpStatus);
    console.log("[PAYSPRINT] Raw Response Body:", rawText);
    console.log("=== [END PAYSPRINT RAW API LOG] ===");

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

export async function getOperatorInfo(params: {
  number: string;
  type: string;
}): Promise<PaysprintResponse> {
  return makePaysprintRequest("/service/recharge/hlr/api/hlr/browseplan", {
    number: params.number,
    type: params.type,
  });
}
