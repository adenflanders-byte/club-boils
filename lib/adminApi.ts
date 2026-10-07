"use client";
// Browser-side helpers for the Admin and Accounts pages. All data goes
// through /api/admin/*, which checks the admin session on the server and uses
// the service-role key there. Nothing privileged runs in the browser.

// Rows are untyped, exactly like the untyped Supabase client the pages used before.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
type Result<T = Row[]> = { data: T | null; error: { message: string } | null };

function goToLogin() {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/admin/login")) {
    window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
}

export async function adminFetch<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 401) goToLogin();
  let data: T & { error?: string; code?: string };
  try { data = await res.json(); } catch { data = { error: "Unexpected response from server." } as T & { error?: string }; }
  return { ok: res.ok, status: res.status, data };
}

/** A unique key per action so a double-click or retry is never recorded twice. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

// ── Minimal query builder with the same shape the pages already used ─────
type Filter = { column: string; value: string | number | boolean | null };

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private columns = "*";
  private filters: Filter[] = [];
  private orderBy?: { column: string; ascending: boolean };
  private values?: unknown;
  constructor(private table: string) {}

  select(columns = "*") { this.columns = columns; return this; }
  eq(column: string, value: Filter["value"]) { this.filters.push({ column, value }); return this; }
  order(column: string, opts?: { ascending?: boolean }) { this.orderBy = { column, ascending: opts?.ascending !== false }; return this; }
  insert(values: unknown) { this.op = "insert"; this.values = values; return this; }
  update(values: unknown) { this.op = "update"; this.values = values; return this; }
  /** Settings are upserted by key on the server. */
  upsert(values: unknown) { this.op = "upsert"; this.values = values; return this; }
  delete() { this.op = "delete"; return this; }

  private async run(): Promise<Result> {
    const res = await adminFetch<{ data: Row[] | null }>("/api/admin/db", {
      body: { table: this.table, op: this.op, columns: this.columns, filters: this.filters, order: this.orderBy, values: this.values },
    });
    if (!res.ok) {
      const message = res.data?.error || "Request failed.";
      if (this.op !== "select" && typeof window !== "undefined") window.alert(message);
      return { data: null, error: { message } };
    }
    return { data: res.data.data, error: null };
  }

  then<R1 = Result, R2 = never>(onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
                                onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

/** Drop-in replacement for `supabase.from(...)` on the Admin and Accounts pages. */
export const adminDb = { from: (table: string) => new Query(table) };

export async function adminSignOut() {
  await adminFetch("/api/admin/logout", { body: {} });
  window.location.href = "/admin/login";
}
