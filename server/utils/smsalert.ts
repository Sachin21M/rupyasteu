const SMSALERT_API_URL = "https://www.smsalert.co.in/api/push.json";

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendSmsAlert(phone: string, otp: string): Promise<{ success: boolean; error?: string }> {
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
      sender: sender,
      mobileno: formattedPhone,
      text: message,
    });

    const response = await fetch(`${SMSALERT_API_URL}?${params.toString()}`, {
      method: "GET",
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
