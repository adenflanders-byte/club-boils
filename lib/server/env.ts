// Server-only configuration. Values come from Vercel environment variables
// and are read lazily so a missing variable fails the request, not the build.
import { SUPABASE_URL } from "../supabaseConfig";

export class ConfigError extends Error {}

export function serverEnv() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!serviceRoleKey) throw new ConfigError("SUPABASE_SERVICE_ROLE_KEY is not set");
  if (!sessionSecret || sessionSecret.length < 32) throw new ConfigError("SESSION_SECRET must be at least 32 characters");
  return {
    supabaseUrl: process.env.SUPABASE_URL || SUPABASE_URL,
    serviceRoleKey,
    sessionSecret,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
    isProduction: process.env.NODE_ENV === "production",
  };
}
