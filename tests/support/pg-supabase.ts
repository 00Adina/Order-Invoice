/**
 * A tiny stand-in for the supabase-js query builder, backed by a real Postgres
 * connection. Implements only what the server-side chat/invoice code uses, so
 * integration tests exercise the real schema, RPCs and constraints.
 */
import type { Pool } from "pg";

type Result = { data: unknown; error: { message: string; code?: string } | null };
type Filter = (param: (v: unknown) => string) => string;

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`Unsupported identifier ${s}`);
  return `"${s}"`;
};

const toDb = (v: unknown) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);

class Query implements PromiseLike<Result> {
  private columns = "*";
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: Record<string, unknown> | null = null;
  private cardinality: "many" | "single" | "maybe" = "many";

  constructor(
    private pool: Pool,
    private table: string,
  ) {}

  select(cols = "*") {
    this.columns = cols
      .split(",")
      .map((c) => (c.trim() === "*" ? "*" : ident(c.trim())))
      .join(", ");
    return this;
  }
  insert(row: Record<string, unknown>) {
    this.mode = "insert";
    this.payload = row;
    return this;
  }
  update(row: Record<string, unknown>) {
    this.mode = "update";
    this.payload = row;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((p) => `${ident(col)} = ${p(v)}`);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((p) => `${ident(col)}::text = any(${p(vs.map(String))}::text[])`);
    return this;
  }
  ilike(col: string, pattern: string) {
    this.filters.push((p) => `${ident(col)} ilike ${p(pattern)}`);
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orders.push(`${ident(col)} ${opts.ascending === false ? "desc" : "asc"}`);
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.cardinality = "single";
    return this;
  }
  maybeSingle() {
    this.cardinality = "maybe";
    return this;
  }

  private build(): { text: string; values: unknown[] } {
    const values: unknown[] = [];
    const param = (v: unknown) => {
      values.push(v);
      return "$" + values.length;
    };
    const where = () => (this.filters.length ? " where " + this.filters.map((f) => f(param)).join(" and ") : "");
    const t = `public.${ident(this.table)}`;

    if (this.mode === "insert") {
      const keys = Object.keys(this.payload!);
      if (!keys.length) return { text: `insert into ${t} default values returning ${this.columns}`, values };
      const cols = keys.map(ident).join(", ");
      const vals = keys.map((k) => param(toDb(this.payload![k]))).join(", ");
      return { text: `insert into ${t} (${cols}) values (${vals}) returning ${this.columns}`, values };
    }
    if (this.mode === "update") {
      const sets = Object.entries(this.payload!)
        .map(([k, v]) => `${ident(k)} = ${param(toDb(v))}`)
        .join(", ");
      return { text: `update ${t} set ${sets}${where()} returning ${this.columns}`, values };
    }
    if (this.mode === "delete") return { text: `delete from ${t}${where()} returning *`, values };

    let text = `select ${this.columns} from ${t}${where()}`;
    if (this.orders.length) text += ` order by ${this.orders.join(", ")}`;
    if (this.limitN !== null) text += ` limit ${Number(this.limitN)}`;
    return { text, values };
  }

  private async run(): Promise<Result> {
    try {
      const { text, values } = this.build();
      const { rows } = await this.pool.query(text, values);
      if (this.cardinality === "many") return { data: rows, error: null };
      if (rows.length > 1) return { data: null, error: { message: "multiple rows returned" } };
      if (rows.length === 0) {
        return this.cardinality === "maybe" ? { data: null, error: null } : { data: null, error: { message: "no rows", code: "PGRST116" } };
      }
      return { data: rows[0], error: null };
    } catch (e) {
      const err = e as { message: string; code?: string };
      return { data: null, error: { message: err.message, code: err.code } };
    }
  }

  then<A = Result, B = never>(
    onOk?: ((v: Result) => A | PromiseLike<A>) | null,
    onErr?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onOk, onErr);
  }
}

export function pgSupabase(pool: Pool) {
  return {
    from: (table: string) => new Query(pool, table),
    async rpc(name: string, args: Record<string, unknown>): Promise<Result> {
      try {
        const keys = Object.keys(args);
        const named = keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(", ");
        const values = keys.map((k) => args[k]);
        if (name === "search_products") {
          const { rows } = await pool.query(`select * from public.search_products(${named})`, values);
          return { data: rows, error: null };
        }
        const { rows } = await pool.query(`select public.${ident(name)}(${named}) as r`, values);
        return { data: rows[0].r, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  };
}
