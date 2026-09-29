import { useState, useEffect } from "react";

declare global {
  interface Window {
    __pwa_prompt?: any;
  }
}

// Capture Android/Chromium's native install prompt as early as possible.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: any) => {
    e.preventDefault();
    window.__pwa_prompt = e;
    window.dispatchEvent(new CustomEvent("pwa:ready"));
    console.log("PWA: captured beforeinstallprompt");
  });

  window.addEventListener("appinstalled", () => {
    window.__pwa_prompt = null;
    window.dispatchEvent(new CustomEvent("pwa:installed"));
    console.log("PWA: appinstalled event fired");
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => console.log("PWA: Service Worker active:", reg.scope))
        .catch((err) => console.warn("PWA: SW registration error:", err));
    });
  }
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes("android-app://");
      setIsStandalone(standalone);

      // Once the app is installed, never keep an install prompt alive.
      if (standalone) {
        window.__pwa_prompt = null;
        setCanInstall(false);
      } else {
        setCanInstall(!!window.__pwa_prompt);
      }
    };

    checkStandalone();

    const handleReady = () => {
      if (!isStandalone) setCanInstall(true);
    };

    const handleInstalled = () => {
      window.__pwa_prompt = null;
      setCanInstall(false);
      setIsStandalone(true);
    };

    window.addEventListener("pwa:ready", handleReady);
    window.addEventListener("pwa:installed", handleInstalled);

    return () => {
      window.removeEventListener("pwa:ready", handleReady);
      window.removeEventListener("pwa:installed", handleInstalled);
    };
  }, [isStandalone]);

  const triggerInstall = async (): Promise<boolean> => {
    const prompt = window.__pwa_prompt;
    if (!prompt || isStandalone) return false;

    try {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      console.log("PWA install outcome:", outcome);

      if (outcome === "accepted") {
        window.__pwa_prompt = null;
        setCanInstall(false);
        return true;
      }
    } catch (err) {
      console.warn("PWA install error:", err);
    }

    return false;
  };

  return { canInstall, isStandalone, triggerInstall };
}
