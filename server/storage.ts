import type { User, OtpRecord, Transaction, Operator, Plan, AepsMerchant, AepsDailyAuth, AepsTransaction, AepsApiLog, KycAttempt, VendorWallet, WalletTransaction, CommissionConfig, CommissionWallet, CommissionTransaction, CommissionWithdrawal, CommissionWithdrawalStatus, CommissionWithdrawalMode } from "../shared/schema";
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
        service_charge DECIMAL(12,4),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`);
    await pool.query(`ALTER TABLE aeps_transactions ADD COLUMN IF NOT EXISTS service_charge DECIMAL(12,4)`);
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kyc_attempts (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        merchant_code VARCHAR(64) NOT NULL DEFAULT '',
        step VARCHAR(20) NOT NULL,
        success BOOLEAN NOT NULL DEFAULT FALSE,
        response_code VARCHAR(20) NOT NULL DEFAULT '',
        response_message TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_kyc_attempts_user_id ON kyc_attempts(user_id)
    `);
    const alterQueries = [
      "ALTER TABLE aeps_merchants ADD COLUMN IF NOT EXISTS phone VARCHAR(15) NOT NULL DEFAULT ''",
      "ALTER TABLE aeps_merchants ADD COLUMN IF NOT EXISTS firm_name VARCHAR(100) NOT NULL DEFAULT ''",
      "ALTER TABLE aeps_merchants ADD COLUMN IF NOT EXISTS kyc_redirect_url TEXT",
      "ALTER TABLE aeps_merchants ADD COLUMN IF NOT EXISTS created_by VARCHAR(20) DEFAULT 'self'",
      "ALTER TABLE aeps_merchants ADD COLUMN IF NOT EXISTS two_fa_registered BOOLEAN NOT NULL DEFAULT FALSE",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_aeps_merchants_user_id ON aeps_merchants(user_id)",
      "ALTER TABLE aeps_merchants ADD COLUMN IF NOT EXISTS kyc_otp_reqid VARCHAR(200)",
      "ALTER TABLE aeps_merchants ADD COLUMN IF NOT EXISTS kyc_otp_aadhaar VARCHAR(12)",
      "ALTER TABLE aeps_merchants ADD COLUMN IF NOT EXISTS kyc_otp_expires_at BIGINT",
    ];
    for (const q of alterQueries) {
      try { await pool.query(q); } catch {}
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
        ('BALANCE_ENQUIRY', 0, 'FIXED'),
        ('CASH_WITHDRAWAL', 5, 'FIXED'),
        ('MINI_STATEMENT', 0.50, 'FIXED'),
        ('AADHAAR_PAY', 0.531, 'PERCENTAGE'),
        ('CASH_DEPOSIT', 5, 'FIXED'),
        ('MOBILE_RECHARGE', 1, 'FIXED'),
        ('DTH_RECHARGE', 12, 'FIXED')
      ON CONFLICT (service_type) DO UPDATE SET
        commission_amount = EXCLUDED.commission_amount,
        commission_type = EXCLUDED.commission_type
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_wallets (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL UNIQUE,
        balance DECIMAL(12,2) NOT NULL DEFAULT 0,
        total_earned DECIMAL(12,2) NOT NULL DEFAULT 0,
        total_withdrawn DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_transactions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        type VARCHAR(10) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        balance_before DECIMAL(12,2) NOT NULL DEFAULT 0,
        balance_after DECIMAL(12,2) NOT NULL DEFAULT 0,
        service_type VARCHAR(30) NOT NULL DEFAULT '',
        reference VARCHAR(100) NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_withdrawals (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        mode VARCHAR(10) NOT NULL DEFAULT 'UPI',
        upi_id VARCHAR(100),
        account_number VARCHAR(30),
        ifsc_code VARCHAR(15),
        account_name VARCHAR(100),
        bank_name VARCHAR(100),
        status VARCHAR(15) NOT NULL DEFAULT 'PENDING',
        admin_note TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE commission_withdrawals ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS low_balance_threshold INTEGER`);
    console.log("AEPS tables initialized successfully");
    console.log("Wallet tables initialized successfully");
    console.log("Commission tables initialized successfully");
  } catch (err: any) {
    console.error("Failed to create tables:", err.message);
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

  getTransactionByReference(refId: string): Promise<Transaction | undefined>;
  getAepsMerchant(userId: string): Promise<AepsMerchant | undefined>;
  getAepsMerchantByPhone(phone: string): Promise<AepsMerchant | undefined>;
  getAepsMerchantById(id: string): Promise<AepsMerchant | undefined>;
  getAepsMerchantByCode(merchantCode: string): Promise<AepsMerchant | undefined>;
  getAllAepsMerchants(): Promise<AepsMerchant[]>;
  getAllFailedMerchants(): Promise<AepsMerchant[]>;
  createAepsMerchant(userId: string, merchantCode: string, bankPipes: string, extra?: { phone?: string; firmName?: string; kycRedirectUrl?: string; createdBy?: string }): Promise<AepsMerchant>;
  updateAepsMerchant(userId: string, data: Partial<AepsMerchant>): Promise<AepsMerchant | undefined>;
  deleteAepsMerchant(id: string): Promise<boolean>;

  getAepsDailyAuth(userId: string, date: string): Promise<AepsDailyAuth | undefined>;
  setAepsDailyAuth(userId: string, date: string): Promise<AepsDailyAuth>;

  createAepsTransaction(data: Omit<AepsTransaction, "id" | "createdAt" | "updatedAt">): Promise<AepsTransaction>;
  getAepsTransaction(id: string): Promise<AepsTransaction | undefined>;
  updateAepsTransaction(id: string, data: Partial<AepsTransaction>): Promise<AepsTransaction | undefined>;
  getUserAepsTransactions(userId: string): Promise<AepsTransaction[]>;
  getAllAepsTransactions(): Promise<AepsTransaction[]>;

  createAepsApiLog(data: Omit<AepsApiLog, "id" | "createdAt">): Promise<AepsApiLog>;
  getAepsApiLogs(filters?: { endpoint?: string; success?: boolean; fromDate?: string; toDate?: string; limit?: number; offset?: number }): Promise<{ logs: AepsApiLog[]; total: number }>;

  insertKycAttempt(data: Omit<KycAttempt, "id" | "createdAt">): Promise<KycAttempt>;
  getKycAttempts(userId: string, limit?: number): Promise<KycAttempt[]>;
  getAllMerchantKycAttempts(merchantCode: string, limit?: number): Promise<KycAttempt[]>;

  saveKycOtpSession(userId: string, otpreqid: string, aadhaarNumber: string, expiresAt: number): Promise<void>;
  getKycOtpSession(userId: string): Promise<{ otpreqid: string; aadhaarNumber: string; expiresAt: number } | undefined>;
  deleteKycOtpSession(userId: string): Promise<void>;

  getWallet(userId: string): Promise<VendorWallet | undefined>;
  getOrCreateWallet(userId: string): Promise<VendorWallet>;
  getAllWallets(): Promise<(VendorWallet & { phone?: string; name?: string })[]>;
  updateWalletBalance(userId: string, amount: number): Promise<VendorWallet>;
  createWalletTransaction(data: Omit<WalletTransaction, "id" | "createdAt">): Promise<WalletTransaction>;
  getWalletTransaction(id: string): Promise<WalletTransaction | undefined>;
  updateWalletTransaction(id: string, data: Partial<WalletTransaction>): Promise<WalletTransaction | undefined>;
  getUserWalletTransactions(userId: string): Promise<WalletTransaction[]>;
  getPendingWalletRecharges(): Promise<(WalletTransaction & { phone?: string })[]>;
  getCommissionConfig(): Promise<CommissionConfig[]>;
  updateCommissionConfig(serviceType: string, amount: number, type: "FIXED" | "PERCENTAGE"): Promise<CommissionConfig>;

  getCommissionWallet(userId: string): Promise<CommissionWallet | undefined>;
  getOrCreateCommissionWallet(userId: string): Promise<CommissionWallet>;
  hasCommissionCredit(reference: string, serviceType: string): Promise<boolean>;
  creditCommission(userId: string, amount: number, serviceType: string, reference: string, description: string): Promise<CommissionTransaction>;
  getUserCommissionTransactions(userId: string): Promise<CommissionTransaction[]>;
  createCommissionWithdrawal(data: Omit<CommissionWithdrawal, "id" | "createdAt" | "updatedAt">): Promise<CommissionWithdrawal>;
  getCommissionWithdrawal(id: string): Promise<CommissionWithdrawal | undefined>;
  updateCommissionWithdrawal(id: string, data: { status: CommissionWithdrawalStatus; adminNote?: string }): Promise<CommissionWithdrawal | undefined>;
  getUserCommissionWithdrawals(userId: string): Promise<CommissionWithdrawal[]>;
  getAllCommissionWithdrawals(): Promise<(CommissionWithdrawal & { phone?: string; name?: string })[]>;
  getPendingCommissionWithdrawals(): Promise<(CommissionWithdrawal & { phone?: string; name?: string })[]>;
  refundCommissionWithdrawal(withdrawalId: string, userId: string, amount: number): Promise<void>;
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
    lowBalanceThreshold: row.low_balance_threshold != null ? parseInt(row.low_balance_threshold, 10) : undefined,
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
    phone: row.phone || '',
    firmName: row.firm_name || '',
    kycStatus: row.kyc_status,
    bankPipes: row.bank_pipes,
    kycRedirectUrl: row.kyc_redirect_url || undefined,
    createdBy: row.created_by || 'self',
    twoFaRegistered: row.two_fa_registered || false,
    kycOtpReqid: row.kyc_otp_reqid || undefined,
    kycOtpAadhaar: row.kyc_otp_aadhaar || undefined,
    kycOtpExpiresAt: row.kyc_otp_expires_at != null ? Number(row.kyc_otp_expires_at) : undefined,
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
    serviceCharge: row.service_charge != null ? parseFloat(row.service_charge) : undefined,
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
    if (data.lowBalanceThreshold !== undefined) {
      fields.push(`low_balance_threshold = $${idx++}`);
      values.push(data.lowBalanceThreshold);
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

  async getTransactionByReference(refId: string): Promise<Transaction | undefined> {
    const result = await pool.query(
      "SELECT * FROM transactions WHERE paysprint_ref_id = $1 OR id = $1 LIMIT 1",
      [refId]
    );
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

  async getAepsMerchantByPhone(phone: string): Promise<AepsMerchant | undefined> {
    const result = await pool.query("SELECT * FROM aeps_merchants WHERE phone = $1", [phone]);
    return result.rows[0] ? rowToAepsMerchant(result.rows[0]) : undefined;
  }

  async getAepsMerchantById(id: string): Promise<AepsMerchant | undefined> {
    const result = await pool.query("SELECT * FROM aeps_merchants WHERE id = $1", [id]);
    return result.rows[0] ? rowToAepsMerchant(result.rows[0]) : undefined;
  }

  async getAepsMerchantByCode(merchantCode: string): Promise<AepsMerchant | undefined> {
    const result = await pool.query("SELECT * FROM aeps_merchants WHERE merchant_code = $1 LIMIT 1", [merchantCode]);
    return result.rows[0] ? rowToAepsMerchant(result.rows[0]) : undefined;
  }

  async getAllAepsMerchants(): Promise<AepsMerchant[]> {
    const result = await pool.query("SELECT * FROM aeps_merchants ORDER BY created_at DESC");
    return result.rows.map(rowToAepsMerchant);
  }

  async getAllFailedMerchants(): Promise<AepsMerchant[]> {
    const result = await pool.query(
      "SELECT * FROM aeps_merchants WHERE kyc_status = 'FAILED' AND (kyc_redirect_url IS NULL OR kyc_redirect_url = '') ORDER BY created_at ASC"
    );
    return result.rows.map(rowToAepsMerchant);
  }

  async createAepsMerchant(userId: string, merchantCode: string, bankPipes: string, extra?: { phone?: string; firmName?: string; kycRedirectUrl?: string; createdBy?: string }): Promise<AepsMerchant> {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO aeps_merchants (id, user_id, merchant_code, phone, firm_name, kyc_status, bank_pipes, kyc_redirect_url, created_by)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8) RETURNING *`,
      [id, userId, merchantCode, extra?.phone || '', extra?.firmName || '', bankPipes, extra?.kycRedirectUrl || null, extra?.createdBy || 'self']
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
    if (data.phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(data.phone); }
    if (data.firmName !== undefined) { fields.push(`firm_name = $${idx++}`); values.push(data.firmName); }
    if (data.kycRedirectUrl !== undefined) { fields.push(`kyc_redirect_url = $${idx++}`); values.push(data.kycRedirectUrl); }
    if ((data as any).twoFaRegistered !== undefined) { fields.push(`two_fa_registered = $${idx++}`); values.push((data as any).twoFaRegistered); }

    if (fields.length === 0) return this.getAepsMerchant(userId);

    fields.push(`updated_at = NOW()`);
    values.push(userId);
    const result = await pool.query(
      `UPDATE aeps_merchants SET ${fields.join(", ")} WHERE user_id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToAepsMerchant(result.rows[0]) : undefined;
  }

  async deleteAepsMerchant(id: string): Promise<boolean> {
    const result = await pool.query("DELETE FROM aeps_merchants WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
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
      `INSERT INTO aeps_transactions (id, user_id, type, aadhaar_masked, customer_mobile, bank_name, bank_iin, amount, status, reference_no, paysprint_ref_id, balance, mini_statement, message, service_charge)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [id, data.userId, data.type, data.aadhaarMasked, data.customerMobile, data.bankName, data.bankIin, data.amount, data.status, data.referenceNo, data.paysprintRefId || null, data.balance || null, data.miniStatement || null, data.message || null, data.serviceCharge ?? null]
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
    if (data.serviceCharge !== undefined) { fields.push(`service_charge = $${idx++}`); values.push(data.serviceCharge); }

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

  async createAepsApiLog(data: Omit<AepsApiLog, "id" | "createdAt">): Promise<AepsApiLog> {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO aeps_api_logs (id, endpoint, method, request_payload, response_body, http_status, success, duration_ms, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, data.endpoint, data.method, data.requestPayload, data.responseBody, data.httpStatus, data.success, data.durationMs, data.errorMessage || null]
    );
    return rowToAepsApiLog(result.rows[0]);
  }

  async getAepsApiLogs(filters?: { endpoint?: string; success?: boolean; fromDate?: string; toDate?: string; limit?: number; offset?: number }): Promise<{ logs: AepsApiLog[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (filters?.endpoint) {
      conditions.push(`endpoint LIKE $${idx++}`);
      values.push(`%${filters.endpoint}%`);
    }
    if (filters?.success !== undefined) {
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

  async insertKycAttempt(data: Omit<KycAttempt, "id" | "createdAt">): Promise<KycAttempt> {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO kyc_attempts (id, user_id, merchant_code, step, success, response_code, response_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, data.userId, data.merchantCode, data.step, data.success, data.responseCode, data.responseMessage]
    );
    return rowToKycAttempt(result.rows[0]);
  }

  async getKycAttempts(userId: string, limit = 50): Promise<KycAttempt[]> {
    const result = await pool.query(
      `SELECT * FROM kyc_attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(rowToKycAttempt);
  }

  async getAllMerchantKycAttempts(merchantCode: string, limit = 100): Promise<KycAttempt[]> {
    const result = await pool.query(
      `SELECT * FROM kyc_attempts WHERE merchant_code = $1 ORDER BY created_at DESC LIMIT $2`,
      [merchantCode, limit]
    );
    return result.rows.map(rowToKycAttempt);
  }

  async saveKycOtpSession(userId: string, otpreqid: string, aadhaarNumber: string, expiresAt: number): Promise<void> {
    await pool.query(
      `UPDATE aeps_merchants SET kyc_otp_reqid = $1, kyc_otp_aadhaar = $2, kyc_otp_expires_at = $3, updated_at = NOW() WHERE user_id = $4`,
      [otpreqid, aadhaarNumber, expiresAt, userId]
    );
  }

  async getKycOtpSession(userId: string): Promise<{ otpreqid: string; aadhaarNumber: string; expiresAt: number } | undefined> {
    const result = await pool.query(
      `SELECT kyc_otp_reqid, kyc_otp_aadhaar, kyc_otp_expires_at FROM aeps_merchants WHERE user_id = $1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row || !row.kyc_otp_reqid || !row.kyc_otp_expires_at) return undefined;
    const expiresAt = Number(row.kyc_otp_expires_at);
    if (Date.now() > expiresAt) {
      await this.deleteKycOtpSession(userId);
      return undefined;
    }
    return {
      otpreqid: row.kyc_otp_reqid,
      aadhaarNumber: row.kyc_otp_aadhaar || '',
      expiresAt,
    };
  }

  async deleteKycOtpSession(userId: string): Promise<void> {
    await pool.query(
      `UPDATE aeps_merchants SET kyc_otp_reqid = NULL, kyc_otp_aadhaar = NULL, kyc_otp_expires_at = NULL, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );
  }

  async getWallet(userId: string): Promise<VendorWallet | undefined> {
    const result = await pool.query("SELECT * FROM vendor_wallets WHERE user_id = $1", [userId]);
    return result.rows[0] ? rowToWallet(result.rows[0]) : undefined;
  }

  async getOrCreateWallet(userId: string): Promise<VendorWallet> {
    const existing = await this.getWallet(userId);
    if (existing) return existing;
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO vendor_wallets (id, user_id, balance) VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO NOTHING RETURNING *`,
      [id, userId]
    );
    if (result.rows[0]) return rowToWallet(result.rows[0]);
    return (await this.getWallet(userId))!;
  }

  async getAllWallets(): Promise<(VendorWallet & { phone?: string; name?: string })[]> {
    const result = await pool.query(
      `SELECT w.*, u.phone, u.name FROM vendor_wallets w
       LEFT JOIN users u ON w.user_id = u.id
       ORDER BY w.updated_at DESC`
    );
    return result.rows.map((row: any) => ({
      ...rowToWallet(row),
      phone: row.phone || undefined,
      name: row.name || undefined,
    }));
  }

  async updateWalletBalance(userId: string, amount: number): Promise<VendorWallet> {
    const result = await pool.query(
      `UPDATE vendor_wallets SET balance = balance + $1, updated_at = NOW()
       WHERE user_id = $2 RETURNING *`,
      [amount, userId]
    );
    return rowToWallet(result.rows[0]);
  }

  async createWalletTransaction(data: Omit<WalletTransaction, "id" | "createdAt">): Promise<WalletTransaction> {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_before, balance_after, reference, description, status, utr)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, data.userId, data.type, data.amount, data.balanceBefore, data.balanceAfter, data.reference, data.description, data.status, data.utr || null]
    );
    return rowToWalletTransaction(result.rows[0]);
  }

  async getWalletTransaction(id: string): Promise<WalletTransaction | undefined> {
    const result = await pool.query("SELECT * FROM wallet_transactions WHERE id = $1", [id]);
    return result.rows[0] ? rowToWalletTransaction(result.rows[0]) : undefined;
  }

  async updateWalletTransaction(id: string, data: Partial<WalletTransaction>): Promise<WalletTransaction | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (data.status !== undefined) { fields.push(`status = $${idx++}`); values.push(data.status); }
    if (data.balanceAfter !== undefined) { fields.push(`balance_after = $${idx++}`); values.push(data.balanceAfter); }
    if (data.utr !== undefined) { fields.push(`utr = $${idx++}`); values.push(data.utr); }
    if (fields.length === 0) return this.getWalletTransaction(id);
    values.push(id);
    const result = await pool.query(
      `UPDATE wallet_transactions SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToWalletTransaction(result.rows[0]) : undefined;
  }

  async getUserWalletTransactions(userId: string): Promise<WalletTransaction[]> {
    const result = await pool.query(
      "SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map(rowToWalletTransaction);
  }

  async getPendingWalletRecharges(): Promise<(WalletTransaction & { phone?: string })[]> {
    const result = await pool.query(
      `SELECT wt.*, u.phone FROM wallet_transactions wt
       LEFT JOIN users u ON wt.user_id = u.id
       WHERE wt.type = 'RECHARGE' AND wt.status = 'PENDING'
       ORDER BY wt.created_at DESC`
    );
    return result.rows.map((row: any) => ({
      ...rowToWalletTransaction(row),
      phone: row.phone || undefined,
    }));
  }

  async getCommissionConfig(): Promise<CommissionConfig[]> {
    const result = await pool.query("SELECT * FROM wallet_commission_config ORDER BY service_type");
    return result.rows.map(rowToCommissionConfig);
  }

  async updateCommissionConfig(serviceType: string, amount: number, type: "FIXED" | "PERCENTAGE"): Promise<CommissionConfig> {
    const result = await pool.query(
      `INSERT INTO wallet_commission_config (service_type, commission_amount, commission_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (service_type) DO UPDATE SET commission_amount = $2, commission_type = $3
       RETURNING *`,
      [serviceType, amount, type]
    );
    return rowToCommissionConfig(result.rows[0]);
  }

  async getCommissionWallet(userId: string): Promise<CommissionWallet | undefined> {
    const result = await pool.query("SELECT * FROM commission_wallets WHERE user_id = $1", [userId]);
    return result.rows[0] ? rowToCommissionWallet(result.rows[0]) : undefined;
  }

  async getOrCreateCommissionWallet(userId: string): Promise<CommissionWallet> {
    const existing = await this.getCommissionWallet(userId);
    if (existing) return existing;
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO commission_wallets (id, user_id, balance, total_earned, total_withdrawn)
       VALUES ($1, $2, 0, 0, 0)
       ON CONFLICT (user_id) DO NOTHING RETURNING *`,
      [id, userId]
    );
    if (result.rows[0]) return rowToCommissionWallet(result.rows[0]);
    return (await this.getCommissionWallet(userId))!;
  }

  async hasCommissionCredit(reference: string, serviceType: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT id FROM commission_transactions WHERE reference = $1 AND service_type = $2 AND type = 'CREDIT' LIMIT 1`,
      [reference, serviceType]
    );
    return result.rows.length > 0;
  }

  async creditCommission(userId: string, amount: number, serviceType: string, reference: string, description: string): Promise<CommissionTransaction> {
    const wallet = await this.getOrCreateCommissionWallet(userId);
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;
    await pool.query(
      `UPDATE commission_wallets SET balance = balance + $1, total_earned = total_earned + $1, updated_at = NOW() WHERE user_id = $2`,
      [amount, userId]
    );
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO commission_transactions (id, user_id, type, amount, balance_before, balance_after, service_type, reference, description)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, userId, amount, balanceBefore, balanceAfter, serviceType, reference, description]
    );
    return rowToCommissionTransaction(result.rows[0]);
  }

  async getUserCommissionTransactions(userId: string): Promise<CommissionTransaction[]> {
    const result = await pool.query(
      "SELECT * FROM commission_transactions WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map(rowToCommissionTransaction);
  }

  async createCommissionWithdrawal(data: Omit<CommissionWithdrawal, "id" | "createdAt" | "updatedAt">): Promise<CommissionWithdrawal> {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO commission_withdrawals (id, user_id, amount, mode, upi_id, account_number, ifsc_code, account_name, bank_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, data.userId, data.amount, data.mode, data.upiId || null, data.accountNumber || null, data.ifscCode || null, data.accountName || null, data.bankName || null, data.status || "PENDING"]
    );
    await pool.query(
      `UPDATE commission_wallets SET balance = balance - $1, total_withdrawn = total_withdrawn + $1, updated_at = NOW() WHERE user_id = $2`,
      [data.amount, data.userId]
    );
    const wallet = await this.getOrCreateCommissionWallet(data.userId);
    const balanceBefore = wallet.balance + data.amount;
    const txId = randomUUID();
    await pool.query(
      `INSERT INTO commission_transactions (id, user_id, type, amount, balance_before, balance_after, service_type, reference, description)
       VALUES ($1, $2, 'DEBIT', $3, $4, $5, 'WITHDRAWAL', $6, $7)`,
      [txId, data.userId, data.amount, balanceBefore, wallet.balance, result.rows[0].id, `Withdrawal request via ${data.mode}`]
    );
    return rowToCommissionWithdrawal(result.rows[0]);
  }

  async getCommissionWithdrawal(id: string): Promise<CommissionWithdrawal | undefined> {
    const result = await pool.query("SELECT * FROM commission_withdrawals WHERE id = $1", [id]);
    return result.rows[0] ? rowToCommissionWithdrawal(result.rows[0]) : undefined;
  }

  async updateCommissionWithdrawal(id: string, data: { status: CommissionWithdrawalStatus; adminNote?: string }): Promise<CommissionWithdrawal | undefined> {
    const result = await pool.query(
      `UPDATE commission_withdrawals SET status = $1, admin_note = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [data.status, data.adminNote || null, id]
    );
    return result.rows[0] ? rowToCommissionWithdrawal(result.rows[0]) : undefined;
  }

  async getUserCommissionWithdrawals(userId: string): Promise<CommissionWithdrawal[]> {
    const result = await pool.query(
      "SELECT * FROM commission_withdrawals WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map(rowToCommissionWithdrawal);
  }

  async getAllCommissionWithdrawals(): Promise<(CommissionWithdrawal & { phone?: string; name?: string })[]> {
    const result = await pool.query(
      `SELECT cw.*, u.phone, u.name FROM commission_withdrawals cw
       LEFT JOIN users u ON cw.user_id = u.id
       ORDER BY cw.created_at DESC`
    );
    return result.rows.map((row: any) => ({
      ...rowToCommissionWithdrawal(row),
      phone: row.phone || undefined,
      name: row.name || undefined,
    }));
  }

  async getPendingCommissionWithdrawals(): Promise<(CommissionWithdrawal & { phone?: string; name?: string })[]> {
    const result = await pool.query(
      `SELECT cw.*, u.phone, u.name FROM commission_withdrawals cw
       LEFT JOIN users u ON cw.user_id = u.id
       WHERE cw.status = 'PENDING'
       ORDER BY cw.created_at DESC`
    );
    return result.rows.map((row: any) => ({
      ...rowToCommissionWithdrawal(row),
      phone: row.phone || undefined,
      name: row.name || undefined,
    }));
  }

  async refundCommissionWithdrawal(withdrawalId: string, userId: string, amount: number): Promise<void> {
    const wallet = await this.getOrCreateCommissionWallet(userId);
    const balanceBefore = wallet.balance;
    await pool.query(
      `UPDATE commission_wallets SET balance = balance + $1, total_withdrawn = GREATEST(total_withdrawn - $1, 0), updated_at = NOW() WHERE user_id = $2`,
      [amount, userId]
    );
    const walletAfter = await this.getCommissionWallet(userId);
    const id = randomUUID();
    await pool.query(
      `INSERT INTO commission_transactions (id, user_id, type, amount, balance_before, balance_after, service_type, reference, description)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5, 'WITHDRAWAL_REFUND', $6, 'Withdrawal rejected - amount refunded')`,
      [id, userId, amount, balanceBefore, walletAfter?.balance || balanceBefore + amount, withdrawalId]
    );
  }
}

function rowToWallet(row: any): VendorWallet {
  return {
    id: row.id,
    userId: row.user_id,
    balance: parseFloat(row.balance),
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

function rowToWalletTransaction(row: any): WalletTransaction {
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
    utr: row.utr || undefined,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

function rowToCommissionConfig(row: any): CommissionConfig {
  return {
    serviceType: row.service_type,
    commissionAmount: parseFloat(row.commission_amount),
    commissionType: row.commission_type,
  };
}

function rowToCommissionWallet(row: any): CommissionWallet {
  return {
    id: row.id,
    userId: row.user_id,
    balance: parseFloat(row.balance),
    totalEarned: parseFloat(row.total_earned),
    totalWithdrawn: parseFloat(row.total_withdrawn),
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

function rowToCommissionTransaction(row: any): CommissionTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: parseFloat(row.amount),
    balanceBefore: parseFloat(row.balance_before),
    balanceAfter: parseFloat(row.balance_after),
    serviceType: row.service_type,
    reference: row.reference,
    description: row.description,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

function rowToCommissionWithdrawal(row: any): CommissionWithdrawal {
  return {
    id: row.id,
    userId: row.user_id,
    amount: parseFloat(row.amount),
    mode: row.mode,
    upiId: row.upi_id || undefined,
    accountNumber: row.account_number || undefined,
    ifscCode: row.ifsc_code || undefined,
    accountName: row.account_name || undefined,
    bankName: row.bank_name || undefined,
    status: row.status,
    adminNote: row.admin_note || undefined,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

function rowToAepsApiLog(row: any): AepsApiLog {
  return {
    id: row.id,
    endpoint: row.endpoint,
    method: row.method,
    requestPayload: row.request_payload,
    responseBody: row.response_body,
    httpStatus: row.http_status,
    success: row.success,
    durationMs: row.duration_ms,
    errorMessage: row.error_message || undefined,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

function rowToKycAttempt(row: any): KycAttempt {
  return {
    id: row.id,
    userId: row.user_id,
    merchantCode: row.merchant_code,
    step: row.step,
    success: row.success,
    responseCode: row.response_code,
    responseMessage: row.response_message,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

export const storage = new PgStorage();
