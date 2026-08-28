// ====================================================
// SECURE AUTHENTICATION STATE WATCHER
// ====================================================

// Check session on load and set up listener
document.addEventListener('DOMContentLoaded', () => {
  if (!supabaseClient) return;

  const currentPath = window.location.pathname;
  const isAuthPage = currentPath.includes('login.html') || currentPath.includes('register.html') || currentPath.endsWith('/') || currentPath.includes('index.html');
  const isAppPage = currentPath.includes('app.html');
  const isAdminPage = currentPath.includes('admin.html');

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log(`[Auth Event] ${event}`, session ? 'User logged in' : 'No user');

    if (session) {
      const userId = session.user.id;

      // Handle suspended users immediately
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('status')
        .eq('id', userId)
        .single();

      if (profile && profile.status === 'suspended') {
        alert("Your account has been suspended.");
        await supabaseClient.auth.signOut();
        window.location.href = './login.html';
        return;
      }

      // Check admin status
      const { data: isAdmin } = await supabaseClient
        .from('admin_users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (isAuthPage) {
        // Logged in user tries to visit login/register/landing
        if (isAdmin) {
          window.location.href = './admin/index.html';
        } else {
          window.location.href = './app.html';
        }
      } else if (isAdminPage && !isAdmin) {
        // Non-admin tries to visit admin dashboard
        window.location.href = './app.html';
      }
    } else {
      // User is not logged in
      if (isAppPage || isAdminPage) {
        window.location.href = './login.html';
      }
    }
  });
});

// Global Logout function
async function logoutUser() {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    window.location.href = './login.html';
  } catch (err) {
    console.error("Logout error:", err);
  }
}
