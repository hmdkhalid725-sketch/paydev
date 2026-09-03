// ====================================================
// CORE SPA ROUTER AND TAB SWITCHER CONTROLLER
// ====================================================

document.addEventListener('DOMContentLoaded', () => {
  // Check auth and credentials first
  if (!supabaseClient) return;

  initApp();
});

let currentActiveTab = 'home';

async function initApp() {
  setupNavigation();
  setupNotificationsDrawer();
  setupGlobalListeners();
  setupPullToRefresh();
  
  // Load initial tab data (Home)
  showSpinner(true);
  try {
    // 1. Load global settings & maintenance check first
    await loadGlobalSettings();

    // Start 15-second background maintenance status checker
    setInterval(loadGlobalSettings, 15000);

    // 2. Check if session is already recovered
    let { data: { session } } = await supabaseClient.auth.getSession();
    
    // 3. If session is still loading/restoring, wait for onAuthStateChange
    if (!session) {
      session = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1500); // 1.5s fallback timeout
        const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, currentSession) => {
          if (currentSession) {
            clearTimeout(timeout);
            subscription.unsubscribe();
            resolve(currentSession);
          }
        });
      });
    }

    if (session) {
      await refreshCurrentTabData('home');
      updateLastActive(session.user.id);
      setInterval(() => updateLastActive(session.user.id), 30000);
      listenNotifications(); // Start realtime listener
    } else {
      console.warn("No auth session found during initialization.");
    }
  } catch (err) {
    console.error("Initial load error:", err);
  } finally {
    showSpinner(false);
  }
}

// Update user's last_active_at timestamp in Supabase
async function updateLastActive(userId) {
  if (!supabaseClient || !userId) return;
  try {
    await supabaseClient
      .from('profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (err) {
    console.error("Failed to update last_active_at:", err);
  }
}

// Switch between tabs dynamically
function setupNavigation() {
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', async (e) => {
      const targetTab = item.getAttribute('data-tab');

      // If tapping Home tab while already on home, quietly refresh data with subtle feedback
      if (targetTab === 'home' && currentActiveTab === 'home') {
        const card = document.querySelector('.home-balance-banner-card');
        if (card) {
          card.style.transition = 'opacity 0.2s ease';
          card.style.opacity = '0.6';
          setTimeout(() => { card.style.opacity = '1'; }, 250);
        }
        refreshCurrentTabData('home');
        return;
      }

      switchTab(targetTab);
    });
  });

  // Home Quick Action Links redirection
  document.getElementById('action-tasks')?.addEventListener('click', () => switchTab('tasks'));
  document.getElementById('action-wallet')?.addEventListener('click', () => switchTab('wallet'));
  document.getElementById('action-support')?.addEventListener('click', openSupportContact);
  document.getElementById('view-activities-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('wallet');
  });
}

async function switchTab(tabId) {
  if (navigator.vibrate) navigator.vibrate(15);
  window.scrollTo(0, 0);
  const mainApp = document.querySelector('.app-main');
  if (mainApp) mainApp.scrollTop = 0;

  if (typeof closeSubmissionsHistoryModal === 'function') {
    closeSubmissionsHistoryModal();
  }

  // Always check global settings & maintenance mode when switching tabs
  const settings = await loadGlobalSettings();
  if (settings && settings.maintenance_mode) return;

  currentActiveTab = tabId;

  // Update active state in navigation
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(nav => {
    if (nav.getAttribute('data-tab') === tabId) {
      nav.classList.add('active');
    } else {
      nav.classList.remove('active');
    }
  });

  // Update active tab container view
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => {
    if (tab.id === `tab-${tabId}`) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Automatically hide floating support button and bottom nav when viewing support chat
  const floatingSupportBtn = document.getElementById('floating-support-btn');
  if (floatingSupportBtn) {
    floatingSupportBtn.style.display = (tabId === 'support') ? 'none' : 'flex';
  }

  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) {
    bottomNav.style.display = (tabId === 'support') ? 'none' : 'flex';
  }

  // Load target tab data
  showSpinner(true);
  try {
    await refreshCurrentTabData(tabId);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

async function refreshCurrentTabData(tabId) {
  switch(tabId) {
    case 'home':
      if (typeof loadHomeData === 'function') await loadHomeData();
      break;
    case 'tasks':
      if (typeof loadTasks === 'function') await loadTasks();
      break;
    case 'wallet':
      if (typeof loadWalletData === 'function') await loadWalletData();
      break;
    case 'referral':
      if (typeof loadReferralTabData === 'function') await loadReferralTabData();
      break;
    case 'profile':
      if (typeof loadProfileData === 'function') await loadProfileData();
      break;
    case 'support':
      if (typeof loadSupportMessages === 'function') await loadSupportMessages();
      break;
    case 'notifications':
      if (typeof loadNotifications === 'function') await loadNotifications();
      break;
  }
  // Always reload notifications unread badge
  if (typeof loadNotifications === 'function') await loadNotifications();
}

// Notifications drawer toggling
function setupNotificationsDrawer() {
  const bellBtn = document.getElementById('bell-btn');
  const drawer = document.getElementById('notifications-drawer');
  const closeBtn = document.getElementById('notifications-close-btn');

  if (bellBtn && !bellBtn.dataset.listenerWired) {
    bellBtn.dataset.listenerWired = 'true';
    bellBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (navigator.vibrate) navigator.vibrate(15);

      if (typeof openNotificationsModal === 'function') {
        openNotificationsModal();
      } else if (drawer) {
        drawer.classList.add('active');
      }
      if (typeof markAllNotificationsRead === 'function') markAllNotificationsRead();
    });
  }

  if (closeBtn && drawer) {
    closeBtn.addEventListener('click', () => {
      drawer.classList.remove('active');
      if (typeof loadNotifications === 'function') loadNotifications();
    });
  }
}

