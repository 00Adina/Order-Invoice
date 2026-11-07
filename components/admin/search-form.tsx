import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Plain GET form so filters live in the URL and work without JS. */
export function SearchForm({ placeholder, defaultValue, children }: { placeholder: string; defaultValue?: string; children?: React.ReactNode }) {
  return (
    <form className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" placeholder={placeholder} defaultValue={defaultValue} className="w-64 pl-8" />
      </div>
      {children}
    </form>
  );
}
