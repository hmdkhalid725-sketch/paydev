// ====================================================
// SUPABASE CLIENT — ADMIN PANEL (Isolated)
// ====================================================

const SUPABASE_URL  = "https://zfngidcsyvrtkfwyench.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmbmdpZGNzeXZydGtmd3llbmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MzY2NTgsImV4cCI6MjEwMzUxMjY1OH0.SwoA8AuBLro63ditNmGYTSTXFX7C0Q-xGQY5Syb1yxo";

let supabaseClient = null;

try {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'devpay_admin_session'   // isolated from main site session
    }
  });
} catch (err) {
  console.error("Admin Supabase init failed:", err);
}
