import { Chat } from "@/components/chat/chat";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  let businessName = "Our Store";
  try {
    businessName = (await getSettings()).business_name;
  } catch (err) {
    console.error("[home] could not load settings", err);
  }
  return <Chat businessName={businessName} />;
}
