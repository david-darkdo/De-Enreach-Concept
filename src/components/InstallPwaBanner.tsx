import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/lib/pwa";

export function InstallPwaBanner() {
  const { canInstall, isStandalone, triggerInstall } = usePwaInstall();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (userAgent.includes("macintosh") && window.navigator.maxTouchPoints > 1);

    setIsIos(isIosDevice);

    const handleShowBanner = () => {
      if (isStandalone) return;
      setIsDismissed(false);
      if (isIosDevice) setShowIosInstructions(true);
    };

    window.addEventListener("pwa:show-banner", handleShowBanner);
    return () => {
      window.removeEventListener("pwa:show-banner", handleShowBanner);
    };
  }, [isStandalone]);

  const handleInstallClick = async () => {
    if (canInstall) {
      await triggerInstall();
      return;
    }

    if (isIos) {
      setShowIosInstructions(true);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    setShowIosInstructions(false);
  };

  // Installed apps must never show the install banner again while running standalone.
  if (isStandalone || isDismissed) return null;

  // Android/Chromium: only show when the browser has supplied the native install prompt.
  // iOS/iPadOS: show the dedicated manual Home Screen installation guidance.
  if (!canInstall && !isIos) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 z-[9999] max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="rounded-xl border border-border/80 bg-background/95 p-4 shadow-2xl backdrop-blur-md dark:bg-card/95">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted p-1 border border-border">
            <img
              src="/logo.png?v=10"
              alt="Enreach Concepts"
              width={40}
              height={40}
              className="h-10 w-10 object-contain shrink-0"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-foreground">
                Install Enreach App
              </h3>
              <button
                onClick={handleDismiss}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Dismiss install prompt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Install <strong>Enreach Concepts Showroom</strong> as a fast, full-screen application on your phone or desktop.
            </p>

            {isIos && (
              <div className="mt-3 rounded-lg bg-accent/50 p-2.5 text-[11px] text-accent-foreground border border-accent">
                <p className="flex items-center gap-1.5 font-medium">
                  <Share className="h-3.5 w-3.5 text-primary" /> To install on iPhone / iPad:
                </p>
                <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-muted-foreground">
                  <li>Tap the <strong>Share</strong> button in Safari</li>
                  <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
                  <li>Tap <strong>Add</strong> to finish installing Enreach</li>
                </ol>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <Button
                onClick={handleInstallClick}
                size="sm"
                className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium"
              >
                <Download className="h-3.5 w-3.5" />
                {isIos ? "Add to Home Screen" : "Install App"}
              </Button>
              <Button
                onClick={handleDismiss}
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Not Now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
