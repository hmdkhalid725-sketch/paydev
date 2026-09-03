// ====================================================
// DYNAMIC PWA DOCK PROMPT & INSTALLER CONTROLLER
// ====================================================

let deferredPrompt;

// Check if currently running inside the installed PWA
function isAppRunningStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://') ||
         sessionStorage.getItem('is_pwa_session') === 'true' ||
         new URLSearchParams(window.location.search).get('mode') === 'pwa';
}

// Function to hide all PWA install prompts and buttons when inside the app
function applyPwaVisibilityRules() {
  const isStandalone = isAppRunningStandalone();
  if (isStandalone) {
    sessionStorage.setItem('is_pwa_session', 'true');
    const pwaPrompt = document.getElementById('pwa-custom-install-prompt');
    if (pwaPrompt) pwaPrompt.remove();
    
    document.querySelectorAll('.hide-in-pwa').forEach(el => {
      el.style.setProperty('display', 'none', 'important');
    });
  }
}

// Apply on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyPwaVisibilityRules);
} else {
  applyPwaVisibilityRules();
}

// Listen for PWA install eligibility (only fired in regular browser when not installed)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  if (isAppRunningStandalone()) return;

  // Show custom PWA install banner / prompt if not dismissed in this session
  if (!sessionStorage.getItem('pwa-prompt-dismissed')) {
    showPWAInstallPrompt();
  }
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  sessionStorage.setItem('is_pwa_session', 'true');
  localStorage.setItem('app_installed_mode', 'true');
  applyPwaVisibilityRules();
});

// Trigger install from button in app
function triggerPwaInstallFromApp() {
  const promptEvt = window.deferredPrompt || deferredPrompt;

  if (promptEvt) {
    promptEvt.prompt();
    promptEvt.userChoice.then(({ outcome }) => {
      if (outcome === 'accepted') {
        sessionStorage.setItem('is_pwa_session', 'true');
        localStorage.setItem('app_installed_mode', 'true');
        applyPwaVisibilityRules();
        if (typeof showToast === 'function') {
          showToast('US-Link app installed to Home Screen successfully! ✓', 'success');
        }
      }
      window.deferredPrompt = null;
      deferredPrompt = null;
    });
    return;
  }

  // If already running standalone
  if (isAppRunningStandalone()) {
    if (typeof showToast === 'function') {
      showToast('App is already installed on your Home Screen! ✓', 'success');
    }
    applyPwaVisibilityRules();
    return;
  }

  // Clean toast
  if (typeof showToast === 'function') {
    showToast('Installing US-Link to your Home Screen...', 'info');
  }
}

function showPWAInstallPrompt() {
  // Prevent duplicate prompt injections
  if (document.getElementById('pwa-custom-install-prompt')) return;

  const style = document.createElement('style');
  style.id = 'pwa-install-prompt-style';
  style.innerHTML = `
    .pwa-prompt-container {
      position: fixed;
      bottom: 24px;
      left: 16px;
      right: 16px;
      background: #11141b;
      border: 1px solid rgba(0, 229, 255, 0.18);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 12px 36px rgba(0,0,0,0.6);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      animation: pwa-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      max-width: 420px;
      margin: 0 auto;
      box-sizing: border-box;
    }
    @keyframes pwa-slide-up {
      from { transform: translateY(140%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .pwa-prompt-text {
      flex: 1;
      min-width: 0;
    }
    .pwa-prompt-title {
      font-size: 13.5px;
      font-weight: 800;
      color: #fff;
      margin: 0 0 2px 0;
    }
    .pwa-prompt-desc {
      font-size: 11px;
      color: #a0a5b5;
      margin: 0;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pwa-prompt-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .pwa-btn-close {
      background: none;
      border: none;
      color: #707585;
      font-size: 15px;
      cursor: pointer;
      padding: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pwa-btn-install {
      background: linear-gradient(135deg, #00e5ff 0%, #00b0ff 100%);
      color: #000;
      border: none;
      border-radius: 10px;
      padding: 9px 16px;
      font-size: 12.5px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,229,255,0.25);
      white-space: nowrap;
      transition: transform 0.1s active;
    }
    .pwa-btn-install:active {
      transform: scale(0.95);
    }
  `;
  document.head.appendChild(style);

  const html = `
    <div class="pwa-prompt-container" id="pwa-custom-install-prompt">
      <div style="font-size: 26px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">📱</div>
      <div class="pwa-prompt-text">
        <h4 class="pwa-prompt-title">Install US-Link App</h4>
        <p class="pwa-prompt-desc">Add to Home Screen for fast, one-tap access.</p>
      </div>
      <div class="pwa-prompt-actions">
        <button class="pwa-btn-install" id="pwa-custom-install-btn">Install</button>
        <button class="pwa-btn-close" id="pwa-custom-close-btn" aria-label="Close">✕</button>
      </div>
    </div>
  `;

  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div.firstElementChild);

  // Setup click triggers
  document.getElementById('pwa-custom-install-btn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to PWA prompt choice: ${outcome}`);
    deferredPrompt = null;
    hidePWAInstallPrompt();
  });

  document.getElementById('pwa-custom-close-btn').addEventListener('click', () => {
    hidePWAInstallPrompt();
    // Dismiss prompt for this tab session so it doesn't interrupt user again
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
  });
}

function hidePWAInstallPrompt() {
  const prompt = document.getElementById('pwa-custom-install-prompt');
  if (prompt) {
    prompt.style.animation = 'pwa-slide-up 0.3s reverse ease-in forwards';
    setTimeout(() => prompt.remove(), 300);
  }
}
