import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Loud on purpose — a silently-missing env var is a confusing blank screen otherwise.
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Check your .env / Vercel env vars."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
