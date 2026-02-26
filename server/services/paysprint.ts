import { encryptPayload } from "../utils/encryption";

const PAYSPRINT_BASE_URL = process.env.PAYSPRINT_BASE_URL || "https://paysprint.in/service-api/api/v1";
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
  if (PAYSPRINT_ENV === "UAT" && (!PAYSPRINT_JWT || !PAYSPRINT_AUTH_KEY)) {
    console.log("[Paysprint UAT] Simulating API call:", endpoint, payload);
    return simulateResponse(endpoint, payload);
  }

  try {
    const encryptedPayload = encryptPayload(payload);

    const response = await fetch(`${PAYSPRINT_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorisedkey": PAYSPRINT_AUTH_KEY,
        "Token": PAYSPRINT_JWT,
      },
      body: JSON.stringify({ encrypted_data: encryptedPayload }),
    });

    const data = await response.json();
    return data as PaysprintResponse;
  } catch (error) {
    console.error("[Paysprint] API Error:", error);
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
