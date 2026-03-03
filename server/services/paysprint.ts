import { encryptPayload } from "../utils/encryption";

const PAYSPRINT_BASE_URL = process.env.PAYSPRINT_BASE_URL || "https://api.paysprint.in/api/v1";
const PAYSPRINT_JWT = process.env.PAYSPRINT_JWT_TOKEN || "";
const PAYSPRINT_AUTH_KEY = process.env.PAYSPRINT_AUTHORIZED_KEY || "";
const PAYSPRINT_ENV = process.env.PAYSPRINT_ENV || "UAT";

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
  if (!PAYSPRINT_JWT || !PAYSPRINT_AUTH_KEY) {
    console.log("[Paysprint SIMULATION] No credentials configured. Simulating:", endpoint, payload);
    return simulateResponse(endpoint, payload);
  }

  const fullUrl = `${PAYSPRINT_BASE_URL}${endpoint}`;

  try {
    const encryptedPayload = encryptPayload(payload);
    const requestBody = JSON.stringify({ encrypted_data: encryptedPayload });

    console.log("=== [PAYSPRINT RAW API LOG] ===");
    console.log("[PAYSPRINT] Mode: LIVE API CALL");
    console.log("[PAYSPRINT] Timestamp:", new Date().toISOString());
    console.log("[PAYSPRINT] Request URL:", fullUrl);
    console.log("[PAYSPRINT] Request Method: POST");
    console.log("[PAYSPRINT] Request Headers: { Content-Type: application/json, Authorisedkey: [MASKED], Token: [MASKED] }");
    console.log("[PAYSPRINT] Plain Payload:", JSON.stringify(payload));
    console.log("[PAYSPRINT] Encrypted Request Body:", requestBody);

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorisedkey": PAYSPRINT_AUTH_KEY,
        "Token": PAYSPRINT_JWT,
      },
      body: requestBody,
    });

    const rawText = await response.text();

    console.log("[PAYSPRINT] HTTP Status:", response.status);
    console.log("[PAYSPRINT] Raw Response Body:", rawText);
    console.log("=== [END PAYSPRINT RAW API LOG] ===");

    let data: PaysprintResponse;
    try {
      data = JSON.parse(rawText) as PaysprintResponse;
    } catch {
      console.error("[PAYSPRINT] Failed to parse response as JSON. Raw text:", rawText);
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

export async function initiateRecharge(params: {
  operator: string;
  canumber: string;
  amount: number;
  recharge_type: string;
}): Promise<PaysprintResponse> {
  return makePaysprintRequest("/service/recharge/recharge/dorecharge", {
    operator: params.operator,
    canumber: params.canumber,
    amount: params.amount,
    recharge_type: params.recharge_type,
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
