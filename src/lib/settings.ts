import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppSettings = {
  id: string | null;
  company_name?: string | null;
  support_whatsapp: string | null;
  sales_whatsapp: string | null;
  company_email: string | null;
  company_address: string | null;
  map_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  google_site_verification: string | null;
  bing_site_verification: string | null;
};

const DEFAULT_SETTINGS: AppSettings = {
  id: null,
  support_whatsapp: null,
  sales_whatsapp: null,
  company_email: null,
  company_address: null,
  map_url: null,
  facebook_url: null,
  instagram_url: null,
  tiktok_url: null,
  google_site_verification: null,
  bing_site_verification: null,
};

// Always returns a usable settings object. Safe Mode: on missing row or any
// failure, return DEFAULT_SETTINGS so UI never crashes.
export async function fetchAppSettings(): Promise<AppSettings> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return DEFAULT_SETTINGS;
    if (data) return data as AppSettings;

    // No row yet — try to seed one (requires admin RLS). Ignore failures.
    try {
      const { data: inserted } = await supabase
        .from("app_settings")
        .insert({} as never)
        .select("*")
        .maybeSingle();
      if (inserted) return inserted as AppSettings;
    } catch {
      /* RLS or network — fall back to in-memory defaults */
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const APP_SETTINGS_QUERY_KEY = ["app_settings"] as const;

export function useAppSettings() {
  return useQuery({
    queryKey: APP_SETTINGS_QUERY_KEY,
    queryFn: fetchAppSettings,
    staleTime: 0,
    refetchOnWindowFocus: true,
    placeholderData: DEFAULT_SETTINGS,
  });
}

export function waLink(rawPhone: string | null | undefined, message?: string) {
  if (!rawPhone) return "#";
  const phone = rawPhone.replace(/[^\d]/g, "");
  const base = `https://wa.me/${phone}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
