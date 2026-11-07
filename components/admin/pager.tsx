import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const PAGE_SIZE = 25;

export function pageRange(pageParam: string | undefined) {
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  return { page, from: (page - 1) * PAGE_SIZE, to: page * PAGE_SIZE - 1 };
}

export function Pager({ page, total, params }: { page: number; total: number; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
    sp.set("page", String(p));
    return `?${sp}`;
  };
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
      <span>
        {total} result{total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-2">
        <span>
          Page {page} of {pages}
        </span>
        <Button asChild variant="outline" size="icon" className="size-8" aria-disabled={page <= 1}>
          <Link href={href(Math.max(1, page - 1))} aria-label="Previous page" className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
            <ChevronLeft />
          </Link>
        </Button>
        <Button asChild variant="outline" size="icon" className="size-8" aria-disabled={page >= pages}>
          <Link href={href(Math.min(pages, page + 1))} aria-label="Next page" className={page >= pages ? "pointer-events-none opacity-50" : ""}>
            <ChevronRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
