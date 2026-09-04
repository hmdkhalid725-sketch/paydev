// ====================================================
// HOME TAB DASHBOARD CONTROLLER
// ====================================================

async function loadHomeData() {
  const sb = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
  if (!sb) return;

  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // 1. Load User Profile details
    const { data: profile } = await sb
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profile) {
      if (profile.usdt_address) {
        localStorage.setItem('user_deposit_sub_address', profile.usdt_address);
      }
      if (profile.wallet_address && profile.wallet_address.trim().length > 5) {
        localStorage.setItem('user_refund_payout_address', profile.wallet_address.trim());
      } else {
        localStorage.removeItem('user_refund_payout_address');
      }
      const usernameEl = document.getElementById('header-username');
      if (usernameEl) usernameEl.innerText = profile.full_name || 'USDT Trader';
      const initial = profile.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U';
      const avatarEl = document.getElementById('header-avatar');
      if (avatarEl) avatarEl.innerText = initial;
    }

    // 2. Load all task submissions for this user in a single robust query
    const { data: allSubs, error: subsErr } = await sb
      .from('task_submissions')
      .select('id, amount, status, bonus_amount')
      .eq('user_id', user.id);

    if (subsErr) {
      console.warn("Task submissions fetch warning:", subsErr.message);
    }

    let totalPortfolioBalance = 0;
    let pendingBonus = 0;
    let activeTaskCount = 0;
    let refundedCashback = 0;
    let refundedCount = 0;

    if (allSubs && allSubs.length > 0) {
      allSubs.forEach(sub => {
        const amt = parseFloat(sub.amount || 0);
        const b = parseFloat(sub.bonus_amount || (amt * 0.041));
        const status = (sub.status || '').toLowerCase();

        if (status === 'approved' || status === 'refund_pending') {
          totalPortfolioBalance += amt;
          pendingBonus += b;
          activeTaskCount++;
        } else if (status === 'refunded' || status === 'completed') {
          refundedCashback += b;
          refundedCount++;
        }
      });
    }

    animateCounter('home-balance', totalPortfolioBalance, '$');

    // Total Cashback Bonus = Active Pending Bonus + Already Refunded Bonus!
    const totalCashbackBonus = pendingBonus + refundedCashback;
    const bonusEl = document.getElementById('home-bonus');
    if (bonusEl) {
      bonusEl.innerText = `+$${totalCashbackBonus.toFixed(2)}`;
    }

    // Total Completed / Active Tasks
    const totalTasksCount = activeTaskCount + refundedCount;
    const tasksEl = document.getElementById('home-tasks-completed');
    if (tasksEl) {
      tasksEl.innerText = `${totalTasksCount}`;
    }

    // Update dynamic subtitle
    const subtitleEl = document.querySelector('.balance-card-subtitle');
    if (subtitleEl) {
      subtitleEl.innerText = totalPortfolioBalance > 0 ? 'Active Portfolio (Awaiting Refund)' : 'Total Portfolio Balance';
    }

    // Update Payout Status indicator cleanly without emojis
    const payoutStatusEl = document.getElementById('home-payout-status');
    if (payoutStatusEl) {
      if (totalPortfolioBalance > 0) {
        payoutStatusEl.innerHTML = `<span style="color:#00e5ff; font-weight:800; display:inline-flex; align-items:center; gap:5px;"><span style="width:6px; height:6px; border-radius:50%; background:#00e5ff; box-shadow:0 0 6px #00e5ff;"></span>Processing</span>`;
      } else {
        payoutStatusEl.innerHTML = `<span style="color:#00e676; font-weight:800;">Active ✓</span>`;
      }
    }

    // 6. Load Task History & Live Progress
    await loadTaskHistory(user.id);

    // 7. Start Realtime Auto-Sync for instant balance updates upon admin approval
    startHomeRealtimeSync(user.id);

  } catch (err) {
    console.error("Home loader error:", err);
  }
}

