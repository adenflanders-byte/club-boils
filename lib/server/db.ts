import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "./env";

let cached: SupabaseClient | null = null;

/**
 * Supabase client using the SERVICE ROLE key. Server-only: it bypasses Row
 * Level Security, so it must never be imported by a client component.
 */
export function db(): SupabaseClient {
  if (cached) return cached;
  const env = serverEnv();
  cached = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}

export async function audit(entry: {
  actor: string; action: string; entityType: string; entityId?: string | null;
  before?: unknown; after?: unknown; meta?: unknown;
}) {
  const { error } = await db().from("audit_log").insert({
    actor: entry.actor, action: entry.action, entity_type: entry.entityType, entity_id: entry.entityId ?? null,
    before: entry.before ?? null, after: entry.after ?? null, meta: entry.meta ?? null,
  });
  if (error) console.error("[audit] failed to write audit entry", error.code);
}

/** Returns true if the bucket is under its limit. */
export async function rateLimitAllowed(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await db().rpc("rate_limit_allowed", { p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds });
  if (error) { console.error("[rate-limit] check failed", error.code); return false; }
  return data === true;
}
export async function rateLimitRecord(bucket: string) {
  const { error } = await db().rpc("rate_limit_record", { p_bucket: bucket });
  if (error) console.error("[rate-limit] record failed", error.code);
}
