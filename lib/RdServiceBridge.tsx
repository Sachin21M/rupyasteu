/**
 * RdServiceBridge — hidden WebView that sends RDSERVICE/CAPTURE HTTP methods
 * to the Mantra RD Service on localhost. WebView uses Chrome's Blink networking
 * stack which supports custom HTTP verbs, unlike React Native's OkHttp3 layer.
 */
import React, { useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

export type BridgeResult = {
  success: boolean;
  text?: string;
  status?: number;
  error?: string;
};

export type RdBridgeHandle = {
  xhrRequest: (
    method: string,
    url: string,
    body: string | null,
    timeout: number
  ) => Promise<BridgeResult>;
};

type PendingCall = {
  resolve: (r: BridgeResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

// HTML page loaded into the hidden WebView — contains no UI, just an XHR helper
const BRIDGE_HTML = `<!DOCTYPE html><html><body>
<script>
window.pendingCalls = {};
window.xhrRequest = function(id, method, url, body, timeout) {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'text/xml');
    xhr.timeout = timeout;
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          id: id,
          success: xhr.status > 0,
          status: xhr.status,
          text: xhr.responseText || ''
        }));
      }
    };
    xhr.onerror = function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        id: id,
        success: false,
        status: xhr.status,
        error: 'onerror status=' + xhr.status
      }));
    };
    xhr.ontimeout = function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        id: id,
        success: false,
        status: 0,
        error: 'timeout'
      }));
    };
    xhr.send(body || null);
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      id: id,
      success: false,
      status: 0,
      error: 'exception: ' + e.message
    }));
  }
};
</script>
</body></html>`;

let callCounter = 0;

const RdServiceBridge = forwardRef<RdBridgeHandle>((_, ref) => {
  const webViewRef = useRef<WebView>(null);
  const pendingRef = useRef<Record<string, PendingCall>>({});

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      const pending = pendingRef.current[msg.id];
      if (!pending) return;
      clearTimeout(pending.timer);
      delete pendingRef.current[msg.id];
      if (msg.success || (msg.status >= 200 && msg.status < 600)) {
        pending.resolve({ success: msg.status >= 200 && msg.status < 400, text: msg.text, status: msg.status });
      } else {
        pending.resolve({ success: false, error: msg.error || `status=${msg.status}` });
      }
    } catch {}
  }, []);

  useImperativeHandle(ref, () => ({
    xhrRequest(method, url, body, timeout) {
      return new Promise<BridgeResult>((resolve, reject) => {
        const id = `rd_${++callCounter}`;
        const timer = setTimeout(() => {
          delete pendingRef.current[id];
          resolve({ success: false, error: `timeout after ${timeout}ms` });
        }, timeout + 500);

        pendingRef.current[id] = { resolve, reject, timer };

        const js = `window.xhrRequest(${JSON.stringify(id)}, ${JSON.stringify(method)}, ${JSON.stringify(url)}, ${JSON.stringify(body)}, ${timeout}); true;`;
        webViewRef.current?.injectJavaScript(js);
      });
    },
  }), []);

  return (
    <View style={{ height: 0, width: 0, overflow: "hidden" }}>
      <WebView
        ref={webViewRef}
        source={{ html: BRIDGE_HTML }}
        onMessage={handleMessage}
        originWhitelist={["*"]}
        mixedContentMode="always"
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        style={{ height: 0, width: 0 }}
      />
    </View>
  );
});

export default RdServiceBridge;