// Start Realtime Auto-Sync for Task Submissions on Home Tab
let homeRealtimeChannel = null;
function startHomeRealtimeSync(userId) {
  const sb = window.supabaseClient;
  if (!sb || !userId || homeRealtimeChannel) return;

  try {
    homeRealtimeChannel = sb
      .channel('public:task_submissions_home_' + userId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_submissions', filter: `user_id=eq.${userId}` },
        () => {
          loadHomeData();
        }
      )
      .subscribe();
  } catch (e) {
    console.warn("Realtime channel warning:", e);
  }

  // 8-second background polling while active on home tab
  if (!window._homePollInterval) {
    window._homePollInterval = setInterval(() => {
      if (typeof currentActiveTab !== 'undefined' && currentActiveTab === 'home') {
        loadHomeData();
      }
    }, 8000);
  }
}

// Fetch and render user's task submissions with countdowns
async function loadTaskHistory(userId) {
  try {
    let submissions = [];
    const { data, error } = await supabaseClient
      .from('task_submissions')
      .select('*')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false });
    
    if (error) {
      console.warn('Submissions query warning:', error.message);
    } else {
      submissions = data || [];
    }

    const listContainer = document.getElementById('home-task-history-list');
    if (!listContainer) return;

    if (!submissions || submissions.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-text" style="color: var(--text-muted); font-size: 13px;">No tasks completed yet.</p>
        </div>
      `;
      return;
    }

    listContainer.style.maxHeight = '440px';
    listContainer.style.overflowY = 'auto';
    listContainer.style.paddingRight = '4px';
    listContainer.style.display = 'flex';
    listContainer.style.flexDirection = 'column';
    listContainer.style.gap = '10px';

    listContainer.innerHTML = '';
    submissions.forEach(sub => {
      const task = sub.tasks || { title: 'USDT Deposit Task', payment_method: 'USDT', refund_max_minutes: 30, bonus_amount: 0 };
      const isUsdt  = true;
      let logoPath = './assets/usdt-logo.png';

      const usdtBonusAmt = parseFloat(sub.amount) * 0.041;
      const bonusDisplay = `+$${usdtBonusAmt.toFixed(2)} USDT`;
      const amountDisplay = `$${parseFloat(sub.amount || 0).toFixed(2)} USDT`;
      const titleDisplay = task.title && task.title !== 'Task' ? task.title : 'USDT (BEP20) Deposit Task';

      const itemCard = document.createElement('div');
      itemCard.style.cssText = `
        background: #121622;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        position: relative;
        flex-shrink: 0;
      `;

      // Status badges in English
      let statusBadge = '';
      let timerHtml = '';

      if (sub.status === 'pending') {
        const submitTs = new Date(sub.submitted_at || Date.now()).getTime();
        const elapsed = Date.now() - submitTs;
        if (elapsed >= 120000) {
          sub.status = 'rejected';
          sub.admin_note = 'Auto-rejected: No on-chain deposit detected within 2 minutes';
          statusBadge = `<span class="badge rejected" style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3); border-radius:6px; padding:2px 8px; font-size:10.5px; font-weight:800;">Rejected ✕</span>`;
          timerHtml = `<p style="font-size:11px; color:var(--text-muted); margin-top:4px; line-height:1.3;">Reason: <span style="color:var(--accent-red);">${sub.admin_note}</span></p>`;
        } else {
          const remSec = Math.max(0, Math.ceil((120000 - elapsed) / 1000));
          statusBadge = `<span class="badge pending" style="background:rgba(255,171,0,0.15); color:#ffab00; border:1px solid rgba(255,171,0,0.3); border-radius:6px; padding:2px 8px; font-size:10.5px; font-weight:800;">Verifying (${remSec}s)</span>`;
          timerHtml = `<p style="font-size:11px; margin-top:4px; color:#00e5ff;">Scanning BSC for incoming transfer...</p>`;
        }
      } else if (sub.status === 'approved' || sub.status === 'refund_pending') {
        statusBadge = `<span class="badge processing" style="background:rgba(0,229,255,0.15); color:#00e5ff; border:1px solid rgba(0,229,255,0.3); border-radius:6px; padding:2px 8px; font-size:10.5px; font-weight:800;">USD Processing</span>`;
        const maxMins = 30;
        const endTimeMs = new Date(sub.submitted_at).getTime() + (maxMins * 60 * 1000);
        timerHtml = `<p style="font-size:11px; margin-top:4px;"><span class="task-countdown" data-endtime="${endTimeMs}">Calculating...</span></p>`;
      } else if (sub.status === 'refunded' || sub.status === 'completed') {
        statusBadge = `<span class="badge active" style="background:rgba(0,230,118,0.15); color:#00e676; border:1px solid rgba(0,230,118,0.3); border-radius:6px; padding:2px 8px; font-size:10.5px; font-weight:800;">USD Sent ✓</span>`;
      } else if (sub.status === 'rejected') {
        statusBadge = `<span class="badge rejected" style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3); border-radius:6px; padding:2px 8px; font-size:10.5px; font-weight:800;">Rejected ✕</span>`;
        if (sub.admin_note) {
          timerHtml = `<p style="font-size:11px; color:var(--text-muted); margin-top:4px; line-height:1.3;">Reason: <span style="color:var(--accent-red);">${sub.admin_note}</span></p>`;
        }
      }

      itemCard.innerHTML = `
        <img src="${logoPath}" alt="USDT" style="width:36px; height:36px; object-fit:contain; border-radius:50%; background:rgba(0,0,0,0.3);">
        <div style="flex:1; min-width:0;">
          <h4 style="font-size:14px; font-weight:700; margin:0 0 4px 0; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${titleDisplay}</h4>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span style="font-size:12px; color:#00e676; font-weight:700;">Bonus: ${bonusDisplay}</span>
            <span style="color:var(--text-muted); font-size:11px;">•</span>
            <span style="font-size:11px; color:var(--text-muted);">${new Date(sub.submitted_at).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})}</span>
          </div>
          ${timerHtml}
        </div>
        <div style="text-align:right; flex-shrink:0; display:flex; flex-direction:column; gap:4px; align-items:flex-end;">
          <span style="font-size:14px; font-weight:800; color:#ffffff;">${amountDisplay}</span>
          ${statusBadge}
        </div>
      `;
      listContainer.appendChild(itemCard);
    });

    startGlobalCountdownTimer();

  } catch (err) {
    console.error("Task history load error:", err);
  }
}

