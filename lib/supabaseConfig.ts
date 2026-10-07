// Public Supabase connection details. The anon key is designed to be public:
// it can only do what Row Level Security allows (read settings and approved
// reviews, submit a review). Everything private goes through the server.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://sbgwgwelhphnwjsuemqf.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZ3dnd2VsaHBobndqc3VlbXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTQ0OTAsImV4cCI6MjA5NzI5MDQ5MH0.h7CNx0-ncHwvRMrb4h9gVtO-Q0twzxbpMeoiIcYRky4";
