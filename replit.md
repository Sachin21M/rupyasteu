# RupyaSetu - Mobile & DTH Recharge + AEPS Banking App

## Overview
RupyaSetu is a fintech mobile application built with Expo (React Native) and Express backend. It supports mobile prepaid recharge, DTH recharge with UPI payment integration, and AEPS (Aadhaar Enabled Payment System) banking services.

## Tech Stack
- **Frontend**: React Native (Expo Router) + TypeScript
- **Backend**: Node.js + Express
- **Storage**: PostgreSQL (via pg pool) — persistent across restarts/deployments
- **Auth**: OTP-based login with JWT tokens (SMS Alert API for OTP delivery)
- **SMS Gateway**: SMS Alert (smsalert.co.in) — env vars: SMSALERT_API_KEY, SMSALERT_SENDER, SMSALERT_TEMPLATE
- **Font**: Inter (Google Fonts)
- **Primary Color**: #2E9E5B
- **Logo**: `assets/images/rupyasetu-logo.jpeg` (unmodified user-provided JPEG, light grey background)
- **App Icon**: Same logo used for icon.png, splash-icon.png, favicon.png, adaptive icons
- **Background**: #F0F0F0 (matches logo's light grey) with #E8E8E8 for splash/adaptive icon bg

## Project Structure
```
app/                    # Expo Router screens
  _layout.tsx           # Root layout with auth, fonts, providers
  index.tsx             # Auth redirect
  login.tsx             # Phone number login
  otp.tsx               # OTP verification
  (tabs)/               # Main tab navigation
    _layout.tsx         # Tab bar (Home, History, Profile)
    index.tsx           # Home dashboard (Recharge + AEPS sections)
    history.tsx         # Transaction history (Recharge + AEPS combined)
    profile.tsx         # User profile
  recharge/
    mobile.tsx          # Mobile recharge (operator + number)
    dth.tsx             # DTH recharge (provider + subscriber ID)
    plans.tsx           # Plan selection
  aeps/
    index.tsx           # AEPS service selection screen
    transaction.tsx     # AEPS transaction form (Aadhaar, bank, biometric)
    result.tsx          # AEPS transaction result display
  payment/
    utr.tsx             # UTR capture (Manual Payment Mode)
    status.tsx          # Transaction status
contexts/
  AuthContext.tsx        # Auth state management
constants/
  colors.ts             # Theme colors
lib/
  api.ts                # Frontend API client (recharge + AEPS functions)
  query-client.ts       # React Query setup
server/
  index.ts              # Express server
  routes.ts             # API routes (auth, recharge, transactions, AEPS)
  storage.ts            # PostgreSQL data storage (users, transactions, AEPS tables)
  services/
    paysprint.ts        # Paysprint recharge API integration (LIVE — AES encrypted, IP BASED auth)
    aeps.ts             # Paysprint AEPS API integration (balance, withdrawal, mini statement, Aadhaar pay)
  utils/
    encryption.ts       # AES encryption, JWT helpers
    validators.ts       # Input validation (UTR, phone, amount)
  templates/
    admin-panel.html    # Admin panel with recharge + AEPS transaction views
shared/
  schema.ts             # Shared types and Zod schemas (Recharge + AEPS types)
```

## Key Features
1. OTP-based login (real SMS via SMS Alert API, 6-digit OTP)
2. Mobile prepaid recharge with operator/plan selection
3. DTH recharge with provider selection
4. Manual UTR payment capture (PAYMENT_MODE=MANUAL)
5. Admin approval flow — UTR submitted → admin approves/rejects → Paysprint recharge triggered on approval
6. Web-based Admin Panel at `/admin` for transaction management
7. Transaction history with status tracking
8. Paysprint API integration (LIVE environment — AES encrypted, IP BASED auth)
9. **AEPS Banking** — Balance Enquiry, Cash Withdrawal, Mini Statement, Aadhaar Pay
10. AEPS merchant onboarding and daily 2FA authentication
11. Privacy, Help & Support, About screens

## AEPS (Aadhaar Enabled Payment System)
### Services
- **Balance Enquiry**: Check Aadhaar-linked bank account balance
- **Cash Withdrawal**: Withdraw cash using Aadhaar + biometric
- **Mini Statement**: View recent bank transactions
- **Aadhaar Pay**: Make payments using Aadhaar authentication

### Database Tables
- `aeps_merchants` — Stores merchant KYC status and bank pipe configuration
- `aeps_daily_auth` — Tracks daily 2FA authentication per user
- `aeps_transactions` — Records all AEPS transaction history

