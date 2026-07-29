import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://sbgwgwelhphnwjsuemqf.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZ3dnd2VsaHBobndqc3VlbXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTQ0OTAsImV4cCI6MjA5NzI5MDQ5MH0.h7CNx0-ncHwvRMrb4h9gVtO-Q0twzxbpMeoiIcYRky4"
);
