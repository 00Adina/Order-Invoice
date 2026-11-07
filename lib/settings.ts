import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BusinessSettings } from "@/lib/types";

export async function getSettings(): Promise<BusinessSettings> {
  const { data, error } = await supabaseAdmin().from("business_settings").select("*").eq("id", 1).single();
  if (error || !data) throw new Error(`Could not load business settings: ${error?.message ?? "missing row"}`);
  return data as BusinessSettings;
}
