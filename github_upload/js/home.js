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
      if (profile.wallet_address) {
        localStorage.setItem('user_refund_payout_address', profile.wallet_address);
      }
      const usernameEl = document.getElementById('header-username');
      if (usernameEl) usernameEl.innerText = profile.full_name || 'USDT Trader';
      const initial = profile.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U';
      const avatarEl = document.getElementById('header-avatar');
      if (avatarEl) avatarEl.innerText = initial;
    }

    // 2. Load User's Approved Task Submissions (in 30-minute processing countdown)
    // NOTE: Tasks with 'pending' status (unapproved by admin) are strictly NOT counted until admin confirms USDT arrived!
    const { data: approvedSubs } = await sb
      .from('task_submissions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['approved', 'refund_pending']);

    let pendingPrincipal = 0;
    let pendingBonus = 0;
    if (approvedSubs && approvedSubs.length > 0) {
      approvedSubs.forEach(sub => {
        const amt = parseFloat(sub.amount || 0);
        const b = parseFloat(sub.bonus_amount || (amt * 0.045));
        pendingPrincipal += amt;
        pendingBonus += b;
      });
    }
    const pendingRefundTotal = pendingPrincipal + pendingBonus;

    // 3. Load Referral / Cashback Bonus Balance from wallet_transactions
    let totalBonusEarned = 0;
    try {
      const { data: bonusData } = await sb
        .from('wallet_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'bonus');

      if (bonusData && bonusData.length > 0) {
        totalBonusEarned = bonusData.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
      }
    } catch (e) {}

    // 4. Combined Total Active Balance (Approved Processing Refunds + Referral/Bonus Balance)
    const totalDisplayBalance = pendingRefundTotal + totalBonusEarned;
    animateCounter('home-balance', totalDisplayBalance, '$');

    // Update the bonus box (shows real cashback + referral bonus, not duplicate of balance!)
    const bonusEl = document.getElementById('home-bonus');
    if (bonusEl) {
      const allBonus = pendingBonus + totalBonusEarned;
      bonusEl.innerText = `+$${allBonus.toFixed(2)}`;
    }

    // Update dynamic subtitle
    const subtitleEl = document.querySelector('.balance-card-subtitle');
    if (subtitleEl) {
      subtitleEl.innerText = pendingRefundTotal > 0 ? 'Processing Refund Balance' : 'Total Portfolio Balance';
    }

    // Update Payout Status indicator cleanly without emojis
    const payoutStatusEl = document.getElementById('home-payout-status');
    if (payoutStatusEl) {
      if (pendingRefundTotal > 0) {
        payoutStatusEl.innerHTML = `<span style="color:#00e5ff; font-weight:800; display:inline-flex; align-items:center; gap:5px;"><span style="width:6px; height:6px; border-radius:50%; background:#00e5ff; box-shadow:0 0 6px #00e5ff;"></span>Processing</span>`;
      } else {
        payoutStatusEl.innerHTML = `<span style="color:#00e676; font-weight:800;">Active ✓</span>`;
      }
    }

    // 5. Load Completed / Refunded Tasks Count
    const { count: completedCount } = await sb
      .from('task_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'refunded');

    const tasksEl = document.getElementById('home-tasks-completed');
    if (tasksEl) tasksEl.innerText = `${completedCount || 0}`;

    // 6. Load Task History & Live Progress
    await loadTaskHistory(user.id);

  } catch (err) {
    console.error("Home loader error:", err);
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

      const usdtBonusAmt = parseFloat(sub.amount) * 0.045;
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
        statusBadge = `<span class="badge pending" style="background:rgba(255,171,0,0.15); color:#ffab00; border:1px solid rgba(255,171,0,0.3); border-radius:6px; padding:2px 8px; font-size:10.5px; font-weight:800;">Verifying</span>`;
        const maxMins = 30;
        const endTimeMs = new Date(sub.submitted_at).getTime() + (maxMins * 60 * 1000);
        timerHtml = `<p style="font-size:11px; margin-top:4px;"><span class="task-countdown" data-endtime="${endTimeMs}">Calculating...</span></p>`;
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
