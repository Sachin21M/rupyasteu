export function validateUtr(utr: string): { valid: boolean; error?: string } {
  if (!utr || typeof utr !== "string") {
    return { valid: false, error: "UTR is required" };
  }

  const trimmed = utr.trim();

  if (trimmed.length < 12 || trimmed.length > 22) {
    return { valid: false, error: "UTR must be 12-22 characters long" };
  }

  if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
    return { valid: false, error: "UTR must contain only alphanumeric characters" };
  }

  return { valid: true };
}

export function validatePhone(phone: string): { valid: boolean; error?: string } {
  if (!phone || typeof phone !== "string") {
    return { valid: false, error: "Phone number is required" };
  }

  if (!/^[6-9]\d{9}$/.test(phone.trim())) {
    return { valid: false, error: "Invalid Indian mobile number" };
  }

  return { valid: true };
}

export function validateAmount(amount: number): { valid: boolean; error?: string } {
  if (typeof amount !== "number" || isNaN(amount)) {
    return { valid: false, error: "Amount must be a number" };
  }

  if (amount <= 0) {
    return { valid: false, error: "Amount must be positive" };
  }

  if (amount > 100000) {
    return { valid: false, error: "Amount exceeds maximum limit" };
  }

  return { valid: true };
}
