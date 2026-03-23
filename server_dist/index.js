var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/utils/encryption.ts
var encryption_exports = {};
__export(encryption_exports, {
  decryptPayload: () => decryptPayload,
  encryptPayload: () => encryptPayload,
  generateJwtToken: () => generateJwtToken,
  verifyJwtToken: () => verifyJwtToken
});
import crypto from "crypto";
function encryptPayload(data) {
  const text = JSON.stringify(data);
  const key = Buffer.from(AES_KEY.slice(0, 16), "utf-8");
  const iv = Buffer.from(AES_IV.slice(0, 16), "utf-8");
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}
function decryptPayload(encrypted) {
  const key = Buffer.from(AES_KEY.slice(0, 16), "utf-8");
  const iv = Buffer.from(AES_IV.slice(0, 16), "utf-8");
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}
function generateJwtToken(payload) {
  const secret = process.env.SESSION_SECRET || "rupyasetu_secret_key";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1e3), exp: Math.floor(Date.now() / 1e3) + 86400 * 7 })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}
function verifyJwtToken(token) {
  try {
    const secret = process.env.SESSION_SECRET || "rupyasetu_secret_key";
    const [header, body, signature] = token.split(".");
    const expectedSig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1e3)) return null;
    return payload;
  } catch {
    return null;
  }
}
var AES_KEY, AES_IV;
var init_encryption = __esm({
  "server/utils/encryption.ts"() {
    "use strict";
    AES_KEY = process.env.PAYSPRINT_AES_KEY || "default_aes_key_for_uat_testing";
    AES_IV = process.env.PAYSPRINT_AES_IV || "default_iv_for_uat";
  }
});

// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";

