import type { User, OtpRecord, Transaction, Operator, Plan } from "../shared/schema";
import { randomUUID } from "crypto";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(phone: string): Promise<User>;
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
}

export const storage = new PgStorage();
