# RupyaSetu - Mobile & DTH Recharge App

## Overview
RupyaSetu is a fintech mobile recharge application built with Expo (React Native) and Express backend. It supports mobile prepaid and DTH recharge with UPI payment integration.

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
    index.tsx           # Home dashboard
    history.tsx         # Transaction history
    profile.tsx         # User profile
  recharge/
    mobile.tsx          # Mobile recharge (operator + number)
    dth.tsx             # DTH recharge (provider + subscriber ID)
    plans.tsx           # Plan selection
  payment/
    utr.tsx             # UTR capture (Manual Payment Mode)
    status.tsx          # Transaction status
contexts/
  AuthContext.tsx        # Auth state management
constants/
  colors.ts             # Theme colors
lib/
  api.ts                # Frontend API client
  query-client.ts       # React Query setup
server/
  index.ts              # Express server
  routes.ts             # API routes (auth, recharge, transactions)
  storage.ts            # PostgreSQL data storage
  controllers/          # (reserved for future)
  services/
    paysprint.ts        # Paysprint API integration (LIVE — AES encrypted, IP BASED auth)
  utils/
    encryption.ts       # AES encryption, JWT helpers
    validators.ts       # Input validation (UTR, phone, amount)
shared/
  schema.ts             # Shared types and Zod schemas
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
9. Privacy, Help & Support, About screens

## Environment Variables
- `PAYMENT_MODE` - MANUAL or GATEWAY (default: MANUAL)
- `PAYEE_UPI_ID` - UPI VPA for receiving payments
- `PAYSPRINT_JWT_TOKEN` - Paysprint API JWT
- `PAYSPRINT_AUTHORIZED_KEY` - Paysprint auth key
- `PAYSPRINT_AES_KEY` - AES encryption key
- `PAYSPRINT_AES_IV` - AES IV
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
- Features: dashboard stats, transaction table with filters (All/Pending/Approved/Rejected), approve/reject buttons, auto-refresh every 30s
- Admin API: POST `/api/admin/login`, GET `/api/admin/transactions`, POST `/api/admin/transactions/:id/approve`, POST `/api/admin/transactions/:id/reject`

## Paysprint Integration Notes
- Official docs: https://pay-sprint.readme.io/reference/authentication-1
- **Environment: LIVE (PRODUCTION)** — switched from SIT/UAT
- LIVE Base URL: `https://api.paysprint.in/api/v1` (no `service-api/` prefix for LIVE)
- SIT Base URL was: `https://sit.paysprint.in/service-api/api/v1`
- JWT payload: `{ timestamp (seconds), partnerId (from PAYSPRINT_PARTNER_ID env var), reqid (unique integer) }`
- JWT signing: Use raw base64 JWT Token string as HS256 secret (NOT decoded/Buffer)
- **partnerId**: Must be the Paysprint-assigned user ID from `PAYSPRINT_PARTNER_ID` env var (e.g. `PS006853...`), NOT a custom name
- Payload format: AES-128-CBC encrypted for PRODUCTION (`{"data":"<encrypted>"}`) — plain JSON for SIT/UAT
- **AES encryption**: AES-128-CBC with 16-byte key and 16-byte IV from env vars, Base64 output
- Request body wrapper: `{ "data": "<encrypted_base64>" }`
- Request header: `Token: <jwt>` (NOT `Authorization: Bearer`)
- Operator codes: Numeric IDs (14=Jio, 4=Airtel, 33=VI, 8=BSNL, 10=MTNL, 34=Idea)
- **LIVE account version: IP BASED** — Authorisedkey header must NOT be sent (causes "Invalid Ip" error)
- For SIT/UAT (IP + Authorised Key based), Authorisedkey IS sent
- **Geo-restriction**: LIVE API blocks non-Indian IPs via AWS ELB
- **Solution**: Hostinger proxy in India (static IP `88.222.246.128`) routes Paysprint API calls
- Proxy URL: stored in `PAYSPRINT_PROXY_URL` env var
- The proxy IP must be whitelisted in Paysprint dashboard
- Paysprint runs in simulation mode when JWT token not configured
- **Current status**: Authentication WORKING — balance API responds correctly (returns service hours info). Service maintenance window: 23:00–05:30 IST.

## Notes
- Payment mode is configurable via PAYMENT_MODE env var
- Code structured for easy gateway integration later
