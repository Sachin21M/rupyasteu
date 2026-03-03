================================================================================
                    PAYSPRINT RECHARGE INTEGRATION
                       UAT SIGN-OFF DOCUMENT
================================================================================

Date:           03 March 2026
Document Ver:   7.1
Prepared By:    RupyaSetu Development Team

================================================================================
1. PROJECT DETAILS
================================================================================

  Project Name  :  RupyaSetu
  Environment   :  UAT (SIT — System Integration Testing)
  Service       :  Mobile & DTH Recharge
  Base URL      :  https://sit.paysprint.in/service-api/api/v1
  Integration   :  Server-to-Server (AES-128-CBC Encrypted Payloads)
  Backend       :  Node.js / Express / TypeScript
  Platform      :  Android (Expo / React Native) + Web
  Server Domain :  https://rupyasetuadmin.site
  Server IP     :  34.41.220.14

================================================================================
2. AUTHENTICATION MECHANISM
================================================================================

  As per the Paysprint credential panel, the account version is:

      IP AND AUTHORIZED KEY BASED

  Authentication is handled through:

    1. IP Whitelisting — Server IP 34.41.220.14 registered with Paysprint
    2. Authorisedkey Header — Sent with every API request
    3. Token Header — Sent as per Paysprint API documentation

  All three are included in every outbound API request to the
  SIT environment. Token header included as per Paysprint API
  documentation. JWT token is generated using the credentials
  provided in the credential panel.

  Awaiting confirmation from Paysprint if additional JWT signing
  secret configuration is required for the SIT environment.

================================================================================
3. ENCRYPTION DETAILS
================================================================================

  All request payloads are encrypted using AES-128-CBC before
  transmission. The encrypted payload is sent as:

  { "encrypted_data": "<base64_string>" }

  Encryption Specification:
    Algorithm : AES-128-CBC
    Key       : ******** (as provided in credential panel)
    IV        : ******** (16-byte UTF-8)
    Encoding  : Base64 output

  Implementation Steps:
    1. Plain JSON payload is serialized to string
    2. AES key is configured as per credential panel
    3. IV is configured as per credential panel (UTF-8)
    4. Payload is encrypted using AES-128-CBC
    5. Ciphertext is Base64 encoded
    6. Sent as { "encrypted_data": "<base64>" }

================================================================================
4. API ENDPOINTS
================================================================================

  +------+------------------------+-----------------------------------------------+
  | S.No | Service                | Endpoint Path                                 |
  +------+------------------------+-----------------------------------------------+
  |  1   | Operator List / HLR    | POST /service/recharge/hlr/api/hlr/browseplan |
  |  2   | Do Recharge            | POST /service/recharge/recharge/dorecharge     |
  |  3   | Status Enquiry         | POST /service/recharge/recharge/status         |
  +------+------------------------+-----------------------------------------------+

  Full URLs (SIT):
  - Operator List  : https://sit.paysprint.in/service-api/api/v1/service/recharge/hlr/api/hlr/browseplan
  - Do Recharge    : https://sit.paysprint.in/service-api/api/v1/service/recharge/recharge/dorecharge
  - Status Enquiry : https://sit.paysprint.in/service-api/api/v1/service/recharge/recharge/status

  Request Headers (Common to All APIs):

  {
    "Content-Type"  : "application/json",
    "Authorisedkey" : "********",
    "Token"         : "********"
  }

================================================================================
5. UAT LOGS — OPERATOR LIST / HLR API
================================================================================

  Endpoint : POST /service/recharge/hlr/api/hlr/browseplan

  ── Request Payload (before encryption) ──

  {
    "number": "7067018549",
    "type": "MOBILE"
  }

  ── Encrypted Request Body ──

  {
    "encrypted_data": "l6twy9JBcdZBwwDP0XXciZ7x74xXtNwu69JVnu1SKr22SIGFFoIJbBRtc0+v6DHG"
  }

  ── Server Log ──

  Timestamp       : 2026-03-03T12:53:41.819Z
  Mode            : UAT API CALL (SIT Environment)
  Request URL     : https://sit.paysprint.in/service-api/api/v1/service/recharge/hlr/api/hlr/browseplan
  Request Method  : POST
  HTTP Status     : 500
  Raw Response    : HTML 404 page (not JSON)

  ── Observation ──

  The HLR / Browse Plan endpoint returned an HTML 404 error page
  (HTTP 500) instead of a JSON response. This endpoint path may
  not be available in the SIT environment.

================================================================================
6. UAT LOGS — DO RECHARGE API
================================================================================

  Endpoint : POST /service/recharge/recharge/dorecharge

  ── Request Payload (before encryption) ──

  {
    "operator": "jio",
    "canumber": "7067018549",
    "amount": 10,
    "recharge_type": "prepaid",
    "referenceid": "RSUAT1772543669"
  }

  ── Encrypted Request Body ──

  {
    "encrypted_data": "b5dvbgXTqyLSEtjdVG+O8xcqt/bf3N4ILT4kfj/kCQH+B+aKDU1Uj3ZS3RJLIkAwJzUP3A4Oto6D5XYjvzaglrUXsOjPDKwTrkXrFVApfcoWAkvF9HxBO7/9QTX5xOBCyxjJswMzPFqBcncSPdQofOBHvKUFyzQT461wqnHGX5s="
  }

  ── Server Log ──

  Timestamp       : 2026-03-03T13:14:29.163Z
  Mode            : UAT API CALL (SIT Environment)
  Request URL     : https://sit.paysprint.in/service-api/api/v1/service/recharge/recharge/dorecharge
  Request Method  : POST
  HTTP Status     : 412
  Raw Response    :

  {
    "status": false,
    "response_code": 10,
    "message": "Signature verification failed"
  }

