import PDFDocument from "pdfkit";
import { storage } from "../storage";
import * as aepsService from "./aeps";

const GREEN = "#2E9E5B";
const DARK_GREEN = "#1E6F44";
const LIGHT_GREEN = "#E8F5E9";
const DARK_TEXT = "#1a1a1a";
const GRAY_TEXT = "#666666";
const LIGHT_GRAY = "#f5f5f5";

const PDF_REDACT_KEYS = new Set([
  "mobilenumber", "mobile", "ipaddress", "ip", "submerchantid",
  "merchantcode", "email", "callback", "firm",
  "adhaarnumber", "aadhaar", "aadhar", "aadharnumber",
  "piddata", "pid", "biometric", "biometricdata",
  "hmac", "skey", "ci", "sessionkey", "data",
  "partnerid", "reqid", "timestamp",
]);

function redactForPdf(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return obj
      .replace(/\b\d{12}\b/g, (m) => "XXXX-XXXX-" + m.slice(-4))
      .replace(/\b[6-9]\d{9}\b/g, "XXXXXX" + "XXXX")
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "XXX.XXX.XXX.XXX");
  }
  if (Array.isArray(obj)) return obj.map(redactForPdf);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
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

interface ReportData {
  bankListResponse: any;
  txnStatusResponse: any;
  apiLogs: any[];
  totalLogs: number;
  generatedAt: string;
}

async function gatherReportData(): Promise<ReportData> {
  const generatedAt = new Date().toISOString();

  let bankListResponse: any = null;
  try {
    bankListResponse = await aepsService.getAepsBankList();
  } catch (err: any) {
    bankListResponse = { error: err.message, status: false };
  }

  let txnStatusResponse: any = null;
  try {
    txnStatusResponse = await aepsService.checkAepsTransactionStatus({
      referenceno: `REPORT_TEST_${Date.now()}`,
    });
  } catch (err: any) {
    txnStatusResponse = { error: err.message, status: false };
  }

  const logsResult = await storage.getAepsApiLogs({ limit: 200, offset: 0 });

  return {
    bankListResponse,
    txnStatusResponse,
    apiLogs: logsResult.logs,
    totalLogs: logsResult.total,
    generatedAt,
  };
}

function drawHeader(doc: PDFKit.PDFDocument, y: number): number {
  doc.rect(0, y, doc.page.width, 80).fill(GREEN);
  doc.fontSize(28).font("Helvetica-Bold").fillColor("#FFFFFF")
    .text("RupyaSetu", 50, y + 15, { width: doc.page.width - 100 });
  doc.fontSize(12).font("Helvetica").fillColor("#FFFFFF")
    .text("AEPS API Integration Report", 50, y + 48, { width: doc.page.width - 100 });
  return y + 80;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  if (y > doc.page.height - 100) {
    doc.addPage();
    y = 50;
  }
  doc.rect(50, y, doc.page.width - 100, 30).fill(DARK_GREEN);
  doc.fontSize(13).font("Helvetica-Bold").fillColor("#FFFFFF")
    .text(title, 60, y + 8, { width: doc.page.width - 120 });
  return y + 40;
}

function drawKeyValue(doc: PDFKit.PDFDocument, key: string, value: string, x: number, y: number, maxWidth: number): number {
  if (y > doc.page.height - 60) {
    doc.addPage();
    y = 50;
  }
  doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK_TEXT)
    .text(key + ":", x, y, { width: 160, continued: false });
  doc.fontSize(10).font("Helvetica").fillColor(GRAY_TEXT)
    .text(value, x + 165, y, { width: maxWidth - 165 });
  const textHeight = doc.heightOfString(value, { width: maxWidth - 165 });
  return y + Math.max(textHeight, 14) + 4;
}

function drawTableRow(doc: PDFKit.PDFDocument, cols: string[], widths: number[], x: number, y: number, isHeader: boolean): number {
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
    doc.fontSize(isHeader ? 9 : 8)
      .font(isHeader ? "Helvetica-Bold" : "Helvetica")
      .fillColor(isHeader ? DARK_GREEN : DARK_TEXT)
      .text(cols[i] || "", cx + 4, y + 5, { width: widths[i] - 8, ellipsis: true, lineBreak: false });
    cx += widths[i];
  }
  if (!isHeader) {
    doc.moveTo(x, y + rowHeight).lineTo(x + widths.reduce((a, b) => a + b, 0), y + rowHeight)
      .strokeColor("#e0e0e0").lineWidth(0.5).stroke();
  }
  return y + rowHeight;
}

