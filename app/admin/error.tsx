"use client";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border bg-card p-8 text-center">
      <p className="font-semibold">Something went wrong loading this page.</p>
      <p className="mt-1 text-sm text-muted-foreground">{error.digest ? `Reference: ${error.digest}` : error.message}</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
