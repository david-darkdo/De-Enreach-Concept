export function getProductionOrigin(request?: Request): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  if (request) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || "https";
    if (host && !host.includes("localhost") && !host.includes("127.0.0.1") && !host.includes("vercel.app")) {
      return `${proto}://${host}`;
    }
  }

  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, "");
  }

  return "https://www.deenreachconcept.com.ng";
}

export const getCanonicalOrigin = getProductionOrigin;
