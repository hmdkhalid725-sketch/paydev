// ====================================================
// HOME TAB DASHBOARD CONTROLLER
// ====================================================

async function loadHomeData() {
  if (!supabaseClient) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // 1. Load User Profile details
    const { data: profile, error: profileErr } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileErr) throw profileErr;

    // Update Header and Profile displays
    document.getElementById('header-username').innerText = profile.full_name;
    const initial = profile.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U';
    document.getElementById('header-avatar').innerText = initial;
    
    // 2. Load User Balance
    const { data: balance, error: balErr } = await supabaseClient
      .rpc('get_user_balance', { user_id: user.id });

    if (balErr) throw balErr;
    
    // Animate number counters
    animateCounter('home-balance', parseFloat(balance || 0), '৳');

    // 3. Load Bonus Earned
    const { data: bonusData, error: bonusErr } = await supabaseClient
      .from('wallet_transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('type', 'bonus');

    if (bonusErr) throw bonusErr;
    const totalBonus = bonusData.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    animateCounter('home-bonus', totalBonus, '৳');

    // 4. Load Tasks Completed Count
    const { count: completedCount, error: countErr } = await supabaseClient
      .from('task_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'refunded');

    if (countErr) throw countErr;
    document.getElementById('home-tasks-completed').innerText = completedCount || 0;

    // 5. Load Task History & Live Progress
    await loadTaskHistory(user.id);

  } catch (err) {
    console.error("Home loader error:", err);
    showToast("Failed to load dashboard data.", "error");
  }
}

// Fetch and render user's task submissions with countdowns
async function loadTaskHistory(userId) {
  try {
    const { data: submissions, error } = await supabaseClient
      .from('task_submissions')
      .select('*, tasks(title, payment_method, refund_max_minutes, bonus_amount)')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    const listContainer = document.getElementById('home-task-history-list');
    if (!listContainer) return;

    if (!submissions || submissions.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-text" style="color: var(--text-muted); font-size: 13px;">এখনও কোনো টাস্ক সম্পন্ন করা হয়নি।</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = '';
    submissions.forEach(sub => {
      const task = sub.tasks || { title: 'টাস্ক', payment_method: 'bKash', refund_max_minutes: 30, bonus_amount: 0 };
      const isBkash = task.payment_method === 'bKash';
      const logoPath = isBkash ? './assets/bkash-logo.png' : './assets/nagad-logo.png';
      
      const itemCard = document.createElement('div');
      itemCard.style.cssText = `
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        position: relative;
      `;

      // Status badges in Bengali
      let statusBadge = '';
      let timerHtml = '';

      if (sub.status === 'pending') {
        statusBadge = `<span class="badge pending">ভেরিফাই চলছে</span>`;
        const maxMins = task.refund_max_minutes || 30;
        const endTimeMs = new Date(sub.submitted_at).getTime() + (maxMins * 60 * 1000);
        timerHtml = `<p style="font-size:11px; margin-top:4px;"><span class="task-countdown" data-endtime="${endTimeMs}">হিসাব করা হচ্ছে...</span></p>`;
      } else if (sub.status === 'refund_pending') {
        statusBadge = `<span class="badge processing">রিফান্ড পেন্ডিং</span>`;
        const maxMins = task.refund_max_minutes || 30;
        const endTimeMs = new Date(sub.submitted_at).getTime() + (maxMins * 60 * 1000);
        timerHtml = `<p style="font-size:11px; margin-top:4px;"><span class="task-countdown" data-endtime="${endTimeMs}">হিসাব করা হচ্ছে...</span></p>`;
      } else if (sub.status === 'refunded') {
        statusBadge = `<span class="badge active">সম্পন্ন হয়েছে ✓</span>`;
      } else if (sub.status === 'rejected') {
        statusBadge = `<span class="badge rejected">রিজেক্ট হয়েছে ✕</span>`;
        if (sub.admin_note) {
          timerHtml = `<p style="font-size:11px; color:var(--text-muted); margin-top:4px; line-height:1.3;">কারণ: <span style="color:var(--accent-red);">${sub.admin_note}</span></p>`;
        }
      }

      itemCard.innerHTML = `
        <img src="${logoPath}" alt="${task.payment_method}" style="width:40px; height:40px; object-fit:cover; border-radius:8px; border:1px solid rgba(255,255,255,0.08);">
        <div style="flex:1; min-width:0;">
          <h4 style="font-size:14px; font-weight:700; margin:0 0 4px 0; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${task.title}</h4>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span style="font-size:12px; color:var(--text-secondary);">বোনাস: ৳${parseFloat(task.bonus_amount).toFixed(0)}</span>
            <span style="color:var(--text-muted); font-size:11px;">•</span>
            <span style="font-size:11px; color:var(--text-muted);">${new Date(sub.submitted_at).toLocaleTimeString('bn-BD', {hour:'2-digit', minute:'2-digit'})}</span>
          </div>
          ${timerHtml}
        </div>
        <div style="text-align:right; flex-shrink:0; display:flex; flex-direction:column; gap:4px; align-items:flex-end;">
          <span style="font-size:14px; font-weight:800; color:#fff;">৳${parseFloat(sub.amount).toFixed(0)}</span>
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
        el.innerText = '⏳ যেকোনো মুহূর্তে সম্পন্ন হবে';
        el.style.color = 'var(--accent-cyan)';
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        
        // Convert numbers to Bengali
        const minutesBn = minutes.toLocaleString('bn-BD');
        const secondsBn = seconds.toLocaleString('bn-BD');
        
        el.innerText = `⏳ ${minutesBn} মিনিট ${secondsBn} সেকেন্ড বাকি`;
        el.style.color = 'var(--accent-orange)';
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