### API Endpoints
- `GET /api/aeps/banks` — Get list of AEPS-supported banks
- `GET /api/aeps/merchant` — Get merchant onboarding/auth status
- `POST /api/aeps/onboard` — Initiate merchant onboarding
- `POST /api/aeps/2fa/register` — 2FA registration
- `POST /api/aeps/2fa/authenticate` — Daily 2FA authentication
- `POST /api/aeps/transaction` — Execute AEPS transaction
- `GET /api/aeps/transactions` — Get user's AEPS transaction history
- `GET /api/admin/aeps-transactions` — Admin: get all AEPS transactions

### Technical Notes
- AEPS uses 180-second timeout for all API calls
- Biometric data: XML string from UIDAI-certified RD device (fingerprint/iris)
- Bank pipe values: bank2, bank3, bank5, bank6 for LIVE (bank1 = UAT only)
- 2FA: One-time registration + daily authentication required before transactions
- Runs in simulation mode when JWT token not configured

## Environment Variables
- `PAYMENT_MODE` - MANUAL or GATEWAY (default: MANUAL)
- `PAYEE_UPI_ID` - UPI VPA for receiving payments
- `PAYSPRINT_JWT_TOKEN` - Paysprint API JWT
- `PAYSPRINT_AUTHORIZED_KEY` - Paysprint auth key
- `PAYSPRINT_AES_KEY` - AES encryption key
- `PAYSPRINT_AES_IV` - AES IV
- `PAYSPRINT_PARTNER_ID` - Paysprint partner/user ID
- `PAYSPRINT_ENV` - UAT or PRODUCTION
- `PAYSPRINT_PROXY_URL` - AWS Lambda proxy URL in Mumbai for bypassing Paysprint geo-restriction
- `PAYSPRINT_BASE_URL` - Paysprint API base URL (default: https://api.paysprint.in/api/v1)
- `SESSION_SECRET` - JWT signing secret
- `SMSALERT_API_KEY` - SMS Alert API key
- `SMSALERT_SENDER` - SMS Alert sender ID
- `SMSALERT_TEMPLATE` - SMS Alert message template
- `ADMIN_USERNAME` - Admin panel login username (default: admin)
- `ADMIN_PASSWORD` - Admin panel login password (default: rupyasetu@2026)

## Ports
- Frontend (Expo): 8081
- Backend (Express): 5000

## Payment Flow (Manual Mode with Admin Approval)
1. User selects plan and clicks "Pay Now"
2. App opens UPI intent (on mobile) or shows UPI details
3. User completes payment externally
4. User enters UTR reference number and submits
5. Backend validates UTR format and uniqueness, saves as PAYMENT_UNVERIFIED / RECHARGE_PENDING
6. User sees "Payment Under Processing — will be confirmed within 24 hours"
7. Admin reviews transaction at `/admin`, approves or rejects
8. On approval: Paysprint recharge API is triggered, status updated to SUCCESS or FAILED
9. On rejection: Status updated to PAYMENT_FAILED / RECHARGE_FAILED

## Admin Panel
- URL: `/admin` (served from `server/templates/admin-panel.html`)
- Login: username/password (env vars ADMIN_USERNAME / ADMIN_PASSWORD)
- Features: dashboard stats, recharge transaction table, AEPS transaction table, approve/reject buttons, auto-refresh every 30s
- Admin API: POST `/api/admin/login`, GET `/api/admin/transactions`, GET `/api/admin/aeps-transactions`, POST `/api/admin/transactions/:id/approve`, POST `/api/admin/transactions/:id/reject`

## Paysprint Integration Notes
- Official docs: https://pay-sprint.readme.io/reference/authentication-1
- **Environment: LIVE (PRODUCTION)** — switched from SIT/UAT
- LIVE Base URL: `https://api.paysprint.in/api/v1` (no `service-api/` prefix for LIVE)
- JWT payload: `{ timestamp (seconds), partnerId (from PAYSPRINT_PARTNER_ID env var), reqid (unique integer) }`
- JWT signing: Use raw base64 JWT Token string as HS256 secret (NOT decoded/Buffer)
- **partnerId**: Must be the Paysprint-assigned user ID from `PAYSPRINT_PARTNER_ID` env var
- Payload format: AES-128-CBC encrypted for PRODUCTION (`{"data":"<encrypted>"}`) — plain JSON for SIT/UAT
- **AES encryption**: AES-128-CBC with 16-byte key and 16-byte IV from env vars, Base64 output
- Request header: `Token: <jwt>` (NOT `Authorization: Bearer`)
- **LIVE account version: IP BASED** — Authorisedkey header must NOT be sent
- **Geo-restriction**: LIVE API blocks non-Indian IPs — proxy used
- Proxy URL: stored in `PAYSPRINT_PROXY_URL` env var
- Paysprint runs in simulation mode when JWT token not configured
- **Current status**: Authentication WORKING — balance API responds correctly

## Notes
- Payment mode is configurable via PAYMENT_MODE env var
- Code structured for easy gateway integration later
- AEPS runs in simulation mode when no JWT token is configured
- Demo login: 7067018549 → OTP 123456
