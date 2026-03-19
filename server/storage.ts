import type { User, OtpRecord, Transaction, Operator, Plan, AepsMerchant, AepsDailyAuth, AepsTransaction } from "../shared/schema";
import { randomUUID } from "crypto";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

pool.query("SELECT 1")
  .then(() => console.log("Connected to PostgreSQL successfully"))
  .catch((err) => console.error("PostgreSQL connection error:", err.message));

async function initAepsTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS aeps_merchants (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        merchant_code VARCHAR(64) NOT NULL DEFAULT '',
        kyc_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        bank_pipes TEXT NOT NULL DEFAULT '{}',
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
    console.log("AEPS tables initialized successfully");
  } catch (err: any) {
    console.error("Failed to create AEPS tables:", err.message);
  }
}

initAepsTables();

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(phone: string): Promise<User>;
  createUserWithId(id: string, phone: string): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  saveOtp(record: OtpRecord): Promise<void>;
  getOtp(phone: string): Promise<OtpRecord | undefined>;
  deleteOtp(phone: string): Promise<void>;

  getOperators(type?: string): Promise<Operator[]>;
  getOperator(id: string): Promise<Operator | undefined>;
  getPlans(operatorId: string, category?: string): Promise<Plan[]>;

  createTransaction(tx: Omit<Transaction, "id" | "createdAt" | "updatedAt">): Promise<Transaction>;
  getTransaction(id: string): Promise<Transaction | undefined>;
  updateTransaction(id: string, data: Partial<Transaction>): Promise<Transaction | undefined>;
  getUserTransactions(userId: string): Promise<Transaction[]>;
  getAllTransactions(): Promise<Transaction[]>;
  findTransactionByUtr(utr: string): Promise<Transaction | undefined>;

  getAepsMerchant(userId: string): Promise<AepsMerchant | undefined>;
  createAepsMerchant(userId: string, merchantCode: string, bankPipes: string): Promise<AepsMerchant>;
  updateAepsMerchant(userId: string, data: Partial<AepsMerchant>): Promise<AepsMerchant | undefined>;

  getAepsDailyAuth(userId: string, date: string): Promise<AepsDailyAuth | undefined>;
  setAepsDailyAuth(userId: string, date: string): Promise<AepsDailyAuth>;

  createAepsTransaction(data: Omit<AepsTransaction, "id" | "createdAt" | "updatedAt">): Promise<AepsTransaction>;
  getAepsTransaction(id: string): Promise<AepsTransaction | undefined>;
  updateAepsTransaction(id: string, data: Partial<AepsTransaction>): Promise<AepsTransaction | undefined>;
  getUserAepsTransactions(userId: string): Promise<AepsTransaction[]>;
  getAllAepsTransactions(): Promise<AepsTransaction[]>;
}

const OPERATORS: Operator[] = [
  { id: "jio", name: "Jio", type: "MOBILE", icon: "jio" },
  { id: "airtel", name: "Airtel", type: "MOBILE", icon: "airtel" },
  { id: "vi", name: "Vi (Vodafone Idea)", type: "MOBILE", icon: "vi" },
  { id: "bsnl", name: "BSNL", type: "MOBILE", icon: "bsnl" },
  { id: "tatasky", name: "Tata Play", type: "DTH", icon: "tataplay" },
  { id: "dishtv", name: "Dish TV", type: "DTH", icon: "dishtv" },
  { id: "d2h", name: "D2H", type: "DTH", icon: "d2h" },
  { id: "sundirect", name: "Sun Direct", type: "DTH", icon: "sundirect" },
  { id: "airteldth", name: "Airtel DTH", type: "DTH", icon: "airteldth" },
];

const PLANS: Plan[] = [
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
  { id: "airteldth-2", operatorId: "airteldth", amount: 410, validity: "1 Month", description: "Premium HD", category: "Popular" },
];