// server/storage.ts
import { randomUUID } from "crypto";
import pg from "pg";
var pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : void 0
});
pool.query("SELECT 1").then(() => console.log("Connected to PostgreSQL successfully")).catch((err) => console.error("PostgreSQL connection error:", err.message));
async function initAepsTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS aeps_merchants (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        merchant_code VARCHAR(64) NOT NULL DEFAULT '',
        phone VARCHAR(15) NOT NULL DEFAULT '',
        firm_name VARCHAR(100) NOT NULL DEFAULT '',
        kyc_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        bank_pipes TEXT NOT NULL DEFAULT '{}',
        kyc_redirect_url TEXT,
        created_by VARCHAR(20) DEFAULT 'self',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS aeps_daily_auth (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        auth_date VARCHAR(10) NOT NULL,
        authenticated BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, auth_date)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS aeps_transactions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        type VARCHAR(30) NOT NULL,
        aadhaar_masked VARCHAR(16) NOT NULL,
        customer_mobile VARCHAR(15) NOT NULL,
        bank_name VARCHAR(100) NOT NULL,
        bank_iin VARCHAR(20) NOT NULL,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'AEPS_PENDING',
        reference_no VARCHAR(64) NOT NULL,
        paysprint_ref_id VARCHAR(100),
        balance VARCHAR(50),
        mini_statement TEXT,
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS aeps_api_logs (
        id VARCHAR(64) PRIMARY KEY,
        endpoint VARCHAR(255) NOT NULL,
        method VARCHAR(10) NOT NULL DEFAULT 'POST',
        request_payload TEXT NOT NULL DEFAULT '{}',
        response_body TEXT NOT NULL DEFAULT '{}',
        http_status INTEGER NOT NULL DEFAULT 0,
        success BOOLEAN NOT NULL DEFAULT FALSE,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_aeps_api_logs_created ON aeps_api_logs(created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_aeps_api_logs_endpoint ON aeps_api_logs(endpoint)
    `);
    const alterQueries = [
      "ALTER TABLE aeps_merchants ADD COLUMN IF NOT EXISTS phone VARCHAR(15) NOT NULL DEFAULT ''",
      "ALTER TABLE aeps_merchants ADD COLUMN IF NOT EXISTS firm_name VARCHAR(100) NOT NULL DEFAULT ''",
      "ALTER TABLE aeps_merchants ADD COLUMN IF NOT EXISTS kyc_redirect_url TEXT",
      "ALTER TABLE aeps_merchants ADD COLUMN IF NOT EXISTS created_by VARCHAR(20) DEFAULT 'self'"
    ];
    for (const q of alterQueries) {
      try {
        await pool.query(q);
      } catch {
      }
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendor_wallets (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL UNIQUE,
        balance DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        type VARCHAR(20) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        balance_before DECIMAL(12,2) NOT NULL DEFAULT 0,
        balance_after DECIMAL(12,2) NOT NULL DEFAULT 0,
        reference VARCHAR(100) NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        utr VARCHAR(30),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_commission_config (
        service_type VARCHAR(30) PRIMARY KEY,
        commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        commission_type VARCHAR(15) NOT NULL DEFAULT 'FIXED'
      )
    `);
    await pool.query(`
      INSERT INTO wallet_commission_config (service_type, commission_amount, commission_type)
      VALUES
        ('BALANCE_ENQUIRY', 5, 'FIXED'),
        ('CASH_WITHDRAWAL', 10, 'FIXED'),
        ('MINI_STATEMENT', 5, 'FIXED'),
        ('AADHAAR_PAY', 10, 'FIXED'),
        ('CASH_DEPOSIT', 10, 'FIXED')
      ON CONFLICT (service_type) DO NOTHING
    `);
    console.log("AEPS tables initialized successfully");
    console.log("Wallet tables initialized successfully");
  } catch (err) {
    console.error("Failed to create tables:", err.message);
  }
}
initAepsTables();
var OPERATORS = [
  { id: "jio", name: "Jio", type: "MOBILE", icon: "jio" },
  { id: "airtel", name: "Airtel", type: "MOBILE", icon: "airtel" },
  { id: "vi", name: "Vi (Vodafone Idea)", type: "MOBILE", icon: "vi" },
  { id: "bsnl", name: "BSNL", type: "MOBILE", icon: "bsnl" },
  { id: "tatasky", name: "Tata Play", type: "DTH", icon: "tataplay" },
  { id: "dishtv", name: "Dish TV", type: "DTH", icon: "dishtv" },
  { id: "d2h", name: "D2H", type: "DTH", icon: "d2h" },
  { id: "sundirect", name: "Sun Direct", type: "DTH", icon: "sundirect" },
  { id: "airteldth", name: "Airtel DTH", type: "DTH", icon: "airteldth" }
];
var PLANS = [
  { id: "jio-1", operatorId: "jio", amount: 239, validity: "28 days", description: "2GB/day + Unlimited Calls", data: "2GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "jio-2", operatorId: "jio", amount: 299, validity: "28 days", description: "2.5GB/day + Unlimited Calls", data: "2.5GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "jio-3", operatorId: "jio", amount: 479, validity: "56 days", description: "1.5GB/day + Unlimited Calls", data: "1.5GB/day", talktime: "Unlimited", category: "Data" },
  { id: "jio-4", operatorId: "jio", amount: 666, validity: "84 days", description: "1.5GB/day + Unlimited Calls", data: "1.5GB/day", talktime: "Unlimited", category: "Data" },
  { id: "jio-5", operatorId: "jio", amount: 999, validity: "84 days", description: "2.5GB/day + Unlimited Calls", data: "2.5GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "jio-6", operatorId: "jio", amount: 2999, validity: "365 days", description: "2.5GB/day + Unlimited Calls", data: "2.5GB/day", talktime: "Unlimited", category: "Annual" },
  { id: "airtel-1", operatorId: "airtel", amount: 265, validity: "28 days", description: "1GB/day + Unlimited Calls", data: "1GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "airtel-2", operatorId: "airtel", amount: 299, validity: "28 days", description: "1.5GB/day + Unlimited Calls", data: "1.5GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "airtel-3", operatorId: "airtel", amount: 479, validity: "56 days", description: "1.5GB/day + Unlimited Calls", data: "1.5GB/day", talktime: "Unlimited", category: "Data" },
  { id: "airtel-4", operatorId: "airtel", amount: 719, validity: "84 days", description: "1.5GB/day + Unlimited Calls", data: "1.5GB/day", talktime: "Unlimited", category: "Data" },
  { id: "airtel-5", operatorId: "airtel", amount: 2999, validity: "365 days", description: "2.5GB/day + Unlimited Calls", data: "2.5GB/day", talktime: "Unlimited", category: "Annual" },
  { id: "vi-1", operatorId: "vi", amount: 249, validity: "28 days", description: "1GB/day + Unlimited Calls", data: "1GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "vi-2", operatorId: "vi", amount: 299, validity: "28 days", description: "1.5GB/day + Unlimited Calls", data: "1.5GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "vi-3", operatorId: "vi", amount: 449, validity: "56 days", description: "1GB/day + Unlimited Calls", data: "1GB/day", talktime: "Unlimited", category: "Data" },
  { id: "bsnl-1", operatorId: "bsnl", amount: 197, validity: "30 days", description: "2GB/day + Unlimited Calls", data: "2GB/day", talktime: "Unlimited", category: "Popular" },
  { id: "bsnl-2", operatorId: "bsnl", amount: 397, validity: "60 days", description: "2GB/day + Unlimited Calls", data: "2GB/day", talktime: "Unlimited", category: "Data" },
  { id: "tatasky-1", operatorId: "tatasky", amount: 220, validity: "1 Month", description: "Hindi Basic HD", category: "Basic" },
  { id: "tatasky-2", operatorId: "tatasky", amount: 350, validity: "1 Month", description: "Hindi Smart HD", category: "Popular" },
  { id: "tatasky-3", operatorId: "tatasky", amount: 550, validity: "1 Month", description: "Hindi Premium HD", category: "Premium" },
  { id: "dishtv-1", operatorId: "dishtv", amount: 199, validity: "1 Month", description: "South Jumbo Family", category: "Basic" },
  { id: "dishtv-2", operatorId: "dishtv", amount: 325, validity: "1 Month", description: "DishNXT HD", category: "Popular" },
  { id: "d2h-1", operatorId: "d2h", amount: 250, validity: "1 Month", description: "Gold HD", category: "Popular" },
  { id: "d2h-2", operatorId: "d2h", amount: 400, validity: "1 Month", description: "Diamond HD", category: "Premium" },
  { id: "sundirect-1", operatorId: "sundirect", amount: 180, validity: "1 Month", description: "Value Pack", category: "Basic" },
  { id: "sundirect-2", operatorId: "sundirect", amount: 320, validity: "1 Month", description: "Premium Pack", category: "Premium" },
  { id: "airteldth-1", operatorId: "airteldth", amount: 258, validity: "1 Month", description: "Value Lite HD", category: "Basic" },
  { id: "airteldth-2", operatorId: "airteldth", amount: 410, validity: "1 Month", description: "Premium HD", category: "Popular" }
];
function rowToUser(row) {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name || void 0,
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}
function rowToTransaction(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    subscriberNumber: row.subscriber_number,
    amount: parseFloat(row.amount),
    planId: row.plan_id || void 0,
    planDescription: row.plan_description || void 0,
    paymentStatus: row.payment_status,
    rechargeStatus: row.recharge_status,
    utr: row.utr || void 0,
    paysprintRefId: row.paysprint_ref_id || void 0,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at
  };
}
function rowToAepsMerchant(row) {
  return {
    id: row.id,
    userId: row.user_id,
    merchantCode: row.merchant_code,
    phone: row.phone || "",
    firmName: row.firm_name || "",
    kycStatus: row.kyc_status,
    bankPipes: row.bank_pipes,
    kycRedirectUrl: row.kyc_redirect_url || void 0,
    createdBy: row.created_by || "self",
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at
  };
}
function rowToAepsDailyAuth(row) {
  return {
    id: row.id,
    userId: row.user_id,
    authDate: row.auth_date,
    authenticated: row.authenticated,
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}
function rowToAepsTransaction(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    aadhaarMasked: row.aadhaar_masked,
    customerMobile: row.customer_mobile,
    bankName: row.bank_name,
    bankIin: row.bank_iin,
    amount: parseFloat(row.amount),
    status: row.status,
    referenceNo: row.reference_no,
    paysprintRefId: row.paysprint_ref_id || void 0,
    balance: row.balance || void 0,
    miniStatement: row.mini_statement || void 0,
    message: row.message || void 0,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at
  };
}
var PgStorage = class {
  async getUser(id) {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return result.rows[0] ? rowToUser(result.rows[0]) : void 0;
  }
  async getUserByPhone(phone) {
    const result = await pool.query("SELECT * FROM users WHERE phone = $1", [phone]);
    return result.rows[0] ? rowToUser(result.rows[0]) : void 0;
  }
  async createUser(phone) {
    const id = randomUUID();
    const result = await pool.query(
      "INSERT INTO users (id, phone) VALUES ($1, $2) RETURNING *",
      [id, phone]
    );
    return rowToUser(result.rows[0]);
  }
  async createUserWithId(id, phone) {
    const result = await pool.query(
      "INSERT INTO users (id, phone) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING *",
      [id, phone]
    );
    if (result.rows[0]) return rowToUser(result.rows[0]);
    const existing = await this.getUser(id);
    return existing;
  }
  async updateUser(id, data) {
    const fields = [];
    const values = [];
    let idx = 1;
    if (data.name !== void 0) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.phone !== void 0) {
      fields.push(`phone = $${idx++}`);
      values.push(data.phone);
    }
    if (fields.length === 0) return this.getUser(id);
    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToUser(result.rows[0]) : void 0;
  }
  async saveOtp(record) {
    await pool.query(
      `INSERT INTO otp_records (phone, otp, expires_at, attempts)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone) DO UPDATE SET otp = $2, expires_at = $3, attempts = $4`,
      [record.phone, record.otp, record.expiresAt, record.attempts]
    );
  }
  async getOtp(phone) {
    const result = await pool.query("SELECT * FROM otp_records WHERE phone = $1", [phone]);
    if (!result.rows[0]) return void 0;
    const row = result.rows[0];
    return {
      phone: row.phone,
      otp: row.otp,
      expiresAt: parseInt(row.expires_at),
      attempts: row.attempts
    };
  }
  async deleteOtp(phone) {
    await pool.query("DELETE FROM otp_records WHERE phone = $1", [phone]);
  }
  async getOperators(type) {
    if (type) return OPERATORS.filter((o) => o.type === type);
    return OPERATORS;
  }
  async getOperator(id) {
    return OPERATORS.find((o) => o.id === id);
  }
  async getPlans(operatorId, category) {
    let plans = PLANS.filter((p) => p.operatorId === operatorId);
    if (category) plans = plans.filter((p) => p.category === category);
    return plans;
  }
  async createTransaction(data) {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO transactions (id, user_id, type, operator_id, operator_name, subscriber_number, amount, plan_id, plan_description, payment_status, recharge_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [id, data.userId, data.type, data.operatorId, data.operatorName, data.subscriberNumber, data.amount, data.planId || null, data.planDescription || null, data.paymentStatus, data.rechargeStatus]
    );
    return rowToTransaction(result.rows[0]);
  }
  async getTransaction(id) {
    const result = await pool.query("SELECT * FROM transactions WHERE id = $1", [id]);
    return result.rows[0] ? rowToTransaction(result.rows[0]) : void 0;
  }
  async updateTransaction(id, data) {
    const fields = [];
    const values = [];
    let idx = 1;
    if (data.paymentStatus !== void 0) {
      fields.push(`payment_status = $${idx++}`);
      values.push(data.paymentStatus);
    }
    if (data.rechargeStatus !== void 0) {
      fields.push(`recharge_status = $${idx++}`);
      values.push(data.rechargeStatus);
    }
    if (data.utr !== void 0) {
      fields.push(`utr = $${idx++}`);
      values.push(data.utr);
    }
    if (data.paysprintRefId !== void 0) {
      fields.push(`paysprint_ref_id = $${idx++}`);
      values.push(data.paysprintRefId);
    }
    if (fields.length === 0) return this.getTransaction(id);
    values.push(id);
    const result = await pool.query(
      `UPDATE transactions SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToTransaction(result.rows[0]) : void 0;
  }
  async getUserTransactions(userId) {
    const result = await pool.query(
      "SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map(rowToTransaction);
  }
  async getAllTransactions() {
    const result = await pool.query("SELECT * FROM transactions ORDER BY created_at DESC");
    return result.rows.map(rowToTransaction);
  }
  async findTransactionByUtr(utr) {
    const result = await pool.query("SELECT * FROM transactions WHERE utr = $1", [utr]);
    return result.rows[0] ? rowToTransaction(result.rows[0]) : void 0;
  }
  async getAepsMerchant(userId) {
    const result = await pool.query("SELECT * FROM aeps_merchants WHERE user_id = $1", [userId]);
    return result.rows[0] ? rowToAepsMerchant(result.rows[0]) : void 0;
  }
  async getAepsMerchantByPhone(phone) {
    const result = await pool.query("SELECT * FROM aeps_merchants WHERE phone = $1", [phone]);
    return result.rows[0] ? rowToAepsMerchant(result.rows[0]) : void 0;
  }
  async getAepsMerchantById(id) {
    const result = await pool.query("SELECT * FROM aeps_merchants WHERE id = $1", [id]);
    return result.rows[0] ? rowToAepsMerchant(result.rows[0]) : void 0;
  }
  async getAllAepsMerchants() {
    const result = await pool.query("SELECT * FROM aeps_merchants ORDER BY created_at DESC");
    return result.rows.map(rowToAepsMerchant);
  }
  async createAepsMerchant(userId, merchantCode, bankPipes, extra) {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO aeps_merchants (id, user_id, merchant_code, phone, firm_name, kyc_status, bank_pipes, kyc_redirect_url, created_by)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8) RETURNING *`,
      [id, userId, merchantCode, extra?.phone || "", extra?.firmName || "", bankPipes, extra?.kycRedirectUrl || null, extra?.createdBy || "self"]
    );
    return rowToAepsMerchant(result.rows[0]);
  }
  async updateAepsMerchant(userId, data) {
    const fields = [];
    const values = [];
    let idx = 1;
    if (data.merchantCode !== void 0) {
      fields.push(`merchant_code = $${idx++}`);
      values.push(data.merchantCode);
    }
    if (data.kycStatus !== void 0) {
      fields.push(`kyc_status = $${idx++}`);
      values.push(data.kycStatus);
    }
    if (data.bankPipes !== void 0) {
      fields.push(`bank_pipes = $${idx++}`);
      values.push(data.bankPipes);
    }
    if (data.phone !== void 0) {
      fields.push(`phone = $${idx++}`);
      values.push(data.phone);
    }
    if (data.firmName !== void 0) {
      fields.push(`firm_name = $${idx++}`);
      values.push(data.firmName);
    }
    if (data.kycRedirectUrl !== void 0) {
      fields.push(`kyc_redirect_url = $${idx++}`);
      values.push(data.kycRedirectUrl);
    }
    if (fields.length === 0) return this.getAepsMerchant(userId);
    fields.push(`updated_at = NOW()`);
    values.push(userId);
    const result = await pool.query(
      `UPDATE aeps_merchants SET ${fields.join(", ")} WHERE user_id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToAepsMerchant(result.rows[0]) : void 0;
  }
  async deleteAepsMerchant(id) {
    const result = await pool.query("DELETE FROM aeps_merchants WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }
  async getAepsDailyAuth(userId, date) {
    const result = await pool.query(
      "SELECT * FROM aeps_daily_auth WHERE user_id = $1 AND auth_date = $2",
      [userId, date]
    );
    return result.rows[0] ? rowToAepsDailyAuth(result.rows[0]) : void 0;
  }
  async setAepsDailyAuth(userId, date) {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO aeps_daily_auth (id, user_id, auth_date, authenticated)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (user_id, auth_date) DO UPDATE SET authenticated = TRUE
       RETURNING *`,
      [id, userId, date]
    );
    return rowToAepsDailyAuth(result.rows[0]);
  }
  async createAepsTransaction(data) {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO aeps_transactions (id, user_id, type, aadhaar_masked, customer_mobile, bank_name, bank_iin, amount, status, reference_no, paysprint_ref_id, balance, mini_statement, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [id, data.userId, data.type, data.aadhaarMasked, data.customerMobile, data.bankName, data.bankIin, data.amount, data.status, data.referenceNo, data.paysprintRefId || null, data.balance || null, data.miniStatement || null, data.message || null]
    );
    return rowToAepsTransaction(result.rows[0]);
  }
  async getAepsTransaction(id) {
    const result = await pool.query("SELECT * FROM aeps_transactions WHERE id = $1", [id]);
    return result.rows[0] ? rowToAepsTransaction(result.rows[0]) : void 0;
  }
  async updateAepsTransaction(id, data) {
    const fields = [];
    const values = [];
    let idx = 1;
    if (data.status !== void 0) {
      fields.push(`status = $${idx++}`);
      values.push(data.status);
    }
    if (data.paysprintRefId !== void 0) {
      fields.push(`paysprint_ref_id = $${idx++}`);
      values.push(data.paysprintRefId);
    }
    if (data.balance !== void 0) {
      fields.push(`balance = $${idx++}`);
      values.push(data.balance);
    }
    if (data.miniStatement !== void 0) {
      fields.push(`mini_statement = $${idx++}`);
      values.push(data.miniStatement);
    }
    if (data.message !== void 0) {
      fields.push(`message = $${idx++}`);
      values.push(data.message);
    }
    if (fields.length === 0) return this.getAepsTransaction(id);
    fields.push(`updated_at = NOW()`);
    values.push(id);
    const result = await pool.query(
      `UPDATE aeps_transactions SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToAepsTransaction(result.rows[0]) : void 0;
  }
  async getUserAepsTransactions(userId) {
    const result = await pool.query(
      "SELECT * FROM aeps_transactions WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map(rowToAepsTransaction);
  }
  async getAllAepsTransactions() {
    const result = await pool.query("SELECT * FROM aeps_transactions ORDER BY created_at DESC");
    return result.rows.map(rowToAepsTransaction);
  }
  async createAepsApiLog(data) {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO aeps_api_logs (id, endpoint, method, request_payload, response_body, http_status, success, duration_ms, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, data.endpoint, data.method, data.requestPayload, data.responseBody, data.httpStatus, data.success, data.durationMs, data.errorMessage || null]
    );
    return rowToAepsApiLog(result.rows[0]);
  }
  async getAepsApiLogs(filters) {
    const conditions = [];
    const values = [];
    let idx = 1;
    if (filters?.endpoint) {
      conditions.push(`endpoint LIKE $${idx++}`);
      values.push(`%${filters.endpoint}%`);
    }
    if (filters?.success !== void 0) {
      conditions.push(`success = $${idx++}`);
      values.push(filters.success);
    }
    if (filters?.fromDate) {
      conditions.push(`created_at >= $${idx++}`);
      values.push(filters.fromDate);
    }
    if (filters?.toDate) {
      conditions.push(`created_at <= $${idx++}`);
      values.push(filters.toDate + " 23:59:59");
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await pool.query(`SELECT COUNT(*) FROM aeps_api_logs ${where}`, values);
    const total = parseInt(countResult.rows[0].count);
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    const dataValues = [...values, limit, offset];
    const result = await pool.query(
      `SELECT * FROM aeps_api_logs ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataValues
    );
    return { logs: result.rows.map(rowToAepsApiLog), total };
  }
  async getWallet(userId) {
    const result = await pool.query("SELECT * FROM vendor_wallets WHERE user_id = $1", [userId]);
    return result.rows[0] ? rowToWallet(result.rows[0]) : void 0;
  }
  async getOrCreateWallet(userId) {
    const existing = await this.getWallet(userId);
    if (existing) return existing;
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO vendor_wallets (id, user_id, balance) VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO NOTHING RETURNING *`,
      [id, userId]
    );
    if (result.rows[0]) return rowToWallet(result.rows[0]);
    return await this.getWallet(userId);
  }
  async getAllWallets() {
    const result = await pool.query(
      `SELECT w.*, u.phone, u.name FROM vendor_wallets w
       LEFT JOIN users u ON w.user_id = u.id
       ORDER BY w.updated_at DESC`
    );
    return result.rows.map((row) => ({
      ...rowToWallet(row),
      phone: row.phone || void 0,
      name: row.name || void 0
    }));
  }
  async updateWalletBalance(userId, amount) {
    const result = await pool.query(
      `UPDATE vendor_wallets SET balance = balance + $1, updated_at = NOW()
       WHERE user_id = $2 RETURNING *`,
      [amount, userId]
    );
    return rowToWallet(result.rows[0]);
  }
  async createWalletTransaction(data) {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_before, balance_after, reference, description, status, utr)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, data.userId, data.type, data.amount, data.balanceBefore, data.balanceAfter, data.reference, data.description, data.status, data.utr || null]
    );
    return rowToWalletTransaction(result.rows[0]);
  }
  async getWalletTransaction(id) {
    const result = await pool.query("SELECT * FROM wallet_transactions WHERE id = $1", [id]);
    return result.rows[0] ? rowToWalletTransaction(result.rows[0]) : void 0;
  }
  async updateWalletTransaction(id, data) {
    const fields = [];
    const values = [];
    let idx = 1;
    if (data.status !== void 0) {
      fields.push(`status = $${idx++}`);
      values.push(data.status);
    }
    if (data.balanceAfter !== void 0) {
      fields.push(`balance_after = $${idx++}`);
      values.push(data.balanceAfter);
    }
    if (data.utr !== void 0) {
      fields.push(`utr = $${idx++}`);
      values.push(data.utr);
    }
    if (fields.length === 0) return this.getWalletTransaction(id);
    values.push(id);
    const result = await pool.query(
      `UPDATE wallet_transactions SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToWalletTransaction(result.rows[0]) : void 0;
  }
  async getUserWalletTransactions(userId) {
    const result = await pool.query(
      "SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map(rowToWalletTransaction);
  }
  async getPendingWalletRecharges() {
    const result = await pool.query(
      `SELECT wt.*, u.phone FROM wallet_transactions wt
       LEFT JOIN users u ON wt.user_id = u.id
       WHERE wt.type = 'RECHARGE' AND wt.status = 'PENDING'
       ORDER BY wt.created_at DESC`
    );
    return result.rows.map((row) => ({
      ...rowToWalletTransaction(row),
      phone: row.phone || void 0
    }));
  }
  async getCommissionConfig() {
    const result = await pool.query("SELECT * FROM wallet_commission_config ORDER BY service_type");
    return result.rows.map(rowToCommissionConfig);
  }
  async updateCommissionConfig(serviceType, amount, type) {
    const result = await pool.query(
      `INSERT INTO wallet_commission_config (service_type, commission_amount, commission_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (service_type) DO UPDATE SET commission_amount = $2, commission_type = $3
       RETURNING *`,
      [serviceType, amount, type]
    );
    return rowToCommissionConfig(result.rows[0]);
  }
};
function rowToWallet(row) {
  return {
    id: row.id,
    userId: row.user_id,
    balance: parseFloat(row.balance),
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at
  };
}
function rowToWalletTransaction(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: parseFloat(row.amount),
    balanceBefore: parseFloat(row.balance_before),
    balanceAfter: parseFloat(row.balance_after),
    reference: row.reference,
    description: row.description,
    status: row.status,
    utr: row.utr || void 0,
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}
function rowToCommissionConfig(row) {
  return {
    serviceType: row.service_type,
    commissionAmount: parseFloat(row.commission_amount),
    commissionType: row.commission_type
  };
}
function rowToAepsApiLog(row) {
  return {
    id: row.id,
    endpoint: row.endpoint,
    method: row.method,
    requestPayload: row.request_payload,
    responseBody: row.response_body,
    httpStatus: row.http_status,
    success: row.success,
    durationMs: row.duration_ms,
    errorMessage: row.error_message || void 0,
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}
var storage = new PgStorage();

// server/routes.ts
init_encryption();

// server/utils/validators.ts
function validateUtr(utr) {
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
function validateAmount(amount) {
  if (typeof amount !== "number" || isNaN(amount)) {
    return { valid: false, error: "Amount must be a number" };
  }
  if (amount <= 0) {
    return { valid: false, error: "Amount must be positive" };
  }
  if (amount > 1e5) {
    return { valid: false, error: "Amount exceeds maximum limit" };
  }
  return { valid: true };
}

// server/utils/smsalert.ts
var SMSALERT_API_URL = "https://www.smsalert.co.in/api/push.json";
function generateOtp() {
  return Math.floor(1e5 + Math.random() * 9e5).toString();
}
async function sendSmsAlert(phone, otp) {
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
      sender,
      mobileno: formattedPhone,
      text: message
    });
    const response = await fetch(`${SMSALERT_API_URL}?${params.toString()}`, {
      method: "GET"
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

// server/services/paysprint.ts
init_encryption();
import jwt from "jsonwebtoken";
var PAYSPRINT_BASE_URL = process.env.PAYSPRINT_BASE_URL || "https://api.paysprint.in/api/v1";
var PAYSPRINT_PARTNER_ID = process.env.PAYSPRINT_PARTNER_ID || "";
var PAYSPRINT_ENV = process.env.PAYSPRINT_ENV || "PRODUCTION";
var PAYSPRINT_PROXY_URL = process.env.PAYSPRINT_PROXY_URL || "";
function isProductionEnv() {
  return PAYSPRINT_ENV === "PRODUCTION" || PAYSPRINT_ENV === "LIVE";
}
function generateUniqueReqId() {
  return Math.floor(Math.random() * 1e9).toString();
}
function generatePaysprintJWT() {
  const timestamp = Math.floor(Date.now() / 1e3);
  const reqid = generateUniqueReqId();
  const payload = {
    timestamp,
    partnerId: PAYSPRINT_PARTNER_ID,
    reqid
  };
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  const token = jwt.sign(payload, jwtTokenEnv, { algorithm: "HS256" });
  return { token, payload };
}
async function makePaysprintRequest(endpoint, payload) {
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  if (!jwtTokenEnv) {
    console.log("[Paysprint SIMULATION] No JWT token configured. Simulating:", endpoint, payload);
    return simulateResponse(endpoint, payload);
  }
  const fullUrl = `${PAYSPRINT_BASE_URL}${endpoint}`;
  try {
    const useEncryption = isProductionEnv();
    const timestamp = Math.floor(Date.now() / 1e3);
    const reqid = generateUniqueReqId();
    const fullPayload = {
      partnerId: PAYSPRINT_PARTNER_ID,
      timestamp,
      reqid,
      ...payload
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
    let requestBody;
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
    const paysprintHeaders = {
      "Content-Type": "application/json",
      "Token": jwtToken
    };
    console.log("  Token:", jwtToken.substring(0, 20) + "...");
    console.log("  Content-Type: application/json");
    console.log("  Authorisedkey: NOT included (LIVE IP BASED)");
    console.log("[STEP 5] REQUEST BODY:");
    console.log("  ", requestBody);
    console.log("[STEP 6] API ENDPOINT:");
    console.log("  URL:", fullUrl);
    console.log("  Method: POST");
    let rawText;
    let httpStatus;
    if (PAYSPRINT_PROXY_URL) {
      console.log("[STEP 7] SERVER IP: Using proxy for whitelisted IP 88.222.246.128");
      console.log("  Proxy URL:", PAYSPRINT_PROXY_URL);
      const proxyResponse = await fetch(PAYSPRINT_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: fullUrl,
          headers: paysprintHeaders,
          payload: JSON.parse(requestBody)
        })
      });
      if (!proxyResponse.ok) {
        console.error("[PAYSPRINT] Proxy returned HTTP", proxyResponse.status);
        return { status: false, response_code: 502, message: `Proxy error: HTTP ${proxyResponse.status}` };
      }
      const proxyResult = await proxyResponse.json();
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
        body: requestBody
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
    let data;
    try {
      data = JSON.parse(jsonText);
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
      message: "Failed to connect to Paysprint API"
    };
  }
}
function simulateResponse(endpoint, payload) {
  if (endpoint.includes("recharge")) {
    return {
      status: true,
      response_code: 1,
      message: "Recharge initiated successfully",
      data: {
        ackno: `UAT${Date.now()}`,
        status: "PENDING",
        utr: "",
        operator_ref: `OP${Math.random().toString(36).slice(2, 10).toUpperCase()}`
      }
    };
  }
  if (endpoint.includes("status")) {
    return {
      status: true,
      response_code: 1,
      message: "Transaction status fetched",
      data: {
        status: "SUCCESS",
        operator_ref: payload.referenceid || ""
      }
    };
  }
  return {
    status: true,
    response_code: 1,
    message: "Success"
  };
}
var OPERATOR_MAP = {
  "jio": 14,
  "airtel": 4,
  "vi": 33,
  "vodafone": 33,
  "idea": 34,
  "bsnl": 8,
  "mtnl": 10
};
async function initiateRecharge(params) {
  const operatorCode = OPERATOR_MAP[params.operator.toLowerCase()] || parseInt(params.operator) || 14;
  return makePaysprintRequest("/service/recharge/recharge/dorecharge", {
    operator: operatorCode,
    canumber: params.canumber,
    amount: params.amount,
    referenceid: params.referenceid
  });
}
async function checkRechargeStatus(referenceId) {
  return makePaysprintRequest("/service/recharge/recharge/status", {
    referenceid: referenceId
  });
}
async function getOperatorInfo(params) {
  return makePaysprintRequest("/service/recharge/hlr/api/hlr/browseplan", {
    number: params.number,
    type: params.type
  });
}

// server/services/aeps.ts
init_encryption();
import jwt2 from "jsonwebtoken";
var SENSITIVE_KEYS = /* @__PURE__ */ new Set([
  "adhaarnumber",
  "aadhaar",
  "aadhar",
  "aadharnumber",
  "piddata",
  "pid",
  "biometric",
  "biometricdata",
  "hmac",
  "skey",
  "ci",
  "sessionkey"
]);
function maskSensitiveFields(obj) {
  if (obj === null || obj === void 0) return obj;
  if (typeof obj === "string") {
    return obj.replace(/\b\d{12}\b/g, (m) => "XXXX-XXXX-" + m.slice(-4));
  }
  if (Array.isArray(obj)) return obj.map(maskSensitiveFields);
  if (typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        if (lowerKey === "adhaarnumber" || lowerKey === "aadhaar" || lowerKey === "aadhar" || lowerKey === "aadharnumber") {
          result[key] = typeof value === "string" && value.length >= 4 ? "XXXX-XXXX-" + value.slice(-4) : "[REDACTED]";
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
var PAYSPRINT_BASE_URL2 = process.env.PAYSPRINT_BASE_URL || "https://api.paysprint.in/api/v1";
var PAYSPRINT_PARTNER_ID2 = process.env.PAYSPRINT_PARTNER_ID || "";
var PAYSPRINT_ENV2 = process.env.PAYSPRINT_ENV || "PRODUCTION";
var PAYSPRINT_PROXY_URL2 = process.env.PAYSPRINT_PROXY_URL || "";
var AEPS_TIMEOUT = 18e4;
function isProductionEnv2() {
  return PAYSPRINT_ENV2 === "PRODUCTION" || PAYSPRINT_ENV2 === "LIVE";
}
function generateUniqueReqId2() {
  return Math.floor(Math.random() * 1e9).toString();
}
function generatePaysprintJWT2() {
  const timestamp = Math.floor(Date.now() / 1e3);
  const reqid = generateUniqueReqId2();
  const payload = {
    timestamp,
    partnerId: PAYSPRINT_PARTNER_ID2,
    reqid
  };
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  const token = jwt2.sign(payload, jwtTokenEnv, { algorithm: "HS256" });
  return { token, payload };
}
async function logAepsApiCall(endpoint, requestPayload, responseBody, httpStatus, success, durationMs, errorMessage) {
  try {
    const maskedPayload = maskSensitiveFields(requestPayload);
    let maskedResponse = responseBody;
    try {
      const parsed = JSON.parse(responseBody);
      maskedResponse = JSON.stringify(maskSensitiveFields(parsed));
    } catch {
      maskedResponse = typeof responseBody === "string" ? responseBody.replace(/\b\d{12}\b/g, (m) => "XXXX-XXXX-" + m.slice(-4)) : responseBody;
    }
    await storage.createAepsApiLog({
      endpoint,
      method: "POST",
      requestPayload: JSON.stringify(maskedPayload, null, 2),
      responseBody: maskedResponse,
      httpStatus,
      success,
      durationMs,
      errorMessage
    });
  } catch (err) {
    console.error("[AEPS LOG] Failed to save API log:", err);
  }
}
async function makeAepsRequest(endpoint, payload) {
  const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
  if (!jwtTokenEnv) {
    console.log("[AEPS SIMULATION] No JWT token configured. Simulating:", endpoint);
    const simResult = simulateAepsResponse(endpoint, payload);
    await logAepsApiCall(endpoint, payload, JSON.stringify(simResult), 200, simResult.status, 0, "SIMULATION MODE");
    return simResult;
  }
  const fullUrl = `${PAYSPRINT_BASE_URL2}${endpoint}`;
  const startTime = Date.now();
  const timestamp = Math.floor(Date.now() / 1e3);
  const reqid = generateUniqueReqId2();
  const fullPayload = {
    partnerId: PAYSPRINT_PARTNER_ID2,
    timestamp,
    reqid,
    ...payload
  };
  try {
    const useEncryption = isProductionEnv2();
    console.log(`[AEPS] Request to ${endpoint}`);
    const jwtResult = generatePaysprintJWT2();
    const jwtToken = jwtResult.token;
    let requestBody;
    if (useEncryption) {
      const encrypted = encryptPayload(fullPayload);
      requestBody = JSON.stringify({ data: encrypted });
    } else {
      requestBody = JSON.stringify(fullPayload);
    }
    const paysprintHeaders = {
      "Content-Type": "application/json",
      "Token": jwtToken
    };
    let rawText;
    let httpStatus;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AEPS_TIMEOUT);
    try {
      if (PAYSPRINT_PROXY_URL2) {
        const proxyResponse = await fetch(PAYSPRINT_PROXY_URL2, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: fullUrl,
            headers: paysprintHeaders,
            payload: JSON.parse(requestBody)
          }),
          signal: controller.signal
        });
        if (!proxyResponse.ok) {
          const duration2 = Date.now() - startTime;
          const errResult = { status: false, response_code: 502, message: `Proxy error: HTTP ${proxyResponse.status}` };
          await logAepsApiCall(endpoint, fullPayload, JSON.stringify(errResult), proxyResponse.status, false, duration2, `Proxy error: HTTP ${proxyResponse.status}`);
          return errResult;
        }
        const proxyResult = await proxyResponse.json();
        if (typeof proxyResult.status !== "number" || typeof proxyResult.body !== "string") {
          const duration2 = Date.now() - startTime;
          const errResult = { status: false, response_code: 502, message: "Invalid response from proxy" };
          await logAepsApiCall(endpoint, fullPayload, JSON.stringify(proxyResult), 502, false, duration2, "Invalid proxy response format");
          return errResult;
        }
        httpStatus = proxyResult.status;
        rawText = proxyResult.body;
      } else {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: paysprintHeaders,
          body: requestBody,
          signal: controller.signal
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
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      if (rawText.includes("not available in your region")) {
        const errResult2 = { status: false, response_code: 403, message: "AEPS API blocked: geographic restriction" };
        await logAepsApiCall(endpoint, fullPayload, rawText, httpStatus, false, duration, "Geographic restriction");
        return errResult2;
      }
      const errResult = { status: false, response_code: 500, message: "Invalid JSON response from Paysprint AEPS" };
      await logAepsApiCall(endpoint, fullPayload, rawText, httpStatus, false, duration, "Invalid JSON response");
      return errResult;
    }
    await logAepsApiCall(endpoint, fullPayload, rawText, httpStatus, data.status, duration);
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    if (error.name === "AbortError") {
      const errResult2 = { status: false, response_code: 408, message: "AEPS request timeout (180s)" };
      await logAepsApiCall(endpoint, fullPayload, JSON.stringify(errResult2), 408, false, duration, "Request timeout (180s)");
      return errResult2;
    }
    console.error("[AEPS] Network Error:", error);
    const errResult = { status: false, response_code: 500, message: "Failed to connect to AEPS service" };
    await logAepsApiCall(endpoint, fullPayload, JSON.stringify(errResult), 500, false, duration, error.message);
    return errResult;
  }
}
function simulateAepsResponse(endpoint, payload) {
  if (endpoint.includes("banklist")) {
    return {
      status: true,
      response_code: 1,
      message: "Bank list fetched",
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
        { iinno: "607021", bankName: "UCO Bank" }
      ]
    };
  }
  if (endpoint.includes("balanceenquiry")) {
    return {
      status: true,
      response_code: 1,
      message: "Balance enquiry successful",
      balanceamount: "15432.50",
      bankrrn: `RRN${Date.now()}`
    };
  }
  if (endpoint.includes("ministatement")) {
    return {
      status: true,
      response_code: 1,
      message: "Mini statement fetched",
      balanceamount: "15432.50",
      bankrrn: `RRN${Date.now()}`,
      ministatement: [
        { date: "15/03/2026", txnType: "CR", amount: "5000.00", narration: "NEFT-CREDIT" },
        { date: "14/03/2026", txnType: "DR", amount: "2000.00", narration: "ATM-WITHDRAWAL" },
        { date: "13/03/2026", txnType: "CR", amount: "25000.00", narration: "SALARY" }
      ]
    };
  }
  if (endpoint.includes("cashwithdraw")) {
    return {
      status: true,
      response_code: 1,
      message: "Cash withdrawal successful",
      balanceamount: "13432.50",
      bankrrn: `RRN${Date.now()}`,
      data: { ackno: `AEPS${Date.now()}` }
    };
  }
  if (endpoint.includes("aadharpay")) {
    return {
      status: true,
      response_code: 1,
      message: "Aadhaar pay successful",
      bankrrn: `RRN${Date.now()}`,
      data: { ackno: `AEPS${Date.now()}` }
    };
  }
  if (endpoint.includes("cashdeposit")) {
    return {
      status: true,
      response_code: 1,
      message: "Cash deposit successful",
      bankrrn: `RRN${Date.now()}`,
      data: { ackno: `AEPS${Date.now()}` }
    };
  }
  if (endpoint.includes("onboard")) {
    return {
      status: true,
      response_code: 1,
      message: "Onboarding URL generated",
      data: { redirecturl: "https://api.paysprint.in/onboard/kyc-form" }
    };
  }
  if (endpoint.includes("Twofactorkyc")) {
    return { status: true, response_code: 1, message: "2FA operation successful" };
  }
  return { status: true, response_code: 1, message: "Success" };
}
async function getAepsBankList() {
  return makeAepsRequest("/service/aeps/banklist/index", {});
}
async function getOnboardingUrl(params) {
  return makeAepsRequest("/service/onboard/onboard/getonboardurl", {
    merchantcode: params.merchantCode,
    mobile: params.mobile,
    email: params.email || "",
    firm: params.firmName || "RupyaSetu",
    callback: params.callbackUrl || ""
  });
}
async function twoFactorRegistration(params) {
  return makeAepsRequest("/service/aeps/kyc/Twofactorkyc/registration", params);
}
async function twoFactorAuthentication(params) {
  return makeAepsRequest("/service/aeps/kyc/Twofactorkyc/authentication", params);
}
async function balanceEnquiry(params) {
  return makeAepsRequest("/service/aeps/balanceenquiry/index", params);
}
async function miniStatement(params) {
  return makeAepsRequest("/service/aeps/ministatement/index", params);
}
async function cashWithdrawal(params) {
  return makeAepsRequest("/service/aeps/v3/cashwithdraw/index", params);
}
async function aadhaarPay(params) {
  return makeAepsRequest("/service/aeps/aadharpay/index", params);
}
async function cashDeposit(params) {
  return makeAepsRequest("/service/aeps/cashdeposit/index", params);
}
async function checkAepsTransactionStatus(params) {
  return makeAepsRequest("/service/aeps/cashwithdraw/status", params);
}

// server/services/aeps-report.ts
import PDFDocument from "pdfkit";
var GREEN = "#2E9E5B";
var DARK_GREEN = "#1E6F44";
var LIGHT_GREEN = "#E8F5E9";
var DARK_TEXT = "#1a1a1a";
var GRAY_TEXT = "#666666";
var PDF_REDACT_KEYS = /* @__PURE__ */ new Set([
  "mobilenumber",
  "mobile",
  "ipaddress",
  "ip",
  "submerchantid",
  "merchantcode",
  "email",
  "callback",
  "firm",
  "adhaarnumber",
  "aadhaar",
  "aadhar",
  "aadharnumber",
  "piddata",
  "pid",
  "biometric",
  "biometricdata",
  "hmac",
  "skey",
  "ci",
  "sessionkey",
  "data",
  "partnerid",
  "reqid",
  "timestamp"
]);
function redactForPdf(obj) {
  if (obj === null || obj === void 0) return obj;
  if (typeof obj === "string") {
    return obj.replace(/\b\d{12}\b/g, (m) => "XXXX-XXXX-" + m.slice(-4)).replace(/\b[6-9]\d{9}\b/g, "XXXXXXXXXX").replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "XXX.XXX.XXX.XXX");
  }
  if (Array.isArray(obj)) return obj.map(redactForPdf);
  if (typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (PDF_REDACT_KEYS.has(key.toLowerCase())) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactForPdf(value);
      }
    }
    return result;
  }
  return obj;
}
async function gatherReportData() {
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const isLive = !!process.env.PAYSPRINT_JWT_TOKEN;
  if (!isLive) {
    throw new Error("Cannot generate AEPS approval report: JWT token not configured. Report requires LIVE API calls for valid evidence.");
  }
  let bankListResponse = null;
  try {
    bankListResponse = await getAepsBankList();
  } catch (err) {
    bankListResponse = { error: err.message, status: false };
  }
  let txnStatusResponse = null;
  try {
    txnStatusResponse = await checkAepsTransactionStatus({
      referenceno: `REPORT_TEST_${Date.now()}`
    });
  } catch (err) {
    txnStatusResponse = { error: err.message, status: false };
  }
  const logsResult = await storage.getAepsApiLogs({ limit: 200, offset: 0 });
  let bankListLog = null;
  let txnStatusLog = null;
  for (const log2 of logsResult.logs) {
    if (!bankListLog && log2.endpoint && log2.endpoint.includes("banklist")) {
      bankListLog = log2;
    }
    if (!txnStatusLog && log2.endpoint && log2.endpoint.includes("cashwithdraw/status")) {
      txnStatusLog = log2;
    }
    if (bankListLog && txnStatusLog) break;
  }
  return {
    bankListResponse,
    txnStatusResponse,
    bankListLog,
    txnStatusLog,
    apiLogs: logsResult.logs,
    totalLogs: logsResult.total,
    generatedAt,
    isLive
  };
}
function drawHeader(doc, y) {
  doc.rect(0, y, doc.page.width, 80).fill(GREEN);
  doc.fontSize(28).font("Helvetica-Bold").fillColor("#FFFFFF").text("RupyaSetu", 50, y + 15, { width: doc.page.width - 100 });
  doc.fontSize(12).font("Helvetica").fillColor("#FFFFFF").text("AEPS API Integration Report", 50, y + 48, { width: doc.page.width - 100 });
  return y + 80;
}
function drawSectionTitle(doc, title, y) {
  if (y > doc.page.height - 100) {
    doc.addPage();
    y = 50;
  }
  doc.rect(50, y, doc.page.width - 100, 30).fill(DARK_GREEN);
  doc.fontSize(13).font("Helvetica-Bold").fillColor("#FFFFFF").text(title, 60, y + 8, { width: doc.page.width - 120 });
  return y + 40;
}
function drawKeyValue(doc, key, value, x, y, maxWidth) {
  if (y > doc.page.height - 60) {
    doc.addPage();
    y = 50;
  }
  doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK_TEXT).text(key + ":", x, y, { width: 160, continued: false });
  doc.fontSize(10).font("Helvetica").fillColor(GRAY_TEXT).text(value, x + 165, y, { width: maxWidth - 165 });
  const textHeight = doc.heightOfString(value, { width: maxWidth - 165 });
  return y + Math.max(textHeight, 14) + 4;
}
function drawTableRow(doc, cols, widths, x, y, isHeader) {
  if (y > doc.page.height - 40) {
    doc.addPage();
    y = 50;
  }
  const rowHeight = 20;
  if (isHeader) {
    doc.rect(x, y, widths.reduce((a, b) => a + b, 0), rowHeight).fill(LIGHT_GREEN);
  }
  let cx = x;
  for (let i = 0; i < cols.length; i++) {
    doc.fontSize(isHeader ? 9 : 8).font(isHeader ? "Helvetica-Bold" : "Helvetica").fillColor(isHeader ? DARK_GREEN : DARK_TEXT).text(cols[i] || "", cx + 4, y + 5, { width: widths[i] - 8, ellipsis: true, lineBreak: false });
    cx += widths[i];
  }
  if (!isHeader) {
    doc.moveTo(x, y + rowHeight).lineTo(x + widths.reduce((a, b) => a + b, 0), y + rowHeight).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
  }
  return y + rowHeight;
}
function drawJsonBlock(doc, json, x, y, maxWidth, maxLines = 30) {
  if (y > doc.page.height - 80) {
    doc.addPage();
    y = 50;
  }
  const text = typeof json === "string" ? json : JSON.stringify(json, null, 2);
  const lines = text.split("\n").slice(0, maxLines);
  const truncated = text.split("\n").length > maxLines;
  const content = lines.join("\n") + (truncated ? "\n... (truncated)" : "");
  const blockHeight = doc.heightOfString(content, { width: maxWidth - 20 }) + 16;
  doc.rect(x, y, maxWidth, Math.min(blockHeight, 300)).fill("#1a1a2e");
  doc.fontSize(7).font("Courier").fillColor("#00ff88").text(content, x + 10, y + 8, { width: maxWidth - 20, height: 290 });
  return y + Math.min(blockHeight, 300) + 8;
}
async function generateAepsReport() {
  const data = await gatherReportData();
  return new Promise((resolve2, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
      info: {
        Title: "RupyaSetu AEPS API Integration Report",
        Author: "RupyaSetu Admin",
        Subject: "AEPS Paysprint API Response Logs",
        Creator: "RupyaSetu Report Generator"
      }
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve2(Buffer.concat(chunks)));
    doc.on("error", reject);
    let y = 0;
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(GREEN);
    doc.rect(0, 0, doc.page.width, doc.page.height).fillOpacity(0.1).fill("#000000");
    doc.fillOpacity(1);
    doc.fontSize(42).font("Helvetica-Bold").fillColor("#FFFFFF").text("RupyaSetu", 0, 200, { align: "center", width: doc.page.width });
    doc.fontSize(18).font("Helvetica").fillColor("#FFFFFF").text("AEPS API Integration Report", 0, 260, { align: "center", width: doc.page.width });
    doc.moveTo(doc.page.width / 2 - 80, 300).lineTo(doc.page.width / 2 + 80, 300).strokeColor("#FFFFFF").lineWidth(2).stroke();
    doc.fontSize(12).font("Helvetica").fillColor("#FFFFFF").text("Prepared for: Paysprint Integration Team", 0, 330, { align: "center", width: doc.page.width });
    doc.fontSize(11).font("Helvetica").fillColor("#FFFFFF").text(`Generated: ${new Date(data.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, 0, 355, { align: "center", width: doc.page.width });
    const jwtConfigured = !!process.env.PAYSPRINT_JWT_TOKEN;
    const envLabel = jwtConfigured ? `Environment: ${process.env.PAYSPRINT_ENV || "PRODUCTION"} (LIVE API)` : "Environment: SIMULATION MODE (JWT not configured)";
    doc.fontSize(11).font("Helvetica").fillColor("#FFFFFF").text(envLabel, 0, 380, { align: "center", width: doc.page.width });
    const maskedPartner = process.env.PAYSPRINT_PARTNER_ID ? "Partner ID: ***" + (process.env.PAYSPRINT_PARTNER_ID || "").slice(-4) : "Partner ID: Not configured";
    doc.fontSize(11).font("Helvetica").fillColor("#FFFFFF").text(maskedPartner, 0, 405, { align: "center", width: doc.page.width });
    doc.fontSize(11).font("Helvetica").fillColor("#FFFFFF").text(`Total API Calls Logged: ${data.totalLogs}`, 0, 430, { align: "center", width: doc.page.width });
    doc.fontSize(10).font("Helvetica").fillColor("#FFFFFF").text("Confidential - For Internal Use Only", 0, 700, { align: "center", width: doc.page.width });
    doc.addPage();
    y = drawHeader(doc, 0);
    y += 20;
    y = drawSectionTitle(doc, "1. Report Summary", y);
    y = drawKeyValue(doc, "Report Type", "AEPS API Response Logs & Integration Status", 50, y, 450);
    y = drawKeyValue(doc, "Base URL", process.env.PAYSPRINT_BASE_URL || "https://api.paysprint.in/api/v1", 50, y, 450);
    y = drawKeyValue(doc, "Partner ID", process.env.PAYSPRINT_PARTNER_ID ? "***" + (process.env.PAYSPRINT_PARTNER_ID || "").slice(-4) : "Not configured", 50, y, 450);
    y = drawKeyValue(doc, "Environment", process.env.PAYSPRINT_ENV || "PRODUCTION", 50, y, 450);
    y = drawKeyValue(doc, "Encryption", "AES-128-CBC (Production Mode)", 50, y, 450);
    y = drawKeyValue(doc, "Authentication", "JWT (HS256) with Token header", 50, y, 450);
    y = drawKeyValue(doc, "Request Timeout", "180 seconds (all AEPS endpoints)", 50, y, 450);
    y = drawKeyValue(doc, "Total Logged API Calls", data.totalLogs.toString(), 50, y, 450);
    y = drawKeyValue(doc, "Report Generated", new Date(data.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), 50, y, 450);
    y += 10;
    y = drawSectionTitle(doc, "2. AEPS Endpoints \u2014 Request/Response Format", y);
    const endpointDocs = [
      {
        path: "/service/aeps/banklist/index",
        desc: "Fetch supported bank list for AEPS",
        biometric: false,
        requestFields: "partnerId, timestamp, reqid",
        responseFields: "status, response_code, message, banklist.data[{id, bankName, iinno, activeFlag}]"
      },
      {
        path: "/service/aeps/balanceenquiry/index",
        desc: "Check Aadhaar-linked bank balance",
        biometric: true,
        requestFields: "latitude, longitude, mobilenumber, adhaarnumber, nationalbankidentification, data (PID XML), pipe, accessmodetype, submerchantid, referenceno, timestamp, transactiontype, is_iris, requestremarks",
        responseFields: "status, response_code, message, balanceamount, bankrrn"
      },
      {
        path: "/service/aeps/ministatement/index",
        desc: "Fetch mini bank statement",
        biometric: true,
        requestFields: "latitude, longitude, mobilenumber, adhaarnumber, nationalbankidentification, data (PID XML), pipe, accessmodetype, submerchantid, referenceno, timestamp, transactiontype, is_iris, requestremarks",
        responseFields: "status, response_code, message, balanceamount, bankrrn, ministatement[{date, txnType, amount, narration}]"
      },
      {
        path: "/service/aeps/v3/cashwithdraw/index",
        desc: "Cash withdrawal via AEPS",
        biometric: true,
        requestFields: "latitude, longitude, mobilenumber, adhaarnumber, nationalbankidentification, data (PID XML), pipe, accessmodetype, submerchantid, referenceno, timestamp, transactiontype, is_iris, amount, requestremarks",
        responseFields: "status, response_code, message, balanceamount, bankrrn, data.ackno"
      },
      {
        path: "/service/aeps/aadharpay/index",
        desc: "Aadhaar Pay transaction",
        biometric: true,
        requestFields: "latitude, longitude, mobilenumber, adhaarnumber, nationalbankidentification, data (PID XML), pipe, accessmodetype, submerchantid, referenceno, timestamp, transactiontype, is_iris, amount, requestremarks",
        responseFields: "status, response_code, message, bankrrn, data.ackno"
      },
      {
        path: "/service/aeps/cashdeposit/index",
        desc: "Cash deposit via AEPS",
        biometric: true,
        requestFields: "latitude, longitude, mobilenumber, adhaarnumber, nationalbankidentification, data (PID XML), pipe, accessmodetype, submerchantid, referenceno, timestamp, transactiontype, is_iris, amount, requestremarks",
        responseFields: "status, response_code, message, bankrrn, data.ackno"
      },
      {
        path: "/service/aeps/cashwithdraw/status",
        desc: "Check transaction status by reference",
        biometric: false,
        requestFields: "partnerId, timestamp, reqid, referenceno",
        responseFields: "status, response_code, message, data"
      },
      {
        path: "/service/aeps/kyc/Twofactorkyc/registration",
        desc: "2FA KYC registration",
        biometric: true,
        requestFields: "accessmodetype, adhaarnumber, mobilenumber, latitude, longitude, referenceno, submerchantid, data (PID XML), ipaddress, timestamp, is_iris",
        responseFields: "status, response_code, message"
      },
      {
        path: "/service/aeps/kyc/Twofactorkyc/authentication",
        desc: "2FA daily authentication",
        biometric: true,
        requestFields: "accessmodetype, adhaarnumber, mobilenumber, latitude, longitude, referenceno, submerchantid, data (PID XML), ipaddress, timestamp, is_iris",
        responseFields: "status, response_code, message"
      },
      {
        path: "/service/onboard/onboard/getonboardurl",
        desc: "Merchant onboarding URL",
        biometric: false,
        requestFields: "merchantcode, mobile, email, firm, callback",
        responseFields: "status, response_code, message, data.redirecturl"
      }
    ];
    for (const ep of endpointDocs) {
      y = drawKeyValue(doc, "Endpoint", ep.path, 50, y, 450);
      y = drawKeyValue(doc, "Description", ep.desc, 50, y, 450);
      y = drawKeyValue(doc, "Biometric Required", ep.biometric ? "Yes" : "No", 50, y, 450);
      y = drawKeyValue(doc, "Request Fields", ep.requestFields, 50, y, 450);
      y = drawKeyValue(doc, "Response Fields", ep.responseFields, 50, y, 450);
      y += 6;
    }
    y += 5;
    y = drawSectionTitle(doc, "3. Live API Call \u2014 Bank List (Full Evidence)", y);
    y = drawKeyValue(doc, "Endpoint", "/service/aeps/banklist/index", 50, y, 450);
    y = drawKeyValue(doc, "Method", "POST", 50, y, 450);
    y = drawKeyValue(doc, "Status", data.bankListResponse?.status ? "SUCCESS" : "FAILED", 50, y, 450);
    y = drawKeyValue(doc, "Response Code", String(data.bankListResponse?.response_code ?? "N/A"), 50, y, 450);
    y = drawKeyValue(doc, "Message", data.bankListResponse?.message || "N/A", 50, y, 450);
    if (data.bankListLog) {
      y = drawKeyValue(doc, "Duration", `${data.bankListLog.durationMs}ms`, 50, y, 450);
      y = drawKeyValue(doc, "HTTP Status", String(data.bankListLog.httpStatus), 50, y, 450);
    }
    const bankData = data.bankListResponse?.data || data.bankListResponse?.banklist?.data;
    if (bankData && Array.isArray(bankData)) {
      y = drawKeyValue(doc, "Banks Returned", bankData.length.toString(), 50, y, 450);
      y += 5;
      const bankWidths = [120, 335];
      y = drawTableRow(doc, ["IIN Number", "Bank Name"], bankWidths, 50, y, true);
      const banksToShow = bankData.slice(0, 25);
      for (const bank of banksToShow) {
        y = drawTableRow(doc, [bank.iinno || bank.iinNo || "", bank.bankName || bank.bankname || ""], bankWidths, 50, y, false);
      }
      if (bankData.length > 25) {
        doc.fontSize(8).font("Helvetica").fillColor(GRAY_TEXT).text(`... and ${bankData.length - 25} more banks`, 50, y + 2);
        y += 14;
      }
    }
    y += 5;
    if (data.bankListLog) {
      y = drawKeyValue(doc, "Request Payload (redacted)", "", 50, y, 450);
      try {
        y = drawJsonBlock(doc, redactForPdf(JSON.parse(data.bankListLog.requestPayload)), 50, y, doc.page.width - 100, 15);
      } catch {
        y = drawJsonBlock(doc, redactForPdf(data.bankListLog.requestPayload), 50, y, doc.page.width - 100, 15);
      }
    }
    y = drawKeyValue(doc, "Response Body", "", 50, y, 450);
    y = drawJsonBlock(doc, data.bankListResponse, 50, y, doc.page.width - 100, 25);
    y = drawSectionTitle(doc, "4. Live API Call \u2014 Transaction Status (Full Evidence)", y);
    y = drawKeyValue(doc, "Endpoint", "/service/aeps/cashwithdraw/status", 50, y, 450);
    y = drawKeyValue(doc, "Method", "POST", 50, y, 450);
    y = drawKeyValue(doc, "Test Reference", "REPORT_TEST_*", 50, y, 450);
    y = drawKeyValue(doc, "Status", data.txnStatusResponse?.status ? "SUCCESS" : "FAILED/NOT FOUND", 50, y, 450);
    y = drawKeyValue(doc, "Response Code", String(data.txnStatusResponse?.response_code ?? "N/A"), 50, y, 450);
    y = drawKeyValue(doc, "Message", data.txnStatusResponse?.message || "N/A", 50, y, 450);
    if (data.txnStatusLog) {
      y = drawKeyValue(doc, "Duration", `${data.txnStatusLog.durationMs}ms`, 50, y, 450);
      y = drawKeyValue(doc, "HTTP Status", String(data.txnStatusLog.httpStatus), 50, y, 450);
    }
    y += 5;
    if (data.txnStatusLog) {
      y = drawKeyValue(doc, "Request Payload (redacted)", "", 50, y, 450);
      try {
        y = drawJsonBlock(doc, redactForPdf(JSON.parse(data.txnStatusLog.requestPayload)), 50, y, doc.page.width - 100, 15);
      } catch {
        y = drawJsonBlock(doc, redactForPdf(data.txnStatusLog.requestPayload), 50, y, doc.page.width - 100, 15);
      }
    }
    y = drawKeyValue(doc, "Response Body", "", 50, y, 450);
    y = drawJsonBlock(doc, data.txnStatusResponse, 50, y, doc.page.width - 100, 15);
    y = drawSectionTitle(doc, "5. Captured API Logs (from Database)", y);
    y = drawKeyValue(doc, "Total Logs in DB", data.totalLogs.toString(), 50, y, 450);
    y = drawKeyValue(doc, "Showing", `${Math.min(data.apiLogs.length, 50)} most recent`, 50, y, 450);
    y += 5;
    const logWidths = [90, 130, 40, 45, 50, 100];
    y = drawTableRow(doc, ["Timestamp", "Endpoint", "HTTP", "Result", "Duration", "Error"], logWidths, 50, y, true);
    const logsToShow = data.apiLogs.slice(0, 50);
    for (const log2 of logsToShow) {
      const ts = log2.createdAt ? new Date(log2.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }).replace(",", "") : "N/A";
      const shortEndpoint = (log2.endpoint || "").replace("/service/aeps/", "").replace("/index", "");
      y = drawTableRow(doc, [
        ts,
        shortEndpoint,
        String(log2.httpStatus),
        log2.success ? "OK" : "FAIL",
        `${log2.durationMs}ms`,
        (log2.errorMessage || "").substring(0, 30)
      ], logWidths, 50, y, false);
    }
    y += 10;
    y = drawSectionTitle(doc, "6. Security & Data Protection", y);
    const securityItems = [
      ["Encryption", "AES-128-CBC encryption for all production API payloads"],
      ["JWT Auth", "HS256 JWT tokens with timestamp and unique request IDs"],
      ["Aadhaar Masking", "All Aadhaar numbers masked to XXXX-XXXX-NNNN in logs"],
      ["Biometric Redaction", "PID data, HMAC, session keys fully redacted in logs"],
      ["Request Timeout", "180-second timeout for all AEPS calls"],
      ["Daily 2FA", "Mandatory biometric 2FA authentication before transactions"],
      ["KYC Onboarding", "Merchant KYC verification before AEPS access"],
      ["Admin Logging", "All API calls logged with timing, request/response for audit"],
      ["Sensitive Fields", "adhaarnumber, piddata, hmac, skey, ci, sessionkey are never stored in plaintext"]
    ];
    for (const [label, desc] of securityItems) {
      y = drawKeyValue(doc, label, desc, 50, y, 450);
    }
    y += 10;
    y = drawSectionTitle(doc, "7. Admin Panel Logging Capabilities", y);
    const adminItems = [
      ["Real-time Logs", "Auto-refreshing AEPS API logs table in admin panel"],
      ["Endpoint Filter", "Filter logs by specific AEPS endpoint (balance, withdraw, etc.)"],
      ["Status Filter", "Filter by success/failure status"],
      ["Date Range", "Filter by date range for historical analysis"],
      ["Pagination", "Paginated log viewing (50 per page)"],
      ["Log Detail", "Expandable request/response detail view for each log"],
      ["CSV Export", "Full filtered export to CSV with all log data"],
      ["Copy Function", "One-click copy of log details"]
    ];
    for (const [label, desc] of adminItems) {
      y = drawKeyValue(doc, label, desc, 50, y, 450);
    }
    y = drawSectionTitle(doc, "8. UAT / Biometric Testing Note", y);
    y = drawKeyValue(doc, "Non-biometric endpoints", "Bank List and Transaction Status \u2014 tested live in this report", 50, y, 450);
    y = drawKeyValue(doc, "Biometric endpoints", "Balance Enquiry, Cash Withdrawal, Mini Statement, Aadhaar Pay, Cash Deposit, 2FA KYC \u2014 require UIDAI-certified RD device with real Aadhaar biometric data", 50, y, 450);
    y = drawKeyValue(doc, "UAT Plan", "Biometric-dependent endpoints will be tested during UAT with the Paysprint team using a certified RD device and live Aadhaar authentication", 50, y, 450);
    y = drawKeyValue(doc, "Supported Pipes", "bank2, bank3, bank5, bank6 (LIVE); bank1 (UAT only)", 50, y, 450);
    y += 10;
    doc.fontSize(8).font("Helvetica").fillColor(GRAY_TEXT).text(
      `RupyaSetu AEPS Report | Generated ${new Date(data.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} | Confidential`,
      50,
      doc.page.height - 30,
      { width: doc.page.width - 100, align: "center" }
    );
    doc.end();
  });
}

// shared/schema.ts
import { z } from "zod";
var phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian mobile number");
var otpSchema = z.string().regex(/^\d{4,6}$/, "Invalid OTP format");
var utrSchema = z.string().regex(/^[A-Za-z0-9]{12,22}$/, "Invalid UTR format (12-22 alphanumeric characters)");
var rechargeTypes = ["MOBILE", "DTH"];
var aepsTransactionTypes = ["BALANCE_ENQUIRY", "MINI_STATEMENT", "CASH_WITHDRAWAL", "AADHAAR_PAY", "CASH_DEPOSIT"];
var sendOtpSchema = z.object({
  phone: phoneSchema
});
var verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: otpSchema
});
var createRechargeSchema = z.object({
  type: z.enum(rechargeTypes),
  operatorId: z.string().min(1),
  subscriberNumber: z.string().min(1),
  amount: z.number().positive(),
  planId: z.string().optional()
});
var submitUtrSchema = z.object({
  transactionId: z.string().min(1),
  utr: utrSchema
});
var aepsOnboardSchema = z.object({
  merchantCode: z.string().min(1)
});
var aepsTransactionSchema = z.object({
  type: z.enum(aepsTransactionTypes),
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Invalid Aadhaar number"),
  customerMobile: z.string().regex(/^[6-9]\d{9}$/, "Invalid mobile number"),
  bankIin: z.string().min(1, "Bank is required"),
  bankName: z.string().min(1, "Bank name is required"),
  amount: z.number().optional(),
  latitude: z.string().default("28.6139"),
  longitude: z.string().default("77.2090"),
  fingerprintData: z.string().optional(),
  pipe: z.string().default("bank2")
});

// server/routes.ts
var PAYMENT_MODE = process.env.PAYMENT_MODE || "MANUAL";
var PAYEE_UPI_ID = process.env.PAYEE_UPI_ID || "rupyasetu@upi";
var ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
var ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "rupyasetu@2026";
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.slice(7);
  const payload = verifyJwtToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.userId = payload.userId;
  req.phone = payload.phone;
  next();
}
async function registerRoutes(app2) {
  app2.post("/api/auth/send-otp", async (req, res) => {
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
          expiresAt: Date.now() + 5 * 60 * 1e3,
          attempts: 0
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
          expiresAt: Date.now() + 5 * 60 * 1e3,
          attempts: 0
        });
        console.log(`[OTP] OTP sent to ${phone} via SMS Alert`);
      }
      res.json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
      console.error("Send OTP error:", error);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  });
  app2.post("/api/auth/verify-otp", async (req, res) => {
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
        user: { id: user.id, phone: user.phone, name: user.name }
      });
    } catch (error) {
      console.error("Verify OTP error:", error);
      res.status(500).json({ error: "Failed to verify OTP" });
    }
  });
  app2.get("/api/user/profile", authMiddleware, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ user: { id: user.id, phone: user.phone, name: user.name } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });
  app2.put("/api/user/profile", authMiddleware, async (req, res) => {
    try {
      const { name } = req.body;
      const user = await storage.updateUser(req.userId, { name });
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ user: { id: user.id, phone: user.phone, name: user.name } });
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });
  app2.get("/api/operators", authMiddleware, async (req, res) => {
    try {
      const type = req.query.type;
      const operators = await storage.getOperators(type);
      res.json({ operators });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch operators" });
    }
  });
  app2.get("/api/plans/:operatorId", authMiddleware, async (req, res) => {
    try {
      const { operatorId } = req.params;
      const category = req.query.category;
      const plans = await storage.getPlans(operatorId, category);
      res.json({ plans });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });
  app2.post("/api/recharge/initiate", authMiddleware, async (req, res) => {
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
      let user = await storage.getUser(req.userId);
      if (!user) {
        user = await storage.createUserWithId(req.userId, req.phone);
      }
      const operator = await storage.getOperator(operatorId);
      if (!operator) {
        return res.status(400).json({ error: "Invalid operator" });
      }
      let planDescription;
      if (planId) {
        const plans = await storage.getPlans(operatorId);
        const plan = plans.find((p) => p.id === planId);
        if (plan) planDescription = plan.description;
      }
      const transaction = await storage.createTransaction({
        userId: req.userId,
        type,
        operatorId,
        operatorName: operator.name,
        subscriberNumber,
        amount,
        planId,
        planDescription,
        paymentStatus: "PAYMENT_PENDING",
        rechargeStatus: "RECHARGE_PENDING"
      });
      const responseData = {
        success: true,
        transaction: {
          id: transaction.id,
          amount: transaction.amount,
          operatorName: transaction.operatorName,
          subscriberNumber: transaction.subscriberNumber
        },
        paymentMode: PAYMENT_MODE
      };
      if (PAYMENT_MODE === "MANUAL") {
        responseData.upiDetails = {
          payeeVpa: PAYEE_UPI_ID,
          amount: transaction.amount,
          note: `Recharge ${transaction.subscriberNumber} - ${transaction.operatorName}`,
          transactionId: transaction.id
        };
      }
      res.json(responseData);
    } catch (error) {
      console.error("Initiate recharge error:", error);
      res.status(500).json({ error: "Failed to initiate recharge" });
    }
  });
  app2.post("/api/recharge/submit-utr", authMiddleware, async (req, res) => {
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
      if (transaction.userId !== req.userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      if (transaction.paymentStatus !== "PAYMENT_PENDING") {
        return res.status(400).json({ error: "Payment already processed" });
      }
      await storage.updateTransaction(transactionId, {
        utr,
        paymentStatus: "PAYMENT_UNVERIFIED",
        rechargeStatus: "RECHARGE_PENDING"
      });
      const updatedTx = await storage.getTransaction(transactionId);
      res.json({
        success: true,
        message: "Payment reference submitted. Your recharge will be confirmed within 24 hours.",
        transaction: updatedTx
      });
    } catch (error) {
      console.error("Submit UTR error:", error);
      res.status(500).json({ error: "Failed to process payment" });
    }
  });
  app2.get("/api/transactions", authMiddleware, async (req, res) => {
    try {
      const transactions = await storage.getUserTransactions(req.userId);
      res.json({ transactions });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });
  app2.get("/api/transactions/:id", authMiddleware, async (req, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.id);
      if (!transaction) return res.status(404).json({ error: "Transaction not found" });
      if (transaction.userId !== req.userId) return res.status(403).json({ error: "Unauthorized" });
      res.json({ transaction });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transaction" });
    }
  });
  app2.get("/api/config", (_req, res) => {
    res.json({
      paymentMode: PAYMENT_MODE,
      payeeUpiId: PAYEE_UPI_ID
    });
  });
  function adminAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Admin authentication required" });
    }
    const token = authHeader.slice(7);
    const payload = verifyJwtToken(token);
    if (!payload || !payload.isAdmin) {
      return res.status(401).json({ error: "Invalid admin token" });
    }
    next();
  }
  app2.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = generateJwtToken({ userId: "admin", phone: "admin", isAdmin: true });
      return res.json({ success: true, token });
    }
    return res.status(401).json({ error: "Invalid admin credentials" });
  });
  app2.get("/api/admin/transactions", adminAuthMiddleware, async (_req, res) => {
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
  app2.post("/api/admin/transactions/:id/approve", adminAuthMiddleware, async (req, res) => {
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
        rechargeStatus: "RECHARGE_PROCESSING"
      });
      const rechargeResult = await initiateRecharge({
        operator: transaction.operatorId,
        canumber: transaction.subscriberNumber,
        amount: transaction.amount,
        recharge_type: transaction.type === "MOBILE" ? "prepaid" : "dth",
        referenceid: req.params.id
      });
      if (rechargeResult.status) {
        await storage.updateTransaction(req.params.id, {
          paysprintRefId: rechargeResult.data?.ackno,
          rechargeStatus: "RECHARGE_SUCCESS"
        });
      } else if (rechargeResult.response_code === 403) {
        await storage.updateTransaction(req.params.id, {
          rechargeStatus: "RECHARGE_PENDING"
        });
      } else {
        await storage.updateTransaction(req.params.id, {
          rechargeStatus: "RECHARGE_FAILED"
        });
      }
      const updatedTx = await storage.getTransaction(req.params.id);
      res.json({ success: true, transaction: updatedTx, rechargeMessage: rechargeResult.message });
    } catch (error) {
      console.error("Admin approve error:", error);
      res.status(500).json({ error: "Failed to approve transaction" });
    }
  });
  app2.post("/api/admin/transactions/:id/retry", adminAuthMiddleware, async (req, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.id);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      if (transaction.paymentStatus !== "PAYMENT_VERIFIED" || transaction.rechargeStatus !== "RECHARGE_PENDING" && transaction.rechargeStatus !== "RECHARGE_FAILED") {
        return res.status(400).json({ error: "Transaction is not in a retryable state" });
      }
      await storage.updateTransaction(req.params.id, {
        rechargeStatus: "RECHARGE_PROCESSING"
      });
      const rechargeResult = await initiateRecharge({
        operator: transaction.operatorId,
        canumber: transaction.subscriberNumber,
        amount: transaction.amount,
        recharge_type: transaction.type === "MOBILE" ? "prepaid" : "dth",
        referenceid: req.params.id
      });
      if (rechargeResult.status) {
        await storage.updateTransaction(req.params.id, {
          paysprintRefId: rechargeResult.data?.ackno,
          rechargeStatus: "RECHARGE_SUCCESS"
        });
      } else if (rechargeResult.response_code === 403) {
        await storage.updateTransaction(req.params.id, {
          rechargeStatus: "RECHARGE_PENDING"
        });
      } else {
        await storage.updateTransaction(req.params.id, {
          rechargeStatus: "RECHARGE_FAILED"
        });
      }
      const updatedTx = await storage.getTransaction(req.params.id);
      res.json({ success: true, transaction: updatedTx, rechargeMessage: rechargeResult.message });
    } catch (error) {
      console.error("Admin retry error:", error);
      res.status(500).json({ error: "Failed to retry recharge" });
    }
  });
  app2.post("/api/admin/transactions/:id/mark-success", adminAuthMiddleware, async (req, res) => {
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
        paysprintRefId: "MANUAL_" + Date.now()
      });
      const updatedTx = await storage.getTransaction(req.params.id);
      res.json({ success: true, transaction: updatedTx });
    } catch (error) {
      console.error("Admin mark-success error:", error);
      res.status(500).json({ error: "Failed to mark transaction as success" });
    }
  });
  app2.post("/api/admin/transactions/:id/reject", adminAuthMiddleware, async (req, res) => {
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
        rechargeStatus: "RECHARGE_FAILED"
      });
      const updatedTx = await storage.getTransaction(req.params.id);
      res.json({ success: true, transaction: updatedTx });
    } catch (error) {
      console.error("Admin reject error:", error);
      res.status(500).json({ error: "Failed to reject transaction" });
    }
  });
  app2.post("/api/admin/paysprint-test", adminAuthMiddleware, async (req, res) => {
    try {
      const { action, operator, canumber, amount, recharge_type, number, type, referenceid } = req.body;
      console.log("\n========================================");
      console.log("[PAYSPRINT TEST] Action:", action);
      console.log("[PAYSPRINT TEST] Timestamp:", (/* @__PURE__ */ new Date()).toISOString());
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
          referenceid: testRefId
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
  app2.post("/api/admin/paysprint-test-raw", adminAuthMiddleware, async (req, res) => {
    try {
      const { action, operator, canumber, amount, recharge_type, referenceid } = req.body;
      const jwt3 = await import("jsonwebtoken");
      const { encryptPayload: encryptPayload2 } = await Promise.resolve().then(() => (init_encryption(), encryption_exports));
      const PAYSPRINT_BASE_URL3 = process.env.PAYSPRINT_BASE_URL || "https://api.paysprint.in/api/v1";
      const PAYSPRINT_PARTNER_ID4 = process.env.PAYSPRINT_PARTNER_ID || "";
      const PAYSPRINT_ENV_VAL = process.env.PAYSPRINT_ENV || "PRODUCTION";
      const jwtTokenEnv = process.env.PAYSPRINT_JWT_TOKEN || "";
      const useEncryption = PAYSPRINT_ENV_VAL === "PRODUCTION" || PAYSPRINT_ENV_VAL === "LIVE";
      const timestamp = Math.floor(Date.now() / 1e3);
      const uniqueReqId = Math.floor(Math.random() * 1e9).toString();
      const jwtPayload = { timestamp, partnerId: PAYSPRINT_PARTNER_ID4, reqid: uniqueReqId };
      const jwtToken = jwt3.default.sign(jwtPayload, jwtTokenEnv, { algorithm: "HS256" });
      let endpoint = "/service/recharge/recharge/dorecharge";
      let apiFields = {};
      if (action === "balance") {
        endpoint = "/service/balance/balance/cashbalance";
        apiFields = {};
      } else if (action === "status") {
        endpoint = "/service/recharge/recharge/status";
        apiFields = { referenceid: referenceid || "TEST123" };
      } else {
        const OPERATOR_MAP2 = { jio: 14, airtel: 4, vi: 33, vodafone: 33, idea: 34, bsnl: 8, mtnl: 10 };
        const opCode = OPERATOR_MAP2[(operator || "jio").toLowerCase()] || parseInt(operator) || 14;
        apiFields = {
          operator: opCode,
          canumber: canumber || "7067018549",
          amount: amount || 10,
          referenceid: referenceid || `RSLIVE${timestamp}`
        };
      }
      const requestBody = {
        partnerId: PAYSPRINT_PARTNER_ID4,
        timestamp,
        reqid: uniqueReqId,
        ...apiFields
      };
      console.log("[PAYSPRINT RAW TEST] Payload before encryption:", JSON.stringify(requestBody));
      const fullUrl = `${PAYSPRINT_BASE_URL3}${endpoint}`;
      let bodyStr;
      let encryptedOutput = "";
      let encryptionActual = useEncryption ? "AES-128-CBC" : "Plain JSON";
      if (useEncryption) {
        try {
          const encrypted = encryptPayload2(requestBody);
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
      const curlCommand = `curl --location --request POST \\
  "${fullUrl}" \\
  --header "Content-Type: application/json" \\
  --header "Token: ${maskedToken}" \\
  --data-raw '${bodyStr}'`;
      const PAYSPRINT_PROXY_URL3 = process.env.PAYSPRINT_PROXY_URL || "";
      const paysprintHeaders = {
        "Content-Type": "application/json",
        "Token": jwtToken
      };
      let rawText;
      let httpStatus;
      let proxyUsed = false;
      if (PAYSPRINT_PROXY_URL3) {
        proxyUsed = true;
        const proxyResponse = await fetch(PAYSPRINT_PROXY_URL3, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: fullUrl,
            headers: paysprintHeaders,
            payload: JSON.parse(bodyStr)
          })
        });
        if (!proxyResponse.ok) {
          res.status(502).json({ error: "Lambda proxy error", http_status: proxyResponse.status });
          return;
        }
        const proxyResult = await proxyResponse.json();
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
          body: bodyStr
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
      const decodedJwt = jwt3.default.decode(jwtToken);
      res.json({
        debug_report: {
          step1_jwt: {
            payload: jwtPayload,
            decoded: decodedJwt,
            token_preview: jwtToken.substring(0, 30) + "..."
          },
          step2_payload_before_encryption: requestBody,
          step3_encryption: {
            algorithm: encryptionActual,
            encrypted_length: encryptedOutput.length || 0,
            encrypted_preview: encryptedOutput ? encryptedOutput.substring(0, 40) + "..." : "N/A"
          },
          step4_headers: {
            "Token": jwtToken.substring(0, 20) + "...",
            "Content-Type": "application/json",
            "Authorisedkey": "NOT included (LIVE IP BASED)"
          },
          step5_request_body: bodyStr,
          step6_endpoint: fullUrl,
          step7_proxy: proxyUsed ? PAYSPRINT_PROXY_URL3 : "direct",
          step8_response: {
            http_status: httpStatus,
            body: parsedResponse
          }
        },
        curl_command: curlCommand
      });
    } catch (error) {
      console.error("[PAYSPRINT RAW TEST] Error:", error);
      res.status(500).json({ error: "Paysprint raw test failed", details: String(error) });
    }
  });
  let cachedBankList = null;
  const BANK_CACHE_TTL = 24 * 60 * 60 * 1e3;
  app2.get("/api/aeps/banks", authMiddleware, async (_req, res) => {
    try {
      if (cachedBankList && Date.now() - cachedBankList.cachedAt < BANK_CACHE_TTL) {
        return res.json({ success: true, banks: cachedBankList.banks });
      }
      const result = await getAepsBankList();
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
  app2.get("/api/aeps/merchant", authMiddleware, async (req, res) => {
    try {
      const merchant = await storage.getAepsMerchant(req.userId);
      if (!merchant) {
        return res.json({ merchant: null, onboarded: false });
      }
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const dailyAuth = await storage.getAepsDailyAuth(req.userId, today);
      res.json({
        merchant,
        onboarded: merchant.kycStatus === "COMPLETED",
        dailyAuthenticated: dailyAuth?.authenticated || false
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch merchant info" });
    }
  });
  app2.post("/api/aeps/onboard", authMiddleware, async (req, res) => {
    try {
      const { merchantCode } = req.body;
      if (!merchantCode) {
        return res.status(400).json({ error: "Merchant code is required" });
      }
      const user = await storage.getUser(req.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const result = await getOnboardingUrl({
        merchantCode,
        mobile: user.phone
      });
      if (result.status && result.data?.redirecturl) {
        const merchant = await storage.getAepsMerchant(req.userId);
        if (!merchant) {
          await storage.createAepsMerchant(req.userId, merchantCode, "bank2", {
            phone: user.phone,
            createdBy: "self",
            kycRedirectUrl: result.data.redirecturl
          });
        } else {
          await storage.updateAepsMerchant(req.userId, { merchantCode, kycStatus: "PENDING", kycRedirectUrl: result.data.redirecturl });
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
  app2.post("/api/aeps/onboard/complete", authMiddleware, async (req, res) => {
    try {
      const { merchantCode } = req.body;
      const existing = await storage.getAepsMerchant(req.userId);
      if (!existing) return res.status(404).json({ error: "Merchant not found. Start onboarding first." });
      if (existing.kycStatus === "COMPLETED") {
        return res.json({ success: true, kycStatus: "COMPLETED" });
      }
      const user = await storage.getUser(req.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const mCode = merchantCode || existing.merchantCode;
      const verifyResult = await getOnboardingUrl({
        merchantCode: mCode,
        mobile: user.phone
      });
      if (verifyResult.status && verifyResult.response_code === 1) {
        const updates = { kycStatus: "COMPLETED" };
        if (merchantCode) updates.merchantCode = merchantCode;
        const merchant = await storage.updateAepsMerchant(req.userId, updates);
        res.json({ success: true, kycStatus: "COMPLETED" });
      } else {
        res.json({ success: false, kycStatus: "PENDING", message: "KYC verification not yet complete. Please complete the onboarding process first." });
      }
    } catch (error) {
      console.error("AEPS onboard complete error:", error);
      res.status(500).json({ error: "Onboarding verification failed" });
    }
  });
  app2.get("/api/aeps/transaction/:id/status", authMiddleware, async (req, res) => {
    try {
      const tx = await storage.getAepsTransaction(req.params.id);
      if (!tx) return res.status(404).json({ error: "Transaction not found" });
      if (tx.userId !== req.userId) return res.status(403).json({ error: "Unauthorized" });
      if (tx.status === "AEPS_PROCESSING" && tx.referenceNo) {
        try {
          const liveStatus = await checkAepsTransactionStatus({
            referenceno: tx.referenceNo
          });
          if (liveStatus.status && liveStatus.data) {
            const newStatus = liveStatus.response_code === 1 ? "AEPS_SUCCESS" : "AEPS_FAILED";
            await storage.updateAepsTransaction(tx.id, {
              status: newStatus,
              message: liveStatus.message
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
  app2.post("/api/aeps/2fa/register", authMiddleware, async (req, res) => {
    try {
      const result = await twoFactorRegistration(req.body);
      res.json({ success: result.status, message: result.message, data: result.data });
    } catch (error) {
      console.error("AEPS 2FA register error:", error);
      res.status(500).json({ error: "2FA registration failed" });
    }
  });
  app2.post("/api/aeps/2fa/authenticate", authMiddleware, async (req, res) => {
    try {
      const { aadhaarNumber, data: biometricData, latitude, longitude } = req.body;
      if (!biometricData) {
        return res.status(400).json({ error: "Biometric data is required for 2FA authentication" });
      }
      const user = await storage.getUser(req.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const merchant = await storage.getAepsMerchant(req.userId);
      if (!merchant || merchant.kycStatus !== "COMPLETED") {
        return res.status(403).json({ error: "Complete merchant onboarding first" });
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
      const referenceNo = `2FA${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const fullPayload = {
        accessmodetype: "site",
        adhaarnumber: aadhaarNumber || "",
        mobilenumber: user.phone,
        latitude: latitude || "0.0",
        longitude: longitude || "0.0",
        referenceno: referenceNo,
        submerchantid: merchant.merchantCode || PAYSPRINT_PARTNER_ID3,
        data: biometricData,
        ipaddress: (req.ip || "127.0.0.1").replace("::ffff:", ""),
        timestamp,
        is_iris: "NO"
      };
      const result = await twoFactorAuthentication(fullPayload);
      if (result.status) {
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        await storage.setAepsDailyAuth(req.userId, today);
      }
      res.json({ success: result.status, message: result.message, data: result.data });
    } catch (error) {
      console.error("AEPS 2FA auth error:", error);
      res.status(500).json({ error: "2FA authentication failed" });
    }
  });
  app2.post("/api/aeps/transaction", authMiddleware, async (req, res) => {
    try {
      const parsed = aepsTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      const { type, aadhaarNumber, customerMobile, bankIin, bankName, amount, latitude, longitude, fingerprintData, pipe } = parsed.data;
      const user = await storage.getUser(req.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const merchant = await storage.getAepsMerchant(req.userId);
      if (!merchant || merchant.kycStatus !== "COMPLETED") {
        return res.status(403).json({ error: "AEPS merchant onboarding not completed. Please complete KYC first." });
      }
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const todayAuth = await storage.getAepsDailyAuth(req.userId, today);
      if (!todayAuth || !todayAuth.authenticated) {
        return res.status(403).json({ error: "Daily 2FA authentication required. Please authenticate before proceeding." });
      }
      if (!fingerprintData) {
        return res.status(400).json({ error: "Biometric data is required for AEPS transactions." });
      }
      const wallet = await storage.getOrCreateWallet(req.userId);
      const commissionConfigs = await storage.getCommissionConfig();
      const commissionConfig = commissionConfigs.find((c) => c.serviceType === type);
      const commissionAmount = commissionConfig ? commissionConfig.commissionAmount : 0;
      const txAmount = amount || 0;
      const totalDeduction = commissionAmount;
      if (wallet.balance < totalDeduction) {
        return res.status(400).json({
          error: `Insufficient wallet balance. Required: \u20B9${totalDeduction} (Commission: \u20B9${commissionAmount}). Current balance: \u20B9${wallet.balance}`,
          walletBalance: wallet.balance,
          requiredAmount: totalDeduction,
          commissionAmount
        });
      }
      const referenceNo = `AEPS${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const maskedAadhaar = "XXXX-XXXX-" + aadhaarNumber.slice(-4);
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
      const aepsTx = await storage.createAepsTransaction({
        userId: req.userId,
        type,
        aadhaarMasked: maskedAadhaar,
        customerMobile,
        bankName,
        bankIin,
        amount: amount || 0,
        status: "AEPS_PROCESSING",
        referenceNo
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
        submerchantid: merchant.merchantCode || PAYSPRINT_PARTNER_ID3,
        is_iris: "NO"
      };
      let result;
      switch (type) {
        case "BALANCE_ENQUIRY":
          result = await balanceEnquiry(commonParams);
          break;
        case "MINI_STATEMENT":
          result = await miniStatement(commonParams);
          break;
        case "CASH_WITHDRAWAL":
          if (!amount || amount <= 0) {
            await storage.updateAepsTransaction(aepsTx.id, { status: "AEPS_FAILED", message: "Amount is required for cash withdrawal" });
            return res.status(400).json({ error: "Amount is required for cash withdrawal" });
          }
          result = await cashWithdrawal({ ...commonParams, amount });
          break;
        case "AADHAAR_PAY":
          if (!amount || amount <= 0) {
            await storage.updateAepsTransaction(aepsTx.id, { status: "AEPS_FAILED", message: "Amount is required for Aadhaar pay" });
            return res.status(400).json({ error: "Amount is required for Aadhaar pay" });
          }
          result = await aadhaarPay({ ...commonParams, amount });
          break;
        case "CASH_DEPOSIT":
          if (!amount || amount <= 0) {
            await storage.updateAepsTransaction(aepsTx.id, { status: "AEPS_FAILED", message: "Amount is required for cash deposit" });
            return res.status(400).json({ error: "Amount is required for cash deposit" });
          }
          result = await cashDeposit({ ...commonParams, amount });
          break;
        default:
          await storage.updateAepsTransaction(aepsTx.id, { status: "AEPS_FAILED", message: "Invalid transaction type" });
          return res.status(400).json({ error: "Invalid transaction type" });
      }
      const updateData = {};
      let walletDeducted = false;
      if (result.status) {
        updateData.status = "AEPS_SUCCESS";
        updateData.paysprintRefId = result.bankrrn || result.txnid || result.data?.ackno || "";
        if (result.balanceamount) updateData.balance = result.balanceamount;
        if (result.ministatement) updateData.miniStatement = JSON.stringify(result.ministatement);
        updateData.message = result.message;
        if (commissionAmount > 0) {
          const currentWallet = await storage.getOrCreateWallet(req.userId);
          const newBalance = currentWallet.balance - commissionAmount;
          await storage.updateWalletBalance(req.userId, -commissionAmount);
          await storage.createWalletTransaction({
            userId: req.userId,
            type: "COMMISSION",
            amount: commissionAmount,
            balanceBefore: currentWallet.balance,
            balanceAfter: newBalance,
            reference: referenceNo,
            description: `Commission for ${type.replace(/_/g, " ")} - Ref: ${referenceNo}`,
            status: "COMPLETED"
          });
          walletDeducted = true;
        }
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
        walletDeducted,
        commissionCharged: walletDeducted ? commissionAmount : 0
      });
    } catch (error) {
      console.error("AEPS transaction error:", error);
      res.status(500).json({ error: "AEPS transaction failed" });
    }
  });
  const PAYSPRINT_PARTNER_ID3 = process.env.PAYSPRINT_PARTNER_ID || "";
  app2.get("/api/aeps/transactions", authMiddleware, async (req, res) => {
    try {
      const transactions = await storage.getUserAepsTransactions(req.userId);
      res.json({ transactions });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch AEPS transactions" });
    }
  });
  app2.get("/api/admin/merchants", adminAuthMiddleware, async (_req, res) => {
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
  app2.post("/api/admin/merchants", adminAuthMiddleware, async (req, res) => {
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
        const onboardResult = await getOnboardingUrl({
          merchantCode,
          mobile: phoneClean,
          email: "",
          firm: firmName
        });
        if (onboardResult.status && onboardResult.data?.redirecturl) {
          kycRedirectUrl = onboardResult.data.redirecturl;
        }
      } catch (err) {
        console.error("Paysprint onboarding call failed:", err.message);
      }
      const merchant = await storage.createAepsMerchant(user.id, merchantCode, "bank2", {
        phone: phoneClean,
        firmName,
        kycRedirectUrl,
        createdBy: "admin"
      });
      res.json({ success: true, merchant });
    } catch (error) {
      console.error("Failed to create merchant:", error);
      res.status(500).json({ error: "Failed to create merchant" });
    }
  });
  app2.patch("/api/admin/merchants/:id", adminAuthMiddleware, async (req, res) => {
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
  app2.delete("/api/admin/merchants/:id", adminAuthMiddleware, async (req, res) => {
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
  app2.get("/api/wallet", authMiddleware, async (req, res) => {
    try {
      const userId = req.userId;
      const wallet = await storage.getOrCreateWallet(userId);
      const transactions = await storage.getUserWalletTransactions(userId);
      res.json({ wallet, transactions });
    } catch (error) {
      console.error("Failed to fetch wallet:", error);
      res.status(500).json({ error: "Failed to fetch wallet" });
    }
  });
  app2.post("/api/wallet/recharge", authMiddleware, async (req, res) => {
    try {
      const userId = req.userId;
      const { amount, utr } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      if (!utr || !validateUtr(utr)) {
        return res.status(400).json({ error: "Invalid UTR number" });
      }
      const wallet = await storage.getOrCreateWallet(userId);
      const walletTx = await storage.createWalletTransaction({
        userId,
        type: "RECHARGE",
        amount,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance,
        reference: `WR-${Date.now().toString(36).toUpperCase()}`,
        description: `Wallet recharge of \u20B9${amount}`,
        status: "PENDING",
        utr
      });
      res.json({
        success: true,
        transaction: walletTx,
        payeeUpiId: PAYEE_UPI_ID,
        message: "Recharge request submitted. Pending admin approval."
      });
    } catch (error) {
      console.error("Failed to request wallet recharge:", error);
      res.status(500).json({ error: "Failed to request wallet recharge" });
    }
  });
  app2.get("/api/wallet/commission", authMiddleware, async (_req, res) => {
    try {
      const config = await storage.getCommissionConfig();
      res.json({ commission: config });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch commission config" });
    }
  });
  app2.get("/api/admin/wallets", adminAuthMiddleware, async (_req, res) => {
    try {
      const wallets = await storage.getAllWallets();
      const pendingRecharges = await storage.getPendingWalletRecharges();
      res.json({ wallets, pendingRecharges });
    } catch (error) {
      console.error("Failed to fetch wallets:", error);
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });
  app2.post("/api/admin/wallets/:txId/approve", adminAuthMiddleware, async (req, res) => {
    try {
      const { txId } = req.params;
      const { action } = req.body;
      const walletTx = await storage.getWalletTransaction(txId);
      if (!walletTx) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      if (walletTx.status !== "PENDING") {
        return res.status(400).json({ error: "Transaction already processed" });
      }
      if (action === "approve") {
        const wallet = await storage.getOrCreateWallet(walletTx.userId);
        const newBalance = wallet.balance + walletTx.amount;
        await storage.updateWalletBalance(walletTx.userId, walletTx.amount);
        await storage.updateWalletTransaction(txId, { status: "APPROVED", balanceAfter: newBalance });
        res.json({ success: true, message: `Approved \u20B9${walletTx.amount} recharge`, newBalance });
      } else if (action === "reject") {
        await storage.updateWalletTransaction(txId, { status: "REJECTED" });
        res.json({ success: true, message: "Recharge rejected" });
      } else {
        res.status(400).json({ error: "Invalid action. Use 'approve' or 'reject'" });
      }
    } catch (error) {
      console.error("Failed to process wallet recharge:", error);
      res.status(500).json({ error: "Failed to process wallet recharge" });
    }
  });
  app2.post("/api/admin/wallets/:userId/adjust", adminAuthMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const { amount, description } = req.body;
      if (!amount || typeof amount !== "number") {
        return res.status(400).json({ error: "Invalid amount" });
      }
      const wallet = await storage.getOrCreateWallet(userId);
      const newBalance = wallet.balance + amount;
      if (newBalance < 0) {
        return res.status(400).json({ error: "Insufficient balance for this adjustment" });
      }
      await storage.updateWalletBalance(userId, amount);
      await storage.createWalletTransaction({
        userId,
        type: "ADJUSTMENT",
        amount: Math.abs(amount),
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        reference: `ADJ-${Date.now().toString(36).toUpperCase()}`,
        description: description || `Admin adjustment of \u20B9${amount}`,
        status: "COMPLETED"
      });
      res.json({ success: true, newBalance, message: `Balance adjusted by \u20B9${amount}` });
    } catch (error) {
      console.error("Failed to adjust wallet:", error);
      res.status(500).json({ error: "Failed to adjust wallet" });
    }
  });
  app2.get("/api/admin/commission", adminAuthMiddleware, async (_req, res) => {
    try {
      const config = await storage.getCommissionConfig();
      res.json({ commission: config });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch commission config" });
    }
  });
  app2.post("/api/admin/commission", adminAuthMiddleware, async (req, res) => {
    try {
      const { serviceType, commissionAmount, commissionType } = req.body;
      if (!serviceType || commissionAmount === void 0 || !commissionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const config = await storage.updateCommissionConfig(serviceType, commissionAmount, commissionType);
      res.json({ success: true, config });
    } catch (error) {
      console.error("Failed to update commission:", error);
      res.status(500).json({ error: "Failed to update commission" });
    }
  });
  app2.get("/api/admin/aeps-transactions", adminAuthMiddleware, async (_req, res) => {
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
  app2.get("/api/admin/aeps-api-logs", adminAuthMiddleware, async (req, res) => {
    try {
      const endpoint = req.query.endpoint;
      const successParam = req.query.success;
      const fromDate = req.query.fromDate;
      const toDate = req.query.toDate;
      const rawLimit = req.query.limit ? parseInt(req.query.limit) : 50;
      const rawOffset = req.query.offset ? parseInt(req.query.offset) : 0;
      const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
      const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);
      const filters = { limit, offset };
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
  app2.get("/api/admin/server-info", adminAuthMiddleware, async (_req, res) => {
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json");
      const ipData = await ipRes.json();
      let proxyIp = "N/A";
      const proxyUrl = process.env.PAYSPRINT_PROXY_URL || "";
      if (proxyUrl) {
        try {
          const proxyIpRes = await fetch(proxyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: "https://checkip.amazonaws.com", headers: {}, payload: {} })
          });
          const proxyIpData = await proxyIpRes.json();
          proxyIp = proxyIpData.body?.trim() || "unknown";
        } catch {
          proxyIp = "error";
        }
      }
      res.json({
        server_outbound_ip: ipData.ip,
        proxy_outbound_ip: proxyIp,
        proxy_url: proxyUrl || "not configured",
        env: process.env.PAYSPRINT_ENV,
        base_url: process.env.PAYSPRINT_BASE_URL
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to check IP", details: String(error) });
    }
  });
  app2.get("/api/admin/aeps-report", adminAuthMiddleware, async (_req, res) => {
    try {
      const pdfBuffer = await generateAepsReport();
      const filename = `RupyaSetu_AEPS_Report_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("AEPS report generation error:", error);
      res.status(500).json({ error: "Failed to generate AEPS report" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs from "fs";
import * as path from "path";
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    origins.add("https://rupyasetuadmin.site");
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path2 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path2.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  const isDev = process.env.NODE_ENV !== "production";
  const webBuildDir = path.resolve(process.cwd(), "static-build", "web");
  const hasWebBuild = fs.existsSync(path.join(webBuildDir, "index.html"));
  log("Serving static Expo files with dynamic manifest routing");
  log(`Web build available: ${hasWebBuild}, Dev mode: ${isDev}`);
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path === "/admin") {
      const adminPath = path.resolve(process.cwd(), "server", "templates", "admin-panel.html");
      if (fs.existsSync(adminPath)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(fs.readFileSync(adminPath, "utf-8"));
      }
    }
    if (req.path === "/download") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    if (req.path === "/" || req.path === "/manifest") {
      const platform = req.header("expo-platform");
      if (platform && (platform === "ios" || platform === "android")) {
        return serveExpoManifest(platform, res);
      }
    }
    next();
  });
  app2.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app2.use(express.static(path.resolve(process.cwd(), "static-build")));
  if (hasWebBuild) {
    app2.use(express.static(webBuildDir));
  }
  const reservedPaths = ["/api", "/admin", "/download", "/manifest"];
  if (isDev) {
    const { createProxyMiddleware } = __require("http-proxy-middleware");
    const devProxy = createProxyMiddleware({
      target: "http://localhost:8081",
      changeOrigin: true,
      ws: true,
      logLevel: "warn",
      onError: (_err, _req, res) => {
        if (!res.headersSent) {
          res.status(502).send("Expo dev server not ready yet. Please wait...");
        }
      }
    });
    app2.use((req, res, next) => {
      if (reservedPaths.some((p) => req.path === p || req.path.startsWith(p + "/"))) {
        return next();
      }
      return devProxy(req, res, next);
    });
    log("Dev mode: Proxying web requests to Expo dev server on port 8081 (excluding /api, /admin, /download, /manifest)");
  } else if (hasWebBuild) {
    app2.get("*", (req, res, next) => {
      if (reservedPaths.some((p) => req.path === p || req.path.startsWith(p + "/"))) {
        return next();
      }
      const filePath = path.join(webBuildDir, req.path);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return next();
      }
      res.sendFile(path.join(webBuildDir, "index.html"));
    });
    log("Production: Serving web build with SPA fallback");
  }
  log("Expo routing configured");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
