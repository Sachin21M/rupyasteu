/**
 * RD Service — communicates with UIDAI-certified biometric devices.
 *
 * On Android: Uses Android Intent API (expo-intent-launcher) to communicate
 * with Mantra/Morpho RD Service apps directly. This is the correct approach
 * for Android — bypasses both OkHttp3 (which blocks custom HTTP methods like
 * RDSERVICE/CAPTURE) and WebView CORS restrictions.
 *
 * On Web: Returns simulated data for testing.
 */
import { Platform } from "react-native";
import { startActivityAsync, ResultCode } from "expo-intent-launcher";

export type RdDeviceInfo = {
  connected: boolean;
  manufacturer: string;
  model: string;
  serialNo: string;
  port: number;
  host: string;
  rdServiceInfo: string;
};

export type RdCaptureResult = {
  success: boolean;
  pidData: string;
  deviceInfo: RdDeviceInfo | null;
  error?: string;
};

export type RdDiscoveryResult = {
  device: RdDeviceInfo | null;
  diagnostics: string[];
};

// Standard UIDAI RD Service intent actions
const RD_INFO_ACTION = "in.gov.uidai.rdservice.fp.INFO";
const RD_CAPTURE_ACTION = "in.gov.uidai.rdservice.fp.CAPTURE";

// PaySprint WADH values — required per bank for biometric capture.
// The RD device embeds this value into the signed PID data so PaySprint
// can verify the capture was authorised by their system.
export const PAYSPRINT_WADH: Record<string, string> = {
  bank2: "18f4CEiXeXcfGXvgWA/blxD+w2pw7hfQPY45JMytkPw=",
  bank3: "18f4CEiXeXcfGXvgWA/blxD+w2pw7hfQPY45JMytkPw=", // bank3 uses same as bank2
  bank5: "E0jzJ/P8UopUHAieZn8CKqS4WPMi5ZSYXgfnlfkWjrc=",
  bank6: "E0jzJ/P8UopUHAieZn8CKqS4WPMi5ZSYXgfnlfkWjrc=",
};

function buildCaptureXml(wadh: string): string {
  return `<?xml version="1.0"?>
<PidOptions ver="1.0">
  <Opts fCount="1" fType="2" iCount="0" pCount="0" format="0" pidVer="2.0" timeout="20000" otp="" wadh="${wadh}" posh="UNKNOWN" env="P" />
  <CustOpts><Param name="mantrakey" value="" /></CustOpts>
</PidOptions>`;
}

const SIMULATED_PID = `<PidData><Resp errCode="0" fCount="1" fType="2" iCount="0" pCount="0" errInfo="Success" /><DeviceInfo dpId="MANTRA.MSIPL" rdsId="MANTRA.WIN.001" rdsVer="1.0.8" mi="MFS110" mc="MIIEGDCCAwCgAwIBAgIEA" dc="9519866" /><Skey ci="20250101">SIMULATED_KEY</Skey><Hmac>SIMULATED_HMAC</Hmac><Data type="X">SIMULATED_BIOMETRIC_DATA</Data></PidData>`;

function parseXmlAttr(xml: string, tag: string, attr: string): string {
  const tagRegex = new RegExp(`<${tag}[^>]*>`, "i");
  const tagMatch = xml.match(tagRegex);
  if (!tagMatch) return "";
  const attrRegex = new RegExp(`${attr}="([^"]*)"`, "i");
  const attrMatch = tagMatch[0].match(attrRegex);
  return attrMatch ? attrMatch[1] : "";
}

// App-description strings returned by Mantra RD Service when NO physical device is connected.
// These appear in the "info" attribute of <RDService> (not in <DeviceInfo>).
const APP_DESCRIPTION_PATTERNS = [
  "vendor device manager",
  "authentication",
  "rdservice",
  "rd service",
  "mantra l1",
];

