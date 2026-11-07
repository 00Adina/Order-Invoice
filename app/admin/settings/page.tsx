import { PageHeader } from "@/components/admin/page-header";
import { SettingsForm } from "@/components/admin/settings-form";
import { requireAdmin } from "@/lib/auth";
import type { BusinessSettings } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("business_settings").select("*").eq("id", 1).single();
  if (error) throw new Error(error.message);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" />
      <SettingsForm settings={data as BusinessSettings} />
    </div>
  );
}
