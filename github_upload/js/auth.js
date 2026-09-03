// ====================================================
// SECURE AUTHENTICATION STATE WATCHER
// ====================================================

// Check session on load and set up listener
document.addEventListener('DOMContentLoaded', () => {
  if (!supabaseClient) return;

  checkMaintenanceModeOnAllPages();
  setInterval(checkMaintenanceModeOnAllPages, 10000);

  // Global Referral Tracker: Persist referral code to localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref') || urlParams.get('referrer');
  if (refCode) {
    localStorage.setItem('referred_by_code', refCode.toUpperCase());
  }

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

async function checkMaintenanceModeOnAllPages() {
  if (!supabaseClient) return;
  try {
    const { data } = await supabaseClient
      .from('app_settings')
      .select('maintenance_mode')
      .limit(1)
      .maybeSingle();

    if (data && data.maintenance_mode === true) {
      // If currently on admin panel, do not show user maintenance screen
      if (window.location.pathname.includes('/admin/')) return;

      // Show maintenance overlay on landing/auth/app pages
      let overlay = document.getElementById('maintenance-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'maintenance-overlay';
        overlay.style.cssText = `
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: #08090d; z-index: 999999; display: flex;
          flex-direction: column; gap: 18px; text-align: center;
          padding: 32px 24px; justify-content: center; box-sizing: border-box;
        `;
        overlay.innerHTML = `
          <div style="width: 80px; height: 80px; background: rgba(0, 229, 255, 0.1); border: 2px solid #00e5ff; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; box-shadow: 0 0 30px rgba(0, 229, 255, 0.35);">
            <span style="font-size: 42px;">🚀</span>
          </div>
          <div>
            <h2 style="font-weight: 900; color: #ffffff; font-size: 22px; margin: 0 0 8px 0; letter-spacing: 0.5px;">System Upgrade in Progress...</h2>
            <span style="background: rgba(0, 230, 118, 0.15); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.3); font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 20px; display: inline-block;">Resuming Very Shortly</span>
          </div>
          <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 18px; max-width: 340px; margin: 0 auto;">
            <p style="color: #e0e0e0; font-size: 13.5px; line-height: 1.7; margin: 0; font-weight: 500;">
              Dear user, scheduled system improvements and blockchain node updates are underway. Please check back shortly.
              <br><br>
              Thank you for choosing our platform!
            </p>
          </div>
          <div style="font-size: 12px; color: #a0a5b5; font-weight: 700; margin-top: 8px;">
            US - Link Official Platform • Always Secure
          </div>
        `;
        document.body.appendChild(overlay);
      }
      overlay.style.display = 'flex';
    }
  } catch (err) {
    console.error("Maintenance check error:", err);
  }
}