function isAppDescription(value: string): boolean {
  const lower = value.toLowerCase();
  return APP_DESCRIPTION_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Parse the RD Service INFO response extras.
 * Mantra returns two separate extra keys:
 *   RD_SERVICE_INFO — RD Service app info (version, dpId, status)
 *   DEVICE_INFO     — physical device info (mi=model, dc=serial)
 * Both must be parsed independently to detect a real physical device.
 *
 * Returns null only when status="NOTREADY" is explicitly set.
 */
function makeDeviceFromExtras(extras: Record<string, unknown>): RdDeviceInfo | null {
  // Parse both extra XMLs independently
  const rdServiceXml =
    (extras["RD_SERVICE_INFO"] as string) ||
    (extras["rdServiceInfo"] as string) ||
    "";
  const deviceInfoXml =
    (extras["DEVICE_INFO"] as string) ||
    (extras["deviceInfo"] as string) ||
    "";

  // "NOTREADY" from the RD Service XML means no device is connected
  const rdStatus = parseXmlAttr(rdServiceXml, "RDService", "status");
  if (rdStatus && rdStatus.toUpperCase() === "NOTREADY") {
    return null;
  }

  let model = "";
  let serialNo = "";
  let manufacturer = "";

  // --- Physical device info from DEVICE_INFO extra (primary source) ---
  if (deviceInfoXml) {
    const mi = parseXmlAttr(deviceInfoXml, "DeviceInfo", "mi");
    const dc = parseXmlAttr(deviceInfoXml, "DeviceInfo", "dc");
    const dpId = parseXmlAttr(deviceInfoXml, "DeviceInfo", "dpId");

    if (mi && !isAppDescription(mi)) model = mi;
    if (dc) serialNo = dc;

    const dpLower = dpId.toLowerCase();
    if (dpLower.includes("mantra")) manufacturer = "Mantra";
    else if (dpLower.includes("morpho")) manufacturer = "Morpho";
    else if (dpLower.includes("startek")) manufacturer = "Startek";
    else if (dpLower.includes("secugen")) manufacturer = "SecuGen";
    else if (dpId && !isAppDescription(dpId)) manufacturer = dpId;
  }

  // --- Fallback: look inside RD_SERVICE_INFO for nested DeviceInfo ---
  if (!model && rdServiceXml) {
    const mi = parseXmlAttr(rdServiceXml, "DeviceInfo", "mi");
    const dc = parseXmlAttr(rdServiceXml, "DeviceInfo", "dc");
    const dpId =
      parseXmlAttr(rdServiceXml, "DeviceInfo", "dpId") ||
      parseXmlAttr(rdServiceXml, "RDService", "dpId");

    if (mi && !isAppDescription(mi)) model = mi;
    if (dc && !serialNo) serialNo = dc;

    if (!manufacturer) {
      const dpLower = dpId.toLowerCase();
      if (dpLower.includes("mantra")) manufacturer = "Mantra";
      else if (dpLower.includes("morpho")) manufacturer = "Morpho";
      else if (dpLower.includes("startek")) manufacturer = "Startek";
      else if (dpLower.includes("secugen")) manufacturer = "SecuGen";
    }
  }

  // --- Flat extra keys (some RD Service versions return flat values) ---
  const flatModel =
    (extras["mi"] as string) ||
    (extras["MI"] as string) ||
    (extras["model"] as string);
  const flatSerial =
    (extras["dc"] as string) ||
    (extras["DC"] as string) ||
    (extras["serialNo"] as string);
  const flatMfr =
    (extras["dpId"] as string) || (extras["manufacturer"] as string);

  if (flatModel && !model && !isAppDescription(flatModel)) model = flatModel;
  if (flatSerial && !serialNo) serialNo = flatSerial;
  if (flatMfr && !manufacturer) {
    const fmLower = flatMfr.toLowerCase();
    if (fmLower.includes("mantra")) manufacturer = "Mantra";
    else if (fmLower.includes("morpho")) manufacturer = "Morpho";
    else if (!isAppDescription(flatMfr)) manufacturer = flatMfr;
  }

  // If the intent returned Success and status is not NOTREADY, the RD Service
  // is ready. Even if we couldn't parse model/serial from the XML, report as
  // connected so the user can proceed to the biometric capture step.
  return {
    connected: true,
    manufacturer: manufacturer || "Mantra",
    model: model || "MFS110",
    serialNo: serialNo || "N/A",
    port: 11100,
    host: "127.0.0.1",
    rdServiceInfo: rdServiceXml || deviceInfoXml || JSON.stringify(extras),
  };
}

export async function discoverRdDevice(): Promise<RdDiscoveryResult> {
  if (Platform.OS === "web") return { device: null, diagnostics: [] };

  if (Platform.OS !== "android") {
    return { device: null, diagnostics: ["Not supported on iOS"] };
  }

  const diagnostics: string[] = [];

  try {
    const result = await startActivityAsync(RD_INFO_ACTION, {});
    const code = result.resultCode;
    const extras = (result.extra as Record<string, unknown>) || {};

    diagnostics.push(
      `Intent INFO → resultCode=${code} extras=${Object.keys(extras).join(",")}`
    );

    if (code === ResultCode.Success) {
      const device = makeDeviceFromExtras(extras);
      if (!device) {
        return {
          device: null,
          diagnostics: [
            ...diagnostics,
            "Mantra RD Service app is running but no biometric scanner is connected. Plug in your USB fingerprint device and try again.",
          ],
        };
      }
      return { device, diagnostics };
    }

    return {
      device: null,
      diagnostics: [
        ...diagnostics,
        `RD Service not ready (code=${code}). Open Mantra RD Service app and ensure the device is connected.`,
      ],
    };
  } catch (e: any) {
    const msg = e?.message || String(e);
    diagnostics.push(`Intent ERROR: ${msg}`);

    if (
      msg.includes("No Activity") ||
      msg.includes("not found") ||
      msg.includes("ActivityNotFoundException")
    ) {
      return {
        device: null,
        diagnostics: [
          ...diagnostics,
          "Mantra RD Service app not installed or not active.",
        ],
      };
    }

    return { device: null, diagnostics };
  }
}

export async function captureFingerprint(
  port?: number,
  host?: string,
  wadh?: string
): Promise<RdCaptureResult> {
  if (Platform.OS === "web") {
    return {
      success: true,
      pidData: SIMULATED_PID,
      deviceInfo: {
        connected: true,
        manufacturer: "Simulated",
        model: "Web Testing",
        serialNo: "SIM-001",
        port: 0,
        host: "localhost",
        rdServiceInfo: "Simulated for web",
      },
    };
  }

  if (Platform.OS !== "android") {
    return {
      success: false,
      pidData: "",
      deviceInfo: null,
      error: "Biometric capture only supported on Android.",
    };
  }

  try {
    const captureXml = buildCaptureXml(wadh || "");
    const result = await startActivityAsync(RD_CAPTURE_ACTION, {
      extra: { PID_OPTIONS: captureXml },
    });

    const code = result.resultCode;
    const extras = (result.extra as Record<string, unknown>) || {};

    if (code !== ResultCode.Success) {
      return {
        success: false,
        pidData: "",
        deviceInfo: null,
        error:
          code === 0
            ? "Fingerprint capture was cancelled."
            : `RD Service returned error code ${code}.`,
      };
    }

    // PID data is returned as "PID_DATA" extra (string)
    const pidData =
      (extras["PID_DATA"] as string) ||
      (extras["pidData"] as string) ||
      (extras["pid_data"] as string) ||
      "";

    if (!pidData || pidData.length < 50) {
      return {
        success: false,
        pidData: "",
        deviceInfo: null,
        error:
          "Empty biometric response. Please place your finger firmly and try again.",
      };
    }

    const errCodeMatch = pidData.match(/errCode="(\d+)"/);
    const errInfoMatch = pidData.match(/errInfo="([^"]*)"/);
    const errCode = errCodeMatch ? errCodeMatch[1] : null;
    const errInfo = errInfoMatch ? errInfoMatch[1] : "";

    if (errCode && errCode !== "0") {
      const friendlyMessages: Record<string, string> = {
        "710": "Fingerprint not detected. Place your finger firmly on the scanner.",
        "720": "Scan timed out. Place your finger before the timer runs out.",
        "730": "Poor fingerprint quality. Clean your finger, press firmly and flat on the scanner, then try again.",
        "740": "Device not responding. Unplug and reconnect the biometric device.",
        "800": "Device initialisation failed. Restart the Mantra RD Service app.",
      };
      const friendly = friendlyMessages[errCode];
      return {
        success: false,
        pidData: "",
        deviceInfo: null,
        error: friendly || `Biometric capture failed: ${errInfo || "Unknown error"} (Code: ${errCode})`,
      };
    }

    const device = makeDeviceFromExtras(extras);
    return { success: true, pidData, deviceInfo: device };
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes("No Activity") || msg.includes("not found")) {
      return {
        success: false,
        pidData: "",
        deviceInfo: null,
        error:
          "Mantra RD Service app not found. Please install and open Mantra L1 RDService.",
      };
    }
    return {
      success: false,
      pidData: "",
      deviceInfo: null,
      error: `Biometric error: ${msg}`,
    };
  }
}

export function isSimulated(): boolean {
  return Platform.OS === "web";
}
