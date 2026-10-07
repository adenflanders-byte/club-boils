import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabaseConfig";

// Browser client with the public key. After the RLS lockdown it can only
// read settings and approved reviews, and submit unapproved reviews.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
