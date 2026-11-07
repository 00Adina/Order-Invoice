import { PageHeader } from "@/components/admin/page-header";
import { ProductDialog } from "@/components/admin/product-dialog";
import { ProductRowActions } from "@/components/admin/product-row-actions";
import { SearchForm } from "@/components/admin/search-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { ilikePattern } from "@/lib/search";
import type { Product } from "@/lib/types";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase } = await requireAdmin();
  let query = supabase.from("products").select("*").order("active", { ascending: false }).order("category").order("name");
  if (q?.trim()) {
    const p = ilikePattern(q.trim());
    query = query.or(`name.ilike.${p},sku.ilike.${p},category.ilike.${p}`);
  }
  const [{ data, error }, { data: settings }] = await Promise.all([
    query,
    supabase.from("business_settings").select("currency_code").eq("id", 1).single(),
  ]);
  if (error) throw new Error(error.message);
  const products = (data ?? []) as Product[];
  const cur = settings?.currency_code ?? "USD";

  return (
    <>
      <PageHeader title="Products & services" description="Everything the chatbot can sell. Prices here are the only prices used on invoices.">
        <ProductDialog />
      </PageHeader>
      <div className="mb-4">
        <SearchForm placeholder="Search name, SKU, category" defaultValue={q} />
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {q ? "No products match your search." : "No products yet. Add your first product."}
                </TableCell>
              </TableRow>
            )}
            {products.map((p) => (
              <TableRow key={p.id} className={p.active ? undefined : "opacity-60"}>
                <TableCell className="max-w-72 whitespace-normal">
                  <p className="font-medium">{p.name}</p>
                  {p.description && <p className="truncate text-xs text-muted-foreground">{p.description}</p>}
                </TableCell>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell>
                  {p.category}
                  {p.kind === "service" && (
                    <Badge variant="info" className="ml-2">
                      Service
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(Number(p.price), cur)} <span className="text-xs text-muted-foreground">/ {p.unit}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.stock === null ? (
                    <span className="text-muted-foreground">Unlimited</span>
                  ) : p.stock === 0 ? (
                    <span className="font-medium text-destructive">0</span>
                  ) : (
                    p.stock
                  )}
                </TableCell>
                <TableCell>{p.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Hidden</Badge>}</TableCell>
                <TableCell>
                  <ProductRowActions product={p} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
