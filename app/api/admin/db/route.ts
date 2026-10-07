import { handle, json, readJson, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/adminAuth";
import { db, audit } from "@/lib/server/db";

// Server-side data access for the Admin and Accounts pages. The browser asks
// for a narrow set of operations; this route checks the admin session, only
// allows the tables/columns below, runs the query with the service role and
// writes every change to the audit log.

type Op = "select" | "insert" | "update" | "upsert" | "delete";
interface Filter { column: string; value: string | number | boolean | null }
interface DbRequest {
  table: string;
  op: Op;
  columns?: string;
  filters?: Filter[];
  order?: { column: string; ascending?: boolean };
  values?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
}

const ORDER_EDITABLE = ["name", "phone", "email", "address", "notes", "total", "fulfillment", "status", "delivery_area", "payment_method"];
const PAYMENT_METHODS = ["cash_on_delivery", "cash_on_collection", "bank_transfer", "online_provider"];

const POLICY: Record<string, { ops: Op[]; writable?: string[]; filterable: string[] }> = {
  orders:   { ops: ["select", "update", "delete"], writable: ORDER_EDITABLE, filterable: ["id", "status", "school_event_id"] },
  accounts: { ops: ["select", "insert", "update", "delete"],
              writable: ["type", "category", "description", "amount", "date", "payment_method", "receipt_number", "supplier", "notes"],
              filterable: ["id", "type", "category"] },
  settings: { ops: ["select", "upsert"], writable: ["key", "value"], filterable: ["key"] },
  reviews:  { ops: ["select", "update", "delete"], writable: ["approved"], filterable: ["id", "approved"] },
  payments: { ops: ["select"], filterable: ["order_id"] },
};

const IDENT = /^[a-z_]+$/;

function pick(values: Record<string, unknown>, allowed: string[]) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!allowed.includes(k)) throw new HttpError(400, `Field "${k}" cannot be changed here.`);
    out[k] = v;
  }
  return out;
}

export const POST = handle(async (req: Request) => {
  const admin = await requireAdmin(req);
  const body = await readJson<DbRequest>(req, 256_000);
  const policy = POLICY[body.table];
  if (!policy || !policy.ops.includes(body.op)) throw new HttpError(403, "Not allowed.");

  const filters = body.filters ?? [];
  for (const f of filters) {
    if (!policy.filterable.includes(f.column)) throw new HttpError(400, "Not allowed.");
  }
  // Supabase's query-builder generics don't survive dynamic table names.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (q: any) => filters.reduce((acc, f) => acc.eq(f.column, f.value), q);

  const client = db();

  if (body.op === "select") {
    const columns = body.columns && /^[a-z_*, ]+$/.test(body.columns) ? body.columns : "*";
    let q = applyFilters(client.from(body.table).select(columns));
    if (body.order && IDENT.test(body.order.column)) q = q.order(body.order.column, { ascending: body.order.ascending !== false });
    const { data, error } = await q.limit(5000);
    if (error) throw new HttpError(400, "Could not load data.");
    return json({ data });
  }

  // Every write below targets rows by id (or settings by key).
  const idFilter = filters.find(f => f.column === "id");
  if ((body.op === "update" || body.op === "delete") && (!idFilter || filters.length !== 1)) {
    throw new HttpError(400, "Changes must target a single record.");
  }

  if (body.op === "insert") {
    const rows = (Array.isArray(body.values) ? body.values : [body.values ?? {}]).map(v => pick(v, policy.writable!));
    if (rows.length === 0 || rows.length > 100) throw new HttpError(400, "Nothing to save.");
    const { data, error } = await client.from(body.table).insert(rows).select("*");
    if (error) throw new HttpError(400, "Could not save.");
    for (const row of data ?? []) {
      await audit({ actor: admin.email, action: `${body.table}.created`, entityType: body.table, entityId: String(row.id), after: row });
    }
    return json({ data });
  }

  if (body.op === "upsert") {
    const rows = (Array.isArray(body.values) ? body.values : [body.values ?? {}]).map(v => pick(v, policy.writable!));
    const keys = rows.map(r => String(r.key));
    const { data: before } = await client.from(body.table).select("*").in("key", keys);
    const { data, error } = await client.from(body.table).upsert(rows, { onConflict: "key" }).select("*");
    if (error) throw new HttpError(400, "Could not save.");
    const changed = (data ?? []).filter(r => (before ?? []).find(b => b.key === r.key)?.value !== r.value);
    if (changed.length) {
      await audit({ actor: admin.email, action: "settings.updated", entityType: "settings",
        before: Object.fromEntries((before ?? []).filter(b => changed.some(c => c.key === b.key)).map(b => [b.key, b.value])),
        after: Object.fromEntries(changed.map(c => [c.key, c.value])) });
    }
    return json({ data });
  }

  const id = idFilter!.value;
  const { data: before } = await client.from(body.table).select("*").eq("id", id).maybeSingle();
  if (!before) throw new HttpError(404, "Record not found.");

  if (body.op === "delete") {
    if (body.table === "orders") {
      if (before.school_event_id) throw new HttpError(409, "School-event orders cannot be deleted. Cancel the order instead.");
      const { count } = await client.from("payments").select("id", { count: "exact", head: true }).eq("order_id", id);
      if (count) throw new HttpError(409, "This order has recorded payments and cannot be deleted. Cancel or refund it instead.");
    }
    const { error } = await client.from(body.table).delete().eq("id", id);
    if (error) throw new HttpError(400, "Could not delete.");
    await audit({ actor: admin.email, action: `${body.table}.deleted`, entityType: body.table, entityId: String(id), before });
    return json({ data: null });
  }

  // update
  const values = pick((body.values ?? {}) as Record<string, unknown>, policy.writable!);
  if (body.table === "orders") {
    if ("payment_method" in values && !PAYMENT_METHODS.includes(String(values.payment_method))) throw new HttpError(400, "Invalid payment method.");
    if ("total" in values && (!Number.isFinite(Number(values.total)) || Number(values.total) < 0)) throw new HttpError(400, "Invalid total.");
    if ("fulfillment" in values && !["pickup", "delivery"].includes(String(values.fulfillment))) throw new HttpError(400, "Invalid fulfilment.");
  }
  let newStatus: string | undefined;
  if (body.table === "orders" && "status" in values) {
    newStatus = String(values.status);
    delete values.status;
  }
  if (Object.keys(values).length) {
    const { error } = await client.from(body.table).update(values).eq("id", id);
    if (error) {
      if ((error.message || "").includes("locked")) throw new HttpError(409, "School-event order items and totals are locked.");
      throw new HttpError(400, "Could not save.");
    }
  }
  if (newStatus !== undefined && newStatus !== before.status) {
    const { error } = await client.rpc("set_order_status", {
      p_order_id: String(id), p_status: newStatus, p_actor: admin.email, p_reason: "Changed in Admin",
    });
    if (error) throw new HttpError(400, "Could not change the status.");
  }
  if (body.table === "orders" && ("total" in values || "payment_method" in values)) {
    await client.rpc("recalculate_order_payment", { p_order_id: String(id) });
  }
  const { data: after } = await client.from(body.table).select("*").eq("id", id).maybeSingle();
  if (Object.keys(values).length) {
    await audit({ actor: admin.email, action: `${body.table}.updated`, entityType: body.table, entityId: String(id),
      before: Object.fromEntries(Object.keys(values).map(k => [k, before[k]])),
      after: Object.fromEntries(Object.keys(values).map(k => [k, after?.[k]])) });
  }
  return json({ data: after ? [after] : [] });
});