function drawJsonBlock(doc: PDFKit.PDFDocument, json: unknown, x: number, y: number, maxWidth: number, maxLines: number = 30): number {
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
  doc.fontSize(7).font("Courier").fillColor("#00ff88")
    .text(content, x + 10, y + 8, { width: maxWidth - 20, height: 290 });

  return y + Math.min(blockHeight, 300) + 8;
}

export async function generateAepsReport(): Promise<Buffer> {
  const data = await gatherReportData();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
      info: {
        Title: "RupyaSetu AEPS API Integration Report",
        Author: "RupyaSetu Admin",
        Subject: "AEPS Paysprint API Response Logs",
        Creator: "RupyaSetu Report Generator",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = 0;

    // === COVER PAGE ===
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(GREEN);
    doc.rect(0, 0, doc.page.width, doc.page.height)
      .fillOpacity(0.1).fill("#000000");
    doc.fillOpacity(1);

    doc.fontSize(42).font("Helvetica-Bold").fillColor("#FFFFFF")
      .text("RupyaSetu", 0, 200, { align: "center", width: doc.page.width });
    doc.fontSize(18).font("Helvetica").fillColor("#FFFFFF")
      .text("AEPS API Integration Report", 0, 260, { align: "center", width: doc.page.width });

    doc.moveTo(doc.page.width / 2 - 80, 300).lineTo(doc.page.width / 2 + 80, 300)
      .strokeColor("#FFFFFF").lineWidth(2).stroke();

    doc.fontSize(12).font("Helvetica").fillColor("#FFFFFF")
      .text("Prepared for: Paysprint Integration Team", 0, 330, { align: "center", width: doc.page.width });
    doc.fontSize(11).font("Helvetica").fillColor("#FFFFFF")
      .text(`Generated: ${new Date(data.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, 0, 355, { align: "center", width: doc.page.width });
    const jwtConfigured = !!(process.env.PAYSPRINT_JWT_TOKEN);
    const envLabel = jwtConfigured
      ? `Environment: ${process.env.PAYSPRINT_ENV || "PRODUCTION"} (LIVE API)`
      : "Environment: SIMULATION MODE (JWT not configured)";
    doc.fontSize(11).font("Helvetica").fillColor("#FFFFFF")
      .text(envLabel, 0, 380, { align: "center", width: doc.page.width });
    doc.fontSize(11).font("Helvetica").fillColor("#FFFFFF")
      .text(`Total API Calls Logged: ${data.totalLogs}`, 0, 405, { align: "center", width: doc.page.width });

    doc.fontSize(10).font("Helvetica").fillColor("#FFFFFF")
      .text("Confidential - For Internal Use Only", 0, 700, { align: "center", width: doc.page.width });

    // === PAGE 2: SUMMARY ===
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

    // === ENDPOINTS DOCUMENTATION ===
    y = drawSectionTitle(doc, "2. AEPS Endpoints Implemented", y);

    const endpoints = [
      { path: "/service/aeps/banklist/index", desc: "Fetch supported bank list for AEPS", biometric: "No" },
      { path: "/service/aeps/balanceenquiry/index", desc: "Check Aadhaar-linked bank balance", biometric: "Yes" },
      { path: "/service/aeps/ministatement/index", desc: "Fetch mini statement", biometric: "Yes" },
      { path: "/service/aeps/v3/cashwithdraw/index", desc: "Cash withdrawal via AEPS", biometric: "Yes" },
      { path: "/service/aeps/aadharpay/index", desc: "Aadhaar Pay transaction", biometric: "Yes" },
      { path: "/service/aeps/cashdeposit/index", desc: "Cash deposit via AEPS", biometric: "Yes" },
      { path: "/service/aeps/cashwithdraw/status", desc: "Check transaction status", biometric: "No" },
      { path: "/service/aeps/kyc/Twofactorkyc/registration", desc: "2FA KYC registration", biometric: "Yes" },
      { path: "/service/aeps/kyc/Twofactorkyc/authentication", desc: "2FA daily authentication", biometric: "Yes" },
      { path: "/service/onboard/onboard/getonboardurl", desc: "Merchant onboarding URL", biometric: "No" },
    ];

    const epWidths = [200, 200, 55];
    y = drawTableRow(doc, ["Endpoint Path", "Description", "Biometric"], epWidths, 50, y, true);
    for (const ep of endpoints) {
      y = drawTableRow(doc, [ep.path, ep.desc, ep.biometric], epWidths, 50, y, false);
    }
    y += 15;

    // === LIVE API CALL: BANK LIST ===
    y = drawSectionTitle(doc, "3. Live API Call — Bank List", y);
    y = drawKeyValue(doc, "Endpoint", "/service/aeps/banklist/index", 50, y, 450);
    y = drawKeyValue(doc, "Method", "POST", 50, y, 450);
    y = drawKeyValue(doc, "Status", data.bankListResponse?.status ? "SUCCESS" : "FAILED", 50, y, 450);
    y = drawKeyValue(doc, "Response Code", String(data.bankListResponse?.response_code ?? "N/A"), 50, y, 450);
    y = drawKeyValue(doc, "Message", data.bankListResponse?.message || "N/A", 50, y, 450);

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
        doc.fontSize(8).font("Helvetica").fillColor(GRAY_TEXT)
          .text(`... and ${bankData.length - 25} more banks`, 50, y + 2);
        y += 14;
      }
    }
    y += 5;
    y = drawKeyValue(doc, "Full Response", "", 50, y, 450);
    y = drawJsonBlock(doc, data.bankListResponse, 50, y, doc.page.width - 100, 20);

    // === LIVE API CALL: TRANSACTION STATUS ===
    y = drawSectionTitle(doc, "4. Live API Call — Transaction Status Check", y);
    y = drawKeyValue(doc, "Endpoint", "/service/aeps/cashwithdraw/status", 50, y, 450);
    y = drawKeyValue(doc, "Method", "POST", 50, y, 450);
    y = drawKeyValue(doc, "Test Reference", `REPORT_TEST_*`, 50, y, 450);
    y = drawKeyValue(doc, "Status", data.txnStatusResponse?.status ? "SUCCESS" : "FAILED/NOT FOUND", 50, y, 450);
    y = drawKeyValue(doc, "Response Code", String(data.txnStatusResponse?.response_code ?? "N/A"), 50, y, 450);
    y = drawKeyValue(doc, "Message", data.txnStatusResponse?.message || "N/A", 50, y, 450);
    y += 5;
    y = drawKeyValue(doc, "Full Response", "", 50, y, 450);
    y = drawJsonBlock(doc, data.txnStatusResponse, 50, y, doc.page.width - 100, 15);

    // === API LOGS FROM DATABASE ===
    y = drawSectionTitle(doc, "5. Captured API Logs (from Database)", y);
    y = drawKeyValue(doc, "Total Logs in DB", data.totalLogs.toString(), 50, y, 450);
    y = drawKeyValue(doc, "Showing", `${Math.min(data.apiLogs.length, 50)} most recent`, 50, y, 450);
    y += 5;

    const logWidths = [90, 130, 40, 45, 50, 100];
    y = drawTableRow(doc, ["Timestamp", "Endpoint", "HTTP", "Result", "Duration", "Error"], logWidths, 50, y, true);

    const logsToShow = data.apiLogs.slice(0, 50);
    for (const log of logsToShow) {
      const ts = log.createdAt ? new Date(log.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }).replace(",", "") : "N/A";
      const shortEndpoint = (log.endpoint || "").replace("/service/aeps/", "").replace("/index", "");
      y = drawTableRow(doc, [
        ts,
        shortEndpoint,
        String(log.httpStatus),
        log.success ? "OK" : "FAIL",
        `${log.durationMs}ms`,
        (log.errorMessage || "").substring(0, 30),
      ], logWidths, 50, y, false);
    }

    if (data.apiLogs.length > 0) {
      y += 15;
      y = drawSectionTitle(doc, "6. Sample Log Detail", y);
      const sampleLog = data.apiLogs[0];
      y = drawKeyValue(doc, "Log ID", sampleLog.id, 50, y, 450);
      y = drawKeyValue(doc, "Endpoint", sampleLog.endpoint, 50, y, 450);
      y = drawKeyValue(doc, "HTTP Status", String(sampleLog.httpStatus), 50, y, 450);
      y = drawKeyValue(doc, "Success", String(sampleLog.success), 50, y, 450);
      y = drawKeyValue(doc, "Duration", `${sampleLog.durationMs}ms`, 50, y, 450);
      y = drawKeyValue(doc, "Timestamp", sampleLog.createdAt, 50, y, 450);
      if (sampleLog.errorMessage) {
        y = drawKeyValue(doc, "Error", sampleLog.errorMessage, 50, y, 450);
      }
      y += 5;
      y = drawKeyValue(doc, "Request Payload (redacted)", "", 50, y, 450);
      try {
        y = drawJsonBlock(doc, redactForPdf(JSON.parse(sampleLog.requestPayload)), 50, y, doc.page.width - 100, 15);
      } catch {
        y = drawJsonBlock(doc, redactForPdf(sampleLog.requestPayload), 50, y, doc.page.width - 100, 15);
      }
      y = drawKeyValue(doc, "Response Body (redacted)", "", 50, y, 450);
      try {
        y = drawJsonBlock(doc, redactForPdf(JSON.parse(sampleLog.responseBody)), 50, y, doc.page.width - 100, 15);
      } catch {
        y = drawJsonBlock(doc, redactForPdf(sampleLog.responseBody), 50, y, doc.page.width - 100, 15);
      }
    }

    // === SECURITY MEASURES ===
    y = drawSectionTitle(doc, "7. Security & Data Protection", y);
    const securityItems = [
      ["Encryption", "AES-128-CBC encryption for all production API payloads"],
      ["JWT Auth", "HS256 JWT tokens with timestamp and unique request IDs"],
      ["Aadhaar Masking", "All Aadhaar numbers masked to XXXX-XXXX-NNNN in logs"],
      ["Biometric Redaction", "PID data, HMAC, session keys fully redacted in logs"],
      ["Request Timeout", "180-second timeout for all AEPS calls"],
      ["Daily 2FA", "Mandatory biometric 2FA authentication before transactions"],
      ["KYC Onboarding", "Merchant KYC verification before AEPS access"],
      ["Admin Logging", "All API calls logged with timing, request/response for audit"],
      ["Sensitive Fields", "adhaarnumber, piddata, hmac, skey, ci, sessionkey are never stored in plaintext"],
    ];
    for (const [label, desc] of securityItems) {
      y = drawKeyValue(doc, label, desc, 50, y, 450);
    }
    y += 10;

    // === ADMIN PANEL CAPABILITIES ===
    y = drawSectionTitle(doc, "8. Admin Panel Logging Capabilities", y);
    const adminItems = [
      ["Real-time Logs", "Auto-refreshing AEPS API logs table in admin panel"],
      ["Endpoint Filter", "Filter logs by specific AEPS endpoint (balance, withdraw, etc.)"],
      ["Status Filter", "Filter by success/failure status"],
      ["Date Range", "Filter by date range for historical analysis"],
      ["Pagination", "Paginated log viewing (50 per page)"],
      ["Log Detail", "Expandable request/response detail view for each log"],
      ["CSV Export", "Full filtered export to CSV with all log data"],
      ["Copy Function", "One-click copy of log details"],
    ];
    for (const [label, desc] of adminItems) {
      y = drawKeyValue(doc, label, desc, 50, y, 450);
    }

    // === FOOTER ON LAST PAGE ===
    doc.fontSize(8).font("Helvetica").fillColor(GRAY_TEXT)
      .text(
        `RupyaSetu AEPS Report | Generated ${new Date(data.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} | Confidential`,
        50, doc.page.height - 30,
        { width: doc.page.width - 100, align: "center" }
      );

    doc.end();
  });
}
