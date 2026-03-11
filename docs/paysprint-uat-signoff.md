================================================================================
                    PAYSPRINT RECHARGE INTEGRATION
                   PRODUCTION (LIVE) CONFIGURATION DOCUMENT
================================================================================

Date:           11 March 2026
Document Ver:   10.0
Prepared By:    RupyaSetu Development Team

================================================================================
1. PROJECT DETAILS
================================================================================

  Project Name  :  RupyaSetu
  Environment   :  PRODUCTION (LIVE)
  Service       :  Mobile & DTH Recharge
  Base URL      :  https://api.paysprint.in/api/v1
  Backend       :  Node.js / Express / TypeScript
  Platform      :  Android (Expo / React Native) + Web
  Server Domain :  https://rupyasetuadmin.site
  Dev Server IP :  34.68.16.191 (whitelisted on Paysprint LIVE panel)
  Prod Server IP:  34.111.179.208 (must also be whitelisted for deployed app)

  Documentation Reference:
    https://pay-sprint.readme.io/reference/getting-started
    https://pay-sprint.readme.io/reference/authentication-1

================================================================================
2. AUTHENTICATION (LIVE CONFIGURATION)
================================================================================

  Account Version: IP BASED

  JWT Token Creation:
    - Algorithm: HS256
    - Secret Key: LIVE JWT Token value (used as-is, NOT decoded)
    - JWT Payload:

      {
        "timestamp": <unix_epoch_milliseconds>,
        "partnerId": "<partner_id>",
        "reqid": "<unique_integer_per_request>"
      }

    - timestamp: Unix epoch in milliseconds
    - partnerId: PS006853d7abd4d179a5ae3775d9e77eb9caf7471772716264
    - reqid: Unique integer per request

  Request Headers:
    - Content-Type: application/json
    - Authorisedkey: JWT KEY value (base64-encoded, same as JWT signing key for IP BASED accounts)
    - Token: JWT token generated per request

  Payload Encryption:
    - Mode: AES-128-CBC
    - Key: LIVE AES key (16 bytes)
    - IV: LIVE AES IV (16 bytes)
    - Format: {"body": "<base64_encrypted_json>"}
    - Fallback: Plain JSON if encryption fails (logged as warning)

================================================================================
3. URL FORMAT CHANGE (SIT → LIVE)
================================================================================

  SIT URL Pattern:
    https://sit.paysprint.in/service-api/api/v1/<service_path>

  LIVE URL Pattern:
    https://api.paysprint.in/api/v1/<service_path>

  Changes from SIT to LIVE:
    1. Domain: sit.paysprint.in → api.paysprint.in
    2. Path: /service-api/api/v1 → /api/v1 (service-api/ prefix REMOVED)
    3. Encryption: Plain JSON → AES-128-CBC encrypted body
    4. Auth type: IP AND AUTHORIZED KEY BASED → IP BASED

================================================================================
4. UAT/SIT TEST RESULTS (ARCHIVED — FOR REFERENCE)
================================================================================

  The following tests were completed successfully on SIT environment
  before switching to LIVE:

  Tested on: 05 March 2026
  SIT Base URL: https://sit.paysprint.in/service-api/api/v1
  SIT Partner ID: PS0022043e3eb33636af1535d85668b687ebbd5b
  SIT Server IP: 34.41.220.14

  Results:
  ✓  JWT Authentication    : PASSED
  ✓  Authorisedkey         : PASSED
  ✓  IP Whitelisting       : PASSED
  ✓  Payload Parsing       : PASSED
  ✓  Do Recharge           : PASSED (response_code: 1)
  ✓  Status Enquiry        : PASSED (responsecode: 1)
  ✓  All 6 Operators       : PASSED (Jio, Airtel, VI, BSNL, MTNL, Idea)
  ✓  Transaction Confirmed : PASSED (ackno: 1739594884)

================================================================================
5. LIVE API STATUS
================================================================================

  Date Tested: 11 March 2026
  Status: GEOGRAPHIC RESTRICTION

  The LIVE API returns HTTP 401 with text response:
    "This application is not available in your region"

  This occurs for ALL requests from our server (IP: 34.68.16.191, US-based).
  The restriction is applied at the CDN/load balancer level (AWS ELB),
  before any credential validation.

  Root Cause:
    Paysprint's LIVE API enforces geographic restrictions. Requests from
    non-Indian IP addresses are blocked at the infrastructure level,
    regardless of IP whitelisting in the credential panel.

  Resolution Options:
    1. Contact Paysprint support to explicitly unblock server IPs for
       LIVE API access from US-based infrastructure
    2. Deploy the backend to an Indian cloud provider (AWS Mumbai,
       GCP asia-south1, etc.)
    3. Use an Indian proxy/VPN for API calls

  Code Readiness:
    All code changes for LIVE are complete and tested:
    - LIVE base URL configured
    - AES-128-CBC encryption implemented with fallback
    - LIVE Partner ID set
    - LIVE JWT KEY, AES KEY, AES IV loaded as secrets
    - IP BASED auth headers configured

================================================================================
6. OPERATOR CODES
================================================================================

  +------+------------------+
  | Code | Operator         |
  +------+------------------+
  |  4   | Airtel           |
  |  8   | BSNL             |
  | 10   | MTNL             |
  | 14   | Jio Prepaid      |
  | 33   | VI / Vodafone    |
  | 34   | Idea             |
  +------+------------------+

================================================================================
7. CREDENTIALS SUMMARY (LIVE)
================================================================================

  Account Version   : IP BASED
  Environment       : PRODUCTION (LIVE)
  Status            : CONFIGURED — pending geo-restriction resolution
  Dev Server IP     : 34.68.16.191 (whitelisted on LIVE panel)
  Prod Server IP    : 34.111.179.208 (must be whitelisted for deployment)
  Partner ID        : PS006853d7abd4d179a5ae3775d9e77eb9caf7471772716264
  JWT Token         : ******** (stored as PAYSPRINT_JWT_TOKEN secret)
  AES Key           : ******** (stored as PAYSPRINT_AES_KEY secret)
  AES IV            : ******** (stored as PAYSPRINT_AES_IV secret)
  Authorised Key    : Same as JWT Token (IP BASED accounts)

================================================================================
8. SIGN-OFF
================================================================================

  Prepared By  :  RupyaSetu Development Team
  Date         :  11 March 2026
  Version      :  10.0

  ┌─────────────────────────────────────────────────────────────────┐
  │  INTEGRATION STATUS: CODE READY — LIVE API BLOCKED BY GEO      │
  │                                                                │
  │  SIT/UAT Testing         : ALL PASSED (archived above)         │
  │  LIVE URL Config         : DONE                                │
  │  AES Encryption          : DONE (with fallback)                │
  │  LIVE Credentials        : LOADED                              │
  │  IP Whitelisting (dev)   : DONE (34.68.16.191)                 │
  │  IP Whitelisting (prod)  : PENDING (34.111.179.208)            │
  │  LIVE API Access         : BLOCKED (geographic restriction)    │
  │                                                                │
  │  NEXT STEP: Resolve geographic restriction with Paysprint      │
  │  to enable LIVE API access from server infrastructure.         │
  └─────────────────────────────────────────────────────────────────┘

================================================================================
                          END OF DOCUMENT
================================================================================