================================================================================
7. UAT LOGS — STATUS ENQUIRY API
================================================================================

  Endpoint : POST /service/recharge/recharge/status

  ── Request Payload (before encryption) ──

  {
    "referenceid": "RSUAT1772543669"
  }

  ── Encrypted Request Body ──

  {
    "encrypted_data": "3J4n+JEtFbhQibIy9MudOnqqnZn8uC0SBS4lCBeEKXYLk6l8bU5+SdmjOizd1szq"
  }

  ── Server Log ──

  Timestamp       : 2026-03-03T13:14:30.250Z
  Mode            : UAT API CALL (SIT Environment)
  Request URL     : https://sit.paysprint.in/service-api/api/v1/service/recharge/recharge/status
  Request Method  : POST
  HTTP Status     : 412
  Raw Response    :

  {
    "status": false,
    "response_code": 6,
    "message": "Signature verification failed"
  }

================================================================================
8. API CALL SUMMARY
================================================================================

  +------+------------------+------+----------+-------------------------------+
  | S.No | Endpoint         | HTTP | Resp.    | Response Message              |
  |      |                  | Code | Code     |                               |
  +------+------------------+------+----------+-------------------------------+
  |  1   | browseplan (HLR) | 500  | N/A      | HTML 404 (endpoint not found) |
  |  2   | dorecharge       | 412  | 10       | Signature verification failed |
  |  3   | status           | 412  | 6        | Signature verification failed |
  +------+------------------+------+----------+-------------------------------+

  All calls made on: 03 March 2026
  Environment: SIT (sit.paysprint.in)
  Authentication: IP + Authorisedkey + Token headers

================================================================================
9. VERIFICATION CHECKLIST
================================================================================

  [✓] AES-128-CBC encryption implemented
  [✓] AES key configured as per credential panel
  [✓] 16-byte UTF-8 IV configuration
  [✓] Base64 encoding of encrypted payloads
  [✓] SIT base URL configured: https://sit.paysprint.in/service-api/api/v1
  [✓] Authorisedkey header included in all requests
  [✓] Token header included in all requests
  [✓] Content-Type: application/json header set
  [✓] Do Recharge endpoint reachable (returns JSON)
  [✓] Status Enquiry endpoint reachable (returns JSON)
  [✓] referenceid field included in Do Recharge payload
  [✓] Same referenceid used for Status Enquiry
  [✓] Response parsing with JSON error handling
  [✓] Network error handling with fallback responses
  [✓] Server IP registered: 34.41.220.14
  [✗] Signature verification — SIT returns "Signature verification failed"
  [✗] HLR endpoint — returns HTML 404 on SIT

================================================================================
10. ACTION ITEMS FOR PAYSPRINT
================================================================================

  1. Signature Verification:
     As per the credential panel, account version is IP AND
     AUTHORIZED KEY BASED. The Do Recharge and Status Enquiry
     APIs return "Signature verification failed" (HTTP 412).

     Request:
     - Please confirm if server IP 34.41.220.14 is whitelisted
       on the SIT environment.
     - Please confirm if additional JWT signing secret
       configuration is required for SIT, or if the provided
       credentials are sufficient.

  2. HLR / Browse Plan Endpoint:
     The endpoint /service/recharge/hlr/api/hlr/browseplan
     returns HTTP 500 (HTML 404 page) on sit.paysprint.in.
     Please confirm the correct endpoint path for the SIT
     environment.

================================================================================
11. CREDENTIALS SUMMARY (ALL MASKED)
================================================================================

  Account Version   : IP AND AUTHORIZED KEY BASED
  Environment       : UAT (SIT)
  Base URL          : https://sit.paysprint.in/service-api/api/v1
  Server IP         : 34.41.220.14
  JWT Token         : ********
  Authorised Key    : ********
  AES Encryption Key: ********
  AES Encryption IV : ********

  All credentials are stored as environment variables on the
  production server and are never exposed in API responses.

================================================================================
12. SIGN-OFF
================================================================================

  Prepared By  :  RupyaSetu Development Team
  Date         :  03 March 2026
  Version      :  7.1
  Environment  :  UAT (sit.paysprint.in)
  Account Type :  IP AND AUTHORIZED KEY BASED

  Testing Period: 02 March 2026 — 03 March 2026
  Direct SIT API Calls: 3

  ┌─────────────────────────────────────────────────────────────┐
  │  Integration implementation completed as per provided API    │
  │  documentation. AES encryption, request structure, and      │
  │  endpoint connectivity have been implemented on the SIT     │
  │  environment. Awaiting confirmation from Paysprint          │
  │  regarding signature validation and IP configuration for    │
  │  the SIT environment.                                       │
  └─────────────────────────────────────────────────────────────┘

================================================================================
                          END OF DOCUMENT
================================================================================
