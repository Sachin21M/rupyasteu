# RupyaSetu - Mobile & DTH Recharge App

## Overview
RupyaSetu is a fintech mobile recharge application built with Expo (React Native) and Express backend. It supports mobile prepaid and DTH recharge with UPI payment integration.

## Tech Stack
- **Frontend**: React Native (Expo Router) + TypeScript
- **Backend**: Node.js + Express
- **Storage**: In-memory (MemStorage) - ready to migrate to MongoDB
- **Auth**: OTP-based login with JWT tokens
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
  storage.ts            # In-memory data storage
  controllers/          # (reserved for future)
  services/
    paysprint.ts        # Paysprint API integration (UAT simulation)
  utils/
    encryption.ts       # AES encryption, JWT helpers
    validators.ts       # Input validation (UTR, phone, amount)
shared/
  schema.ts             # Shared types and Zod schemas
```

## Key Features
1. OTP-based login (UAT: use OTP 1234)
2. Mobile prepaid recharge with operator/plan selection
3. DTH recharge with provider selection
4. Manual UTR payment capture (PAYMENT_MODE=MANUAL)
5. Transaction history with status tracking
6. Paysprint API integration (UAT simulation mode)

## Environment Variables
- `PAYMENT_MODE` - MANUAL or GATEWAY (default: MANUAL)
- `PAYEE_UPI_ID` - UPI VPA for receiving payments
- `PAYSPRINT_JWT_TOKEN` - Paysprint API JWT
- `PAYSPRINT_AUTHORIZED_KEY` - Paysprint auth key
- `PAYSPRINT_AES_KEY` - AES encryption key
- `PAYSPRINT_AES_IV` - AES IV
- `PAYSPRINT_ENV` - UAT or PRODUCTION
- `SESSION_SECRET` - JWT signing secret

## Ports
- Frontend (Expo): 8081
- Backend (Express): 5000

## Payment Flow (Manual Mode - Temporary)
1. User selects plan and clicks "Pay Now"
2. App opens UPI intent (on mobile) or shows UPI details
3. User completes payment externally
4. User enters UTR reference number
5. Backend validates UTR format and uniqueness
6. Recharge API is triggered
7. Transaction status updated

## Notes
- Payment mode is configurable via PAYMENT_MODE env var
- Code structured for easy gateway integration later
- Paysprint runs in UAT simulation when API keys not configured
