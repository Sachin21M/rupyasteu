import { Platform } from "react-native";

if (Platform.OS === "web" && typeof window !== "undefined") {
  const NoopObserver = class {
    constructor(_family?: any, _options?: any) {}
    load(_text?: any, _timeout?: any) {
      return Promise.resolve();
    }
  };

  (window as any).FontFaceObserver = NoopObserver;

  try {
    Object.defineProperty(window, "FontFaceObserver", {
      get: () => NoopObserver,
      set: () => {},
      configurable: false,
    });
  } catch (_e) {}

  window.addEventListener("error", (e) => {
    if (e.message?.includes("timeout exceeded")) {
      e.preventDefault();
    }
  });

  window.addEventListener("unhandledrejection", (e) => {
    if (e.reason?.message?.includes("timeout exceeded")) {
      e.preventDefault();
    }
  });

  const link = document.createElement("link");
  link.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
  link.rel = "stylesheet";
  document.head.appendChild(link);

  const style = document.createElement("style");
  style.textContent = `
    @font-face { font-family: 'Inter_400Regular'; src: local('Inter'), local('Inter Regular'), local('Inter-Regular'); font-weight: 400; font-display: swap; }
    @font-face { font-family: 'Inter_500Medium'; src: local('Inter Medium'), local('Inter-Medium'); font-weight: 500; font-display: swap; }
    @font-face { font-family: 'Inter_600SemiBold'; src: local('Inter SemiBold'), local('Inter-SemiBold'); font-weight: 600; font-display: swap; }
    @font-face { font-family: 'Inter_700Bold'; src: local('Inter Bold'), local('Inter-Bold'); font-weight: 700; font-display: swap; }
  `;
  document.head.appendChild(style);
}
