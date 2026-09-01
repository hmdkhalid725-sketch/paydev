// ====================================================
// CORE SPA ROUTER AND TAB SWITCHER CONTROLLER
// ====================================================

document.addEventListener('DOMContentLoaded', () => {
  // Check auth and credentials first
  if (!supabaseClient) return;

  initApp();
});

async function initApp() {
  setupNavigation();
  setupNotificationsDrawer();
  setupGlobalListeners();
  
  // Load initial tab data (Home)
  showSpinner(true);
  try {
    // 1. Check if session is already recovered
    let { data: { session } } = await supabaseClient.auth.getSession();
    
    // 2. If session is still loading/restoring, wait for onAuthStateChange
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
      await loadGlobalSettings();
      await refreshCurrentTabData('home');
      updateLastActive(session.user.id);
      setInterval(() => updateLastActive(session.user.id), 90000);
      listenNotifications(); // Start realtime listener
      showAnnouncementNotice(); // Show notice popup on entry
    } else {
      console.warn("No auth session found during initialization.");
    }
  } catch (err) {
    console.error("Initial load error:", err);
  } finally {
    showSpinner(false);
  }
}

// Switch between tabs dynamically
function setupNavigation() {
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', async (e) => {
      const targetTab = item.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Home Quick Action Links redirection
  document.getElementById('action-tasks').addEventListener('click', () => switchTab('tasks'));
  document.getElementById('action-wallet').addEventListener('click', () => switchTab('wallet'));
  document.getElementById('action-support').addEventListener('click', openSupportContact);
  document.getElementById('view-activities-link').addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('wallet');
  });
}

async function switchTab(tabId) {
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
    case 'profile':
      if (typeof loadProfileData === 'function') await loadProfileData();
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

  bellBtn.addEventListener('click', () => {
    drawer.classList.add('active');
    markAllNotificationsRead();
  });

  closeBtn.addEventListener('click', () => {
    drawer.classList.remove('active');
    loadNotifications(); // Reload badge status
  });
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
  window.open('https://t.me/devpaysupport', '_blank');
}

// Global UI Spinner helpers
function showSpinner(show) {
  const spinner = document.getElementById('spinner-overlay');
  if (spinner) spinner.classList.toggle('active', show);
}

// Show announcement/notice popup overlay on load
function showAnnouncementNotice() {
  const modal = document.getElementById('modal-overlay-notice');
  const closeBtn = document.getElementById('btn-close-notice');
  const timerEl = document.getElementById('notice-timer');
  if (!modal || !closeBtn || !timerEl) return;

  // Show notice modal
  modal.classList.add('active');

  let secondsLeft = 5;
  timerEl.innerText = secondsLeft;

  let autoCloseTimer = setInterval(() => {
    secondsLeft--;
    if (timerEl) timerEl.innerText = secondsLeft;
    if (secondsLeft <= 0) {
      clearInterval(autoCloseTimer);
      modal.classList.remove('active');
    }
  }, 1000);

  // Close manually
  closeBtn.onclick = () => {
    clearInterval(autoCloseTimer);
    modal.classList.remove('active');
  };
}

// Global settings state
window.globalAppSettings = null;

async function loadGlobalSettings() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('app_settings')
      .select('*')
      .eq('id', true)
      .single();
      
    if (!error && data) {
      window.globalAppSettings = data;
      
      // Update Maintenance Mode UI
      const maintOverlay = document.getElementById('maintenance-overlay');
      if (maintOverlay) {
        if (data.maintenance_mode) {
          maintOverlay.style.display = 'flex';
        } else {
          maintOverlay.style.display = 'none';
        }
      }
    }
  } catch (err) {
    console.error("Error loading app settings:", err);
  }
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