// Global countdown logic updating active tasks progress
function startGlobalCountdownTimer() {
  if (window.countdownInterval) clearInterval(window.countdownInterval);

  window.countdownInterval = setInterval(() => {
    const now = Date.now();
    const elements = document.querySelectorAll('.task-countdown');

    if (elements.length === 0) {
      clearInterval(window.countdownInterval);
      return;
    }

    elements.forEach(el => {
      const endTime = parseInt(el.getAttribute('data-endtime'));
      const diff = endTime - now;

      if (diff <= 0) {
        el.innerText = 'Completing shortly...';
        el.style.color = '#00e5ff';
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        
        el.innerText = `${minutes}m ${seconds}s remaining`;
        el.style.color = '#00e676';
      }
    });
  }, 1000);
}

// Utility to animate count changes
function animateCounter(elementId, targetValue, prefix = '') {
  const el = document.getElementById(elementId);
  if (!el) return;

  const startValue = parseFloat(el.innerText.replace(/[^\d.-]/g, '')) || 0;
  const duration = 800; // ms
  const startTime = performance.now();

  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease-out quad function
    const easeProgress = progress * (2 - progress);
    const currentValue = startValue + (targetValue - startValue) * easeProgress;
    
    el.innerText = `${prefix}${currentValue.toFixed(2)}`;

    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    } else {
      el.innerText = `${prefix}${targetValue.toFixed(2)}`;
    }
  }

  requestAnimationFrame(updateCounter);
}

// ── PROMO BANNER CAROUSEL CONTROLLER ──────────────────────────────────────────
let currentPromoSlideIndex = 0;
let promoSliderInterval = null;

function switchPromoSlide(index) {
  const slides = document.querySelectorAll('.promo-banner-slide');
  const dots   = document.querySelectorAll('.promo-dot');
  if (slides.length === 0) return;

  currentPromoSlideIndex = (index + slides.length) % slides.length;

  slides.forEach((slide, i) => {
    slide.style.display = i === currentPromoSlideIndex ? 'block' : 'none';
  });

  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === currentPromoSlideIndex);
  });
}

function initPromoBannerAutoSlider() {
  if (promoSliderInterval) clearInterval(promoSliderInterval);
  promoSliderInterval = setInterval(() => {
    switchPromoSlide(currentPromoSlideIndex + 1);
  }, 4500);
}

document.addEventListener('DOMContentLoaded', () => {
  initPromoBannerAutoSlider();
});

window.switchPromoSlide = switchPromoSlide;
