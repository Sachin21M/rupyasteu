/**
 * RD Service — communicates with UIDAI-certified biometric devices via their
 * local HTTP server (Mantra RD Service on localhost:11100).
 *
 * IMPORTANT: Custom HTTP methods (RDSERVICE, CAPTURE) are required by the
 * UIDAI spec but are silently blocked by React Native's OkHttp3 networking
 * layer. We therefore use a WebView bridge (lib/RdServiceBridge.tsx) which
 * runs inside Chrome's Blink engine and supports any HTTP method.
 */
import { Platform } from "react-native";
import type { RdBridgeHandle } from "./RdServiceBridge";

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

const RD_PORTS = [11100, 11101, 11102, 11103, 8080];
const RD_HOSTS = ["127.0.0.1", "localhost"];
const RD_TIMEOUT = 4000;
const CAPTURE_TIMEOUT = 30000;

const CAPTURE_XML = `<?xml version="1.0"?>
<PidOptions ver="1.0">
  <Opts fCount="1" fType="2" iCount="0" pCount="0" format="0" pidVer="2.0" timeout="20000" otp="" wadh="" posh="UNKNOWN" env="P" />
  <CustOpts><Param name="mantrakey" value="" /></CustOpts>
</PidOptions>`;

const SIMULATED_PID = `<PidData><Resp errCode="0" fCount="1" fType="2" iCount="0" pCount="0" errInfo="Success" /><DeviceInfo dpId="MANTRA.MSIPL" rdsId="MANTRA.WIN.001" rdsVer="1.0.8" mi="MFS110" mc="MIIEGDCCAwCgAwIBAgIEA" dc="9519866" /><Skey ci="20250101">SIMULATED_KEY</Skey><Hmac>SIMULATED_HMAC</Hmac><Data type="X">SIMULATED_BIOMETRIC_DATA</Data></PidData>`;

function parseDeviceInfoFromXml(xml: string): Partial<RdDeviceInfo> {
  const getAttr = (tag: string, attr: string): string => {
    const tagRegex = new RegExp(`<${tag}[^>]*>`, "i");
    const tagMatch = xml.match(tagRegex);
    if (!tagMatch) return "";
    const attrRegex = new RegExp(`${attr}="([^"]*)"`, "i");
    const attrMatch = tagMatch[0].match(attrRegex);
    return attrMatch ? attrMatch[1] : "";
  };

  const dpId = getAttr("DeviceInfo", "dpId") || getAttr("RDService", "dpId");
  const mi = getAttr("DeviceInfo", "mi") || getAttr("RDService", "info");
  const dc = getAttr("DeviceInfo", "dc") || getAttr("RDService", "dc");
  const rdsId = getAttr("DeviceInfo", "rdsId") || getAttr("RDService", "id");

  let manufacturer = "Unknown";
  const dpLower = dpId.toLowerCase();
  if (dpLower.includes("mantra")) manufacturer = "Mantra";
  else if (dpLower.includes("morpho")) manufacturer = "Morpho";
  else if (dpLower.includes("startek")) manufacturer = "Startek";
  else if (dpLower.includes("secugen")) manufacturer = "SecuGen";
  else if (dpLower.includes("next")) manufacturer = "Next Biometrics";
  else if (dpId) manufacturer = dpId;

  return { manufacturer, model: mi || rdsId || "Unknown", serialNo: dc || "N/A" };
}

export async function discoverRdDevice(bridge: RdBridgeHandle): Promise<RdDiscoveryResult> {
  if (Platform.OS === "web") return { device: null, diagnostics: [] };

  const diagnostics: string[] = [];

  for (const host of RD_HOSTS) {
    for (const port of RD_PORTS) {
      const url = `http://${host}:${port}/rd/info`;
      // UIDAI spec requires RDSERVICE method — bridge (WebView) sends it correctly
      const result = await bridge.xhrRequest("RDSERVICE", url, null, RD_TIMEOUT);

      if (result.success && result.text) {
        const snippet = result.text.substring(0, 100).replace(/[\n\r]/g, " ");
        diagnostics.push(`RDSERVICE ${host}:${port} → ${result.status} | ${snippet}`);

        if (
          result.text.includes("RDService") ||
          result.text.includes("DeviceInfo") ||
          result.text.includes("READY") ||
          result.text.includes("dpId")
        ) {
          const parsed = parseDeviceInfoFromXml(result.text);
          return {
            device: {
              connected: true,
              manufacturer: parsed.manufacturer || "Unknown",
              model: parsed.model || "Unknown",
              serialNo: parsed.serialNo || "N/A",
              port,
              host,
              rdServiceInfo: result.text,
            },
            diagnostics,
          };
        }
        // Connected but not RD data
        diagnostics.push(`RDSERVICE ${host}:${port} → ${result.status} (not RD service)`);
      } else {
        diagnostics.push(`RDSERVICE ${host}:${port} → ERR: ${result.error || `status=${result.status}`}`);
      }
    }
  }

  return { device: null, diagnostics };
}

export async function captureFingerprint(
  bridge: RdBridgeHandle,
  port?: number,
  host?: string
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

  let device: RdDeviceInfo | null = null;
  if (port) {
    device = {
      connected: true,
      manufacturer: "Unknown",
      model: "Unknown",
      serialNo: "N/A",
      port,
      host: host || "127.0.0.1",
      rdServiceInfo: "",
    };
  } else {
    const result = await discoverRdDevice(bridge);
    device = result.device;
  }

  if (!device) {
    return {
      success: false,
      pidData: "",
      deviceInfo: null,
      error:
        "No RD device found. Please ensure:\n\n1. Mantra MFS110 is connected via USB/OTG\n2. Mantra L1 RDService app is running and shows 'Device connected'\n3. Tap the refresh icon to retry",
    };
  }

  // UIDAI spec: CAPTURE method for fingerprint capture
  const captureResult = await bridge.xhrRequest(
    "CAPTURE",
    `http://${device.host}:${device.port}/rd/capture`,
    CAPTURE_XML,
    CAPTURE_TIMEOUT
  );

  if (!captureResult.success) {
    return {
      success: false,
      pidData: "",
      deviceInfo: device,
      error: `RD device error: ${captureResult.error || `status=${captureResult.status}`}`,
    };
  }

  const pidXml = captureResult.text || "";

  if (!pidXml || pidXml.length < 50) {
    return {
      success: false,
      pidData: "",
      deviceInfo: device,
      error: "Empty response from RD device. Please place your finger and try again.",
    };
  }

  const errCodeMatch = pidXml.match(/errCode="(\d+)"/);
  const errInfoMatch = pidXml.match(/errInfo="([^"]*)"/);
  const errCode = errCodeMatch ? errCodeMatch[1] : null;
  const errInfo = errInfoMatch ? errInfoMatch[1] : "";

  if (errCode && errCode !== "0") {
    return {
      success: false,
      pidData: "",
      deviceInfo: device,
      error: `Biometric capture failed: ${errInfo || "Unknown error"} (Code: ${errCode})`,
    };
  }

  const parsedInfo = parseDeviceInfoFromXml(pidXml);
  if (parsedInfo.manufacturer && parsedInfo.manufacturer !== "Unknown") device.manufacturer = parsedInfo.manufacturer;
  if (parsedInfo.model && parsedInfo.model !== "Unknown") device.model = parsedInfo.model;
  if (parsedInfo.serialNo && parsedInfo.serialNo !== "N/A") device.serialNo = parsedInfo.serialNo;

  return { success: true, pidData: pidXml, deviceInfo: device };
}

export function isSimulated(): boolean {
  return Platform.OS === "web";
}