function rowToUser(row: any): User {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name || undefined,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

function rowToTransaction(row: any): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    subscriberNumber: row.subscriber_number,
    amount: parseFloat(row.amount),
    planId: row.plan_id || undefined,
    planDescription: row.plan_description || undefined,
    paymentStatus: row.payment_status,
    rechargeStatus: row.recharge_status,
    utr: row.utr || undefined,
    paysprintRefId: row.paysprint_ref_id || undefined,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

function rowToAepsMerchant(row: any): AepsMerchant {
  return {
    id: row.id,
    userId: row.user_id,
    merchantCode: row.merchant_code,
    kycStatus: row.kyc_status,
    bankPipes: row.bank_pipes,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

function rowToAepsDailyAuth(row: any): AepsDailyAuth {
  return {
    id: row.id,
    userId: row.user_id,
    authDate: row.auth_date,
    authenticated: row.authenticated,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

function rowToAepsTransaction(row: any): AepsTransaction {
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
    paysprintRefId: row.paysprint_ref_id || undefined,
    balance: row.balance || undefined,
    miniStatement: row.mini_statement || undefined,
    message: row.message || undefined,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

export class PgStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return result.rows[0] ? rowToUser(result.rows[0]) : undefined;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const result = await pool.query("SELECT * FROM users WHERE phone = $1", [phone]);
    return result.rows[0] ? rowToUser(result.rows[0]) : undefined;
  }

  async createUser(phone: string): Promise<User> {
    const id = randomUUID();
    const result = await pool.query(
      "INSERT INTO users (id, phone) VALUES ($1, $2) RETURNING *",
      [id, phone]
    );
    return rowToUser(result.rows[0]);
  }

  async createUserWithId(id: string, phone: string): Promise<User> {
    const result = await pool.query(
      "INSERT INTO users (id, phone) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING *",
      [id, phone]
    );
    if (result.rows[0]) return rowToUser(result.rows[0]);
    const existing = await this.getUser(id);
    return existing!;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(data.phone);
    }

    if (fields.length === 0) return this.getUser(id);

    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToUser(result.rows[0]) : undefined;
  }

  async saveOtp(record: OtpRecord): Promise<void> {
    await pool.query(
      `INSERT INTO otp_records (phone, otp, expires_at, attempts)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone) DO UPDATE SET otp = $2, expires_at = $3, attempts = $4`,
      [record.phone, record.otp, record.expiresAt, record.attempts]
    );
  }

  async getOtp(phone: string): Promise<OtpRecord | undefined> {
    const result = await pool.query("SELECT * FROM otp_records WHERE phone = $1", [phone]);
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    return {
      phone: row.phone,
      otp: row.otp,
      expiresAt: parseInt(row.expires_at),
      attempts: row.attempts,
    };
  }

  async deleteOtp(phone: string): Promise<void> {
    await pool.query("DELETE FROM otp_records WHERE phone = $1", [phone]);
  }

  async getOperators(type?: string): Promise<Operator[]> {
    if (type) return OPERATORS.filter((o) => o.type === type);
    return OPERATORS;
  }

  async getOperator(id: string): Promise<Operator | undefined> {
    return OPERATORS.find((o) => o.id === id);
  }

  async getPlans(operatorId: string, category?: string): Promise<Plan[]> {
    let plans = PLANS.filter((p) => p.operatorId === operatorId);
    if (category) plans = plans.filter((p) => p.category === category);
    return plans;
  }

  async createTransaction(data: Omit<Transaction, "id" | "createdAt" | "updatedAt">): Promise<Transaction> {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO transactions (id, user_id, type, operator_id, operator_name, subscriber_number, amount, plan_id, plan_description, payment_status, recharge_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [id, data.userId, data.type, data.operatorId, data.operatorName, data.subscriberNumber, data.amount, data.planId || null, data.planDescription || null, data.paymentStatus, data.rechargeStatus]
    );
    return rowToTransaction(result.rows[0]);
  }

  async getTransaction(id: string): Promise<Transaction | undefined> {
    const result = await pool.query("SELECT * FROM transactions WHERE id = $1", [id]);
    return result.rows[0] ? rowToTransaction(result.rows[0]) : undefined;
  }

  async updateTransaction(id: string, data: Partial<Transaction>): Promise<Transaction | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.paymentStatus !== undefined) { fields.push(`payment_status = $${idx++}`); values.push(data.paymentStatus); }
    if (data.rechargeStatus !== undefined) { fields.push(`recharge_status = $${idx++}`); values.push(data.rechargeStatus); }
    if (data.utr !== undefined) { fields.push(`utr = $${idx++}`); values.push(data.utr); }
    if (data.paysprintRefId !== undefined) { fields.push(`paysprint_ref_id = $${idx++}`); values.push(data.paysprintRefId); }

    if (fields.length === 0) return this.getTransaction(id);

    values.push(id);
    const result = await pool.query(
      `UPDATE transactions SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToTransaction(result.rows[0]) : undefined;
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    const result = await pool.query(
      "SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map(rowToTransaction);
  }

  async getAllTransactions(): Promise<Transaction[]> {
    const result = await pool.query("SELECT * FROM transactions ORDER BY created_at DESC");
    return result.rows.map(rowToTransaction);
  }

  async findTransactionByUtr(utr: string): Promise<Transaction | undefined> {
    const result = await pool.query("SELECT * FROM transactions WHERE utr = $1", [utr]);
    return result.rows[0] ? rowToTransaction(result.rows[0]) : undefined;
  }

  async getAepsMerchant(userId: string): Promise<AepsMerchant | undefined> {
    const result = await pool.query("SELECT * FROM aeps_merchants WHERE user_id = $1", [userId]);
    return result.rows[0] ? rowToAepsMerchant(result.rows[0]) : undefined;
  }

  async createAepsMerchant(userId: string, merchantCode: string, bankPipes: string): Promise<AepsMerchant> {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO aeps_merchants (id, user_id, merchant_code, kyc_status, bank_pipes)
       VALUES ($1, $2, $3, 'PENDING', $4) RETURNING *`,
      [id, userId, merchantCode, bankPipes]
    );
    return rowToAepsMerchant(result.rows[0]);
  }

  async updateAepsMerchant(userId: string, data: Partial<AepsMerchant>): Promise<AepsMerchant | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.merchantCode !== undefined) { fields.push(`merchant_code = $${idx++}`); values.push(data.merchantCode); }
    if (data.kycStatus !== undefined) { fields.push(`kyc_status = $${idx++}`); values.push(data.kycStatus); }
    if (data.bankPipes !== undefined) { fields.push(`bank_pipes = $${idx++}`); values.push(data.bankPipes); }

    if (fields.length === 0) return this.getAepsMerchant(userId);

    fields.push(`updated_at = NOW()`);
    values.push(userId);
    const result = await pool.query(
      `UPDATE aeps_merchants SET ${fields.join(", ")} WHERE user_id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToAepsMerchant(result.rows[0]) : undefined;
  }

  async getAepsDailyAuth(userId: string, date: string): Promise<AepsDailyAuth | undefined> {
    const result = await pool.query(
      "SELECT * FROM aeps_daily_auth WHERE user_id = $1 AND auth_date = $2",
      [userId, date]
    );
    return result.rows[0] ? rowToAepsDailyAuth(result.rows[0]) : undefined;
  }

  async setAepsDailyAuth(userId: string, date: string): Promise<AepsDailyAuth> {
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

  async createAepsTransaction(data: Omit<AepsTransaction, "id" | "createdAt" | "updatedAt">): Promise<AepsTransaction> {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO aeps_transactions (id, user_id, type, aadhaar_masked, customer_mobile, bank_name, bank_iin, amount, status, reference_no, paysprint_ref_id, balance, mini_statement, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [id, data.userId, data.type, data.aadhaarMasked, data.customerMobile, data.bankName, data.bankIin, data.amount, data.status, data.referenceNo, data.paysprintRefId || null, data.balance || null, data.miniStatement || null, data.message || null]
    );
    return rowToAepsTransaction(result.rows[0]);
  }

  async getAepsTransaction(id: string): Promise<AepsTransaction | undefined> {
    const result = await pool.query("SELECT * FROM aeps_transactions WHERE id = $1", [id]);
    return result.rows[0] ? rowToAepsTransaction(result.rows[0]) : undefined;
  }

  async updateAepsTransaction(id: string, data: Partial<AepsTransaction>): Promise<AepsTransaction | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.status !== undefined) { fields.push(`status = $${idx++}`); values.push(data.status); }
    if (data.paysprintRefId !== undefined) { fields.push(`paysprint_ref_id = $${idx++}`); values.push(data.paysprintRefId); }
    if (data.balance !== undefined) { fields.push(`balance = $${idx++}`); values.push(data.balance); }
    if (data.miniStatement !== undefined) { fields.push(`mini_statement = $${idx++}`); values.push(data.miniStatement); }
    if (data.message !== undefined) { fields.push(`message = $${idx++}`); values.push(data.message); }

    if (fields.length === 0) return this.getAepsTransaction(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);
    const result = await pool.query(
      `UPDATE aeps_transactions SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToAepsTransaction(result.rows[0]) : undefined;
  }

  async getUserAepsTransactions(userId: string): Promise<AepsTransaction[]> {
    const result = await pool.query(
      "SELECT * FROM aeps_transactions WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map(rowToAepsTransaction);
  }

  async getAllAepsTransactions(): Promise<AepsTransaction[]> {
    const result = await pool.query("SELECT * FROM aeps_transactions ORDER BY created_at DESC");
    return result.rows.map(rowToAepsTransaction);
  }
}

export const storage = new PgStorage();