function setupGlobalListeners() {
  // Image uploader box actions
  const uploaderBox = document.getElementById('image-uploader-box');
  const fileInput = document.getElementById('submit-screenshot');

  if (uploaderBox && fileInput) {
    uploaderBox.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleScreenshotSelect);
  }

  // Backdrop click listener for task modal
  const taskModal = document.getElementById('modal-overlay-task');
  if (taskModal) {
    taskModal.addEventListener('click', (e) => {
      if (e.target === taskModal) {
        taskModal.classList.remove('active');
      }
    });
  }
}

// Clipboard copying utility
async function copyToClipboard(text, element) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = element.innerText;
    element.innerText = "Copied ✓";
    element.classList.add('copied');
    setTimeout(() => {
      element.innerText = originalText;
      element.classList.remove('copied');
    }, 1500);
  } catch (err) {
    showToast('Failed to copy', 'error');
  }
}

// Load support details dynamically
async function openSupportContact() {
  if (typeof openSupportChatModal === 'function') {
    openSupportChatModal();
  } else if (typeof toggleSupportChatModal === 'function') {
    toggleSupportChatModal();
  } else {
    window.open('https://t.me/uslinksupport', '_blank');
  }
}

// Global UI Spinner helpers
function showSpinner(show) {
  const spinner = document.getElementById('spinner-overlay');
  if (spinner) spinner.classList.toggle('active', show);
}

// Show announcement/notice popup overlay on load (Disabled per user request)
function showAnnouncementNotice() {
  return;
}

// Global settings state
window.globalAppSettings = null;

async function loadGlobalSettings() {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from('app_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      window.globalAppSettings = data;

      // Update Maintenance Mode UI
      const maintOverlay = document.getElementById('maintenance-overlay');
      if (maintOverlay) {
        if (data.maintenance_mode === true) {
          maintOverlay.style.display = 'flex';
        } else {
          maintOverlay.style.display = 'none';
        }
      }
      return data;
    }
  } catch (err) {
    console.error("Error loading app settings:", err);
  }
  return null;
}

// Track user activity timestamp
async function updateLastActive(userId) {
  if (!userId || !supabaseClient) return;
  try {
    await supabaseClient
      .from('profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (err) {
    console.error("Last active update error:", err);
  }
}

// Native Mobile Pull-To-Refresh for PWA & Mobile Web
function setupPullToRefresh() {
  const container = document.querySelector('.app-main');
  if (!container) return;

  let indicator = document.getElementById('pwa-pull-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'pwa-pull-indicator';
    indicator.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`;
    const appContainer = document.getElementById('app-container');
    if (appContainer) appContainer.appendChild(indicator);
  }

  let startY = 0;
  let currentY = 0;
  let isPulling = false;
  const threshold = 65;

  container.addEventListener('touchstart', (e) => {
    if (container.scrollTop <= 2) {
      startY = e.touches[0].pageY;
      isPulling = true;
    } else {
      isPulling = false;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!isPulling || container.scrollTop > 2) return;
    currentY = e.touches[0].pageY;
    const diff = currentY - startY;

    if (diff > 8) {
      const pullDistance = Math.min(diff * 0.45, 80);
      indicator.style.opacity = Math.min(diff / threshold, 1);
      indicator.style.top = `${pullDistance - 10}px`;
      const svg = indicator.querySelector('svg');
      if (svg) svg.style.transform = `rotate(${diff * 2.5}deg)`;
    }
  }, { passive: true });

  container.addEventListener('touchend', async () => {
    if (!isPulling) return;
    const diff = currentY - startY;
    isPulling = false;

    if (diff >= threshold && container.scrollTop <= 2) {
      indicator.classList.add('spinning');
      indicator.style.top = '22px';
      indicator.style.opacity = '1';
      if (navigator.vibrate) navigator.vibrate(12);

      try {
        await refreshCurrentTabData(currentActiveTab);
      } catch (err) {}

      setTimeout(() => {
        indicator.classList.remove('spinning');
        indicator.style.top = '-48px';
        indicator.style.opacity = '0';
      }, 400);
    } else {
      indicator.style.top = '-48px';
      indicator.style.opacity = '0';
    }
    startY = 0;
    currentY = 0;
  });
}

