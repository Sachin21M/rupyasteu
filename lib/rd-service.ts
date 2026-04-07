import { Platform } from "react-native";

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

// Mantra MFS100 uses port 11100 on Android; try multiple ports and hosts
const RD_PORTS = [11100, 11101, 11102, 11103, 8080];
const RD_HOSTS = ["127.0.0.1", "localhost"];
const RD_TIMEOUT = 5000;
const CAPTURE_TIMEOUT = 30000;

const CAPTURE_XML = `<?xml version="1.0"?>
<PidOptions ver="1.0">
  <Opts fCount="1" fType="2" iCount="0" pCount="0" format="0" pidVer="2.0" timeout="20000" otp="" wadh="" posh="UNKNOWN" env="P" />
  <CustOpts><Param name="mantrakey" value="" /></CustOpts>
</PidOptions>`;

const SIMULATED_PID = `<PidData><Resp errCode="0" fCount="1" fType="2" iCount="0" pCount="0" errInfo="Success" /><DeviceInfo dpId="MANTRA.MSIPL" rdsId="MANTRA.WIN.001" rdsVer="1.0.8" mi="MFS100" mc="MIIEGDCCAwCgAwIBAgIEA" dc="2f196bbc-e2f8-4018-87a9-9b58eb" /><Skey ci="20250101">SIMULATED_KEY</Skey><Hmac>SIMULATED_HMAC</Hmac><Data type="X">SIMULATED_BIOMETRIC_DATA</Data></PidData>`;

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

  return {
    manufacturer,
    model: mi || rdsId || "Unknown",
    serialNo: dc || "N/A",
  };
}

async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverRdDevice(): Promise<RdDeviceInfo | null> {
  if (Platform.OS === "web") return null;

  for (const host of RD_HOSTS) {
    for (const port of RD_PORTS) {
      try {
        // Use standard GET method — Mantra RD Service accepts GET for /rd/info
        // Custom "RDSERVICE" verb is rejected by React Native's network layer
        const resp = await fetchWithTimeout(
          `http://${host}:${port}/rd/info`,
          {
            method: "GET",
            headers: { "Content-Type": "text/xml" },
          },
          RD_TIMEOUT
        );
        const text = await resp.text();
        if (text && (text.includes("RDService") || text.includes("DeviceInfo") || text.includes("READY") || text.includes("dpId"))) {
          const parsed = parseDeviceInfoFromXml(text);
          console.log(`[RD] Device found at ${host}:${port} — ${parsed.manufacturer} ${parsed.model}`);
          return {
            connected: true,
            manufacturer: parsed.manufacturer || "Unknown",
            model: parsed.model || "Unknown",
            serialNo: parsed.serialNo || "N/A",
            port,
            host,
            rdServiceInfo: text,
          };
        }
      } catch (err: any) {
        console.log(`[RD] No device at ${host}:${port} — ${err?.message || "timeout"}`);
      }
    }
  }
  return null;
}

export async function captureFingerprint(port?: number, host?: string): Promise<RdCaptureResult> {
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
    device = await discoverRdDevice();
  }

  if (!device) {
    return {
      success: false,
      pidData: "",
      deviceInfo: null,
      error: "No RD device found. Please ensure:\n\n1. A UIDAI-certified fingerprint scanner (Mantra MFS100, Morpho, etc.) is connected via USB/OTG\n2. The RD Service app is installed from Play Store\n3. The RD Service app is running",
    };
  }

  try {
    // Use standard POST method — Mantra RD Service accepts POST for /rd/capture
    const resp = await fetchWithTimeout(
      `http://${device.host}:${device.port}/rd/capture`,
      {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: CAPTURE_XML,
      },
      CAPTURE_TIMEOUT
    );

    const pidXml = await resp.text();

    if (!pidXml || pidXml.length < 50) {
      return {
        success: false,
        pidData: "",
        deviceInfo: device,
        error: "Empty response from RD device. Please try again.",
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
    if (parsedInfo.manufacturer && parsedInfo.manufacturer !== "Unknown") {
      device.manufacturer = parsedInfo.manufacturer;
    }
    if (parsedInfo.model && parsedInfo.model !== "Unknown") {
      device.model = parsedInfo.model;
    }
    if (parsedInfo.serialNo && parsedInfo.serialNo !== "N/A") {
      device.serialNo = parsedInfo.serialNo;
    }

    return {
      success: true,
      pidData: pidXml,
      deviceInfo: device,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return {
        success: false,
        pidData: "",
        deviceInfo: device,
        error: "Biometric capture timed out. Please place your finger on the scanner and try again.",
      };
    }
    return {
      success: false,
      pidData: "",
      deviceInfo: device,
      error: `RD device communication error: ${err?.message || "Unknown error"}`,
    };
  }
}

export function isSimulated(): boolean {
  return Platform.OS === "web";
}
