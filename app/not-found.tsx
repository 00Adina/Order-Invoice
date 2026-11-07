import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <p className="text-muted-foreground">We couldn&apos;t find that page or invoice.</p>
      <Button asChild>
        <Link href="/">Go to the order assistant</Link>
      </Button>
    </main>
  );
}
