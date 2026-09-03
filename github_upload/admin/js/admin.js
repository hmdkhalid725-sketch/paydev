// ====================================================
// DEVPAY ADMIN PANEL — ISOLATED CONTROLLER
// ====================================================

let currentPage = 'dashboard';
let allUsers = [];   // cached for search filtering

// ── INIT & AUTH VERIFICATION ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!supabaseClient) return;

  // Dedicated admin auth session verification
  showSpinner(true);
  try {
    // 1. Recover session
    let { data: { session } } = await supabaseClient.auth.getSession();
    
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

    if (!session) {
      window.location.href = './login.html';
      return;
    }

    const user = session.user;

    const { data: isAdmin } = await supabaseClient
      .from('admin_users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!isAdmin) {
      // Not admin: sign out and redirect to admin login
      await supabaseClient.auth.signOut();
      window.location.href = './login.html';
      return;
    }

    // Load admin profile in sidebar
    const { data: profile } = await supabaseClient.from('profiles').select('full_name').eq('id', user.id).single();
    if (profile) {
      document.getElementById('sidebar-name').innerText = profile.full_name || 'Admin';
      document.getElementById('sidebar-avatar').innerText = (profile.full_name || 'A').charAt(0).toUpperCase();
    }

    // Wire up sidebar navigation
    document.querySelectorAll('.nav-link[data-page]').forEach(link => {
      link.addEventListener('click', () => {
        navigateTo(link.getAttribute('data-page'));
        closeSidebar();
      });
    });

    // Wire up notification target toggle
    document.getElementById('notif-target').addEventListener('change', e => {
      document.getElementById('notif-phone-wrap').style.display = e.target.value === 'specific' ? 'block' : 'none';
    });

    // Wire up forms
    document.getElementById('settings-form').addEventListener('submit', saveSettings);
    document.getElementById('notif-form').addEventListener('submit', sendNotification);
    document.getElementById('make-admin-form').addEventListener('submit', makeAdmin);
    
    const p2pForm = document.getElementById('p2p-add-form');
    if (p2pForm) p2pForm.addEventListener('submit', addP2PQueueManual);

    // Toggle number on method change for new tasks
    document.getElementById('t-method').addEventListener('change', (e) => {
      const id = document.getElementById('t-id').value;
      if (!id && window.globalSettingsCached) {
        document.getElementById('t-number').value = window.globalSettingsCached.usdt_bep20_address || '';
      }
    });

    // Auto-calculate 8% bonus when amount is entered
    document.getElementById('t-amount').addEventListener('input', (e) => {
      const amt = parseFloat(e.target.value) || 0;
      if (amt > 0) {
        document.getElementById('t-bonus').value = (amt * 0.08).toFixed(2);
      }
    });

    // Initial load
    await navigateTo('dashboard');

  } catch (err) {
    console.error("Admin load error:", err);
    window.location.href = './login.html';
  } finally {
    showSpinner(false);
  }
});

// ── NAVIGATION ────────────────────────────────────────────────────────────────
async function navigateTo(page) {
  currentPage = page;

  // Update nav highlights
  document.querySelectorAll('.nav-link[data-page]').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Update page title
  const titles = {
    dashboard:     'Dashboard',
    submissions:   'Payment Submissions',
    refunds:       'Pending Refunds',
    withdrawals:   'Withdrawal Requests',
    tasks:         'Task Management',
    users:         'User Management',
    notifications: 'Notifications',
    support:       'Live Customer Support Desk',
    settings:      'Settings'
  };

  document.getElementById('page-title').innerText = titles[page] || 'Admin Panel';

  // Show page
  document.querySelectorAll('.page, .admin-page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');

  // Load data
  showSpinner(true);
  try {
    switch (page) {
      case 'dashboard':     await loadDashboard(); break;
      case 'submissions':   await loadSubmissions(); break;
      case 'refunds':       await loadRefunds(); break;
      case 'withdrawals':   await loadWithdrawals(); break;
      case 'tasks':         await loadTasks(); break;
      case 'users':         await loadUsers(); break;
      case 'notifications': await loadNotifications(); break;
      case 'support':       await loadSupportDesk(); break;
      case 'settings':      await loadSettings(); break;
    }
    await refreshBadges();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

function reloadCurrentPage() { navigateTo(currentPage); }

// ── BADGES (unread counts in nav) ─────────────────────────────────────────────
async function refreshBadges() {
  try {
    const [{ count: s }, { count: r }, { count: w }, { count: sup }] = await Promise.all([
      supabaseClient.from('task_submissions').select('*', { count: 'exact', head: true }).in('status', ['pending', 'under_review']),
      supabaseClient.from('task_submissions').select('*', { count: 'exact', head: true }).in('status', ['approved', 'refund_pending']),
      supabaseClient.from('withdrawals').select('*', { count: 'exact', head: true }).in('status', ['pending', 'processing']),
      supabaseClient.from('support_messages').select('*', { count: 'exact', head: true }).eq('sender_type', 'user').eq('is_read', false)
    ]);

    setBadge('badge-submissions', s);
    setBadge('badge-refunds', r);
    setBadge('badge-withdrawals', w);
    setBadge('badge-support', sup);
  } catch(_) {}
}

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count && count > 0) {
    el.style.display = 'inline-block';
    el.innerText = count > 99 ? '99+' : count;
  } else {
    el.style.display = 'none';
  }
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const [
    { count: totalUsers },
    { count: activeUsers },
    { count: pendingSub },
    { count: pendingRef },
    { count: pendingWdr },
    { count: doneTasks },
    { data: bonusData },
    { count: activeTasks }
  ] = await Promise.all([
    supabaseClient.from('profiles').select('*', { count: 'exact', head: true }),
    supabaseClient.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabaseClient.from('task_submissions').select('*', { count: 'exact', head: true }).in('status', ['pending', 'under_review']),
    supabaseClient.from('task_submissions').select('*', { count: 'exact', head: true }).eq('status', 'refund_pending'),
    supabaseClient.from('withdrawals').select('*', { count: 'exact', head: true }).in('status', ['pending', 'processing']),
    supabaseClient.from('task_submissions').select('*', { count: 'exact', head: true }).eq('status', 'refunded'),
    supabaseClient.from('wallet_transactions').select('amount').eq('type', 'bonus'),
    supabaseClient.from('tasks').select('*', { count: 'exact', head: true }).eq('is_active', true)
  ]);

  const totalBonus = (bonusData || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  document.getElementById('d-total-users').innerText = totalUsers ?? 0;
  document.getElementById('d-active-users').innerText = activeUsers ?? 0;
  document.getElementById('d-pending-sub').innerText = pendingSub ?? 0;
  document.getElementById('d-pending-ref').innerText = pendingRef ?? 0;
  document.getElementById('d-pending-wdr').innerText = pendingWdr ?? 0;
  document.getElementById('d-done-tasks').innerText = doneTasks ?? 0;
  document.getElementById('d-total-bonus').innerText = '$' + totalBonus.toFixed(2);
  document.getElementById('d-active-tasks').innerText = activeTasks ?? 0;

  // Recent 10 submissions
  let recent = null;
  try {
    const res = await supabaseClient
      .from('task_submissions')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(10);
    recent = res.data;
  } catch (e) {
    console.log('Recent submissions fetch notice:', e);
  }

  const wrap = document.getElementById('d-recent-wrap');
  if (!wrap) return;

  if (!recent || recent.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No submissions yet.</div>';
    return;
  }

  wrap.innerHTML = `<table class="data-table">
    <thead><tr><th>User</th><th>Task</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead>
    <tbody>
      ${recent.map(s => `
        <tr>
          <td><strong>${s.user_name || 'USDT User'}</strong><br><span style="color:var(--txt3);font-size:11px;">${s.user_id ? s.user_id.substring(0,8) + '...' : 'BEP20 Trader'}</span></td>
          <td>${s.task_title || 'USDT-BSC Deposit'}</td>
          <td style="color:var(--green);font-weight:700;">$${parseFloat(s.amount || 0).toFixed(2)} USDT</td>
          <td><span class="badge ${s.status || 'pending'}">${(s.status || 'pending').replace(/_/g,' ')}</span></td>
          <td style="color:var(--txt3);">${s.submitted_at ? timeAgo(s.submitted_at) : 'Just now'}</td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

// ── SUBMISSIONS ───────────────────────────────────────────────────────────────
async function loadSubmissions() {
  const filter = document.getElementById('sub-filter')?.value || 'pending,under_review';
  let statuses = filter.split(',');
  if (filter === 'all') {
    statuses = ['pending', 'under_review', 'approved', 'completed', 'refund_pending', 'refunded', 'rejected'];
  }

  let data = null;

  try {
    const res = await supabaseClient
      .from('task_submissions')
      .select('*')
      .order('submitted_at', { ascending: false });
    data = res.data;
  } catch (e) {
    console.log('Query error:', e);
  }

  const tbody = document.getElementById('submissions-tbody');
  if (!tbody) return;

  // Filter by selected dropdown status if not 'all'
  if (data && filter !== 'all') {
    data = data.filter(s => statuses.includes(s.status || 'pending'));
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">No submissions found.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(s => {
    const isPending = s.status === 'pending' || s.status === 'under_review';
    const isApproved = s.status === 'approved' || s.status === 'completed' || s.status === 'refunded';

    return `
    <tr>
      <td>
        <strong style="font-size:13px;">${s.user_name || 'USDT User'}</strong>
        <br><span style="color:var(--txt3);font-size:11px;">${s.user_id ? s.user_id.substring(0,8) + '...' : 'BEP20 Trader'}</span>
      </td>
      <td>${s.task_title || 'USDT-BSC Deposit'}</td>
      <td>${s.sender_number || 'USDT-BSC'}</td>
      <td style="font-family:monospace;font-size:12px;">${s.transaction_id || s.id}</td>
      <td style="color:var(--green);font-weight:700;">$${parseFloat(s.amount || 0).toFixed(2)} USDT</td>
      <td>
        ${s.screenshot_url
          ? `<img class="thumb" src="${s.screenshot_url}" onclick="openLightbox('${s.screenshot_url}')" alt="Receipt">`
          : `<span style="color:var(--txt3);font-size:11px;">BEP20 Order</span>`}
      </td>
      <td style="color:var(--txt3);font-size:12px;">${s.submitted_at ? timeAgo(s.submitted_at) : 'Just now'}</td>
      <td><span class="badge ${s.status || 'pending'}">${(s.status || 'pending').replace(/_/g,' ')}</span></td>
      <td>
        <div class="btn-group">
          ${isPending ? `
            <button class="btn btn-green" onclick="approveTaskSubmissionDirect('${s.id}')">✓ Approve</button>
            <button class="btn btn-red" onclick="rejectTaskSubmissionDirect('${s.id}')">✕ Reject</button>
          ` : `<span style="color:var(--green); font-size:12px; font-weight:700;">${isApproved ? '✓ Approved' : s.status}</span>`}
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function approveTaskSubmissionDirect(id) {
  showSpinner(true);
  try {
    // 1. Fetch submission details first
    const { data: sub } = await supabaseClient
      .from('task_submissions')
      .select('*')
      .eq('id', id)
      .single();

    // 2. Update status to 'approved'
    const { error } = await supabaseClient
      .from('task_submissions')
      .update({ 
        status: 'approved',
        admin_note: 'Deposit verified by Admin',
        submitted_at: sub?.submitted_at || new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('Update error:', error);
      toast('Error approving: ' + error.message, 'error');
      showSpinner(false);
      return;
    }

    // 3. Send automated in-app notification to the user
    if (sub && sub.user_id) {
      const amt = parseFloat(sub.amount || 10).toFixed(2);
      try {
        await supabaseClient.from('notifications').insert({
          user_id: sub.user_id,
          title: 'Deposit Verified • Payout Processing ⏱️',
          message: `Your deposit of $${amt} USDT has been verified. Status is now 'Deposit Received'. Automated refund processing is underway.`
        });
      } catch (ne) {
        console.log('Notification error:', ne);
      }
    }

    toast('Payment approved! Moved to Refunds queue ✓', 'success');
    await loadSubmissions();
    if (typeof loadRefunds === 'function') await loadRefunds();
    if (typeof loadDashboard === 'function') loadDashboard();
    if (typeof refreshBadges === 'function') refreshBadges();
  } catch (err) {
    console.error('Approve error:', err);
    toast('Error: ' + err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

async function rejectTaskSubmissionDirect(id) {
  showSpinner(true);
  try {
    const { error } = await supabaseClient
      .from('task_submissions')
      .update({ 
        status: 'rejected',
        admin_note: 'Rejected by Admin'
      })
      .eq('id', id);

    if (error) {
      console.error('Reject error:', error);
      toast('Error rejecting: ' + error.message, 'error');
      showSpinner(false);
      return;
    }

    toast('Submission rejected.', 'info');
    await loadSubmissions();
    if (typeof loadDashboard === 'function') loadDashboard();
    if (typeof refreshBadges === 'function') refreshBadges();
  } catch (err) {
    console.error('Reject error:', err);
  } finally {
    showSpinner(false);
  }
}

// ── REFUNDS ───────────────────────────────────────────────────────────────────
async function loadRefunds() {
  const filter = document.getElementById('refund-filter')?.value || 'pending_refunds';

  let data = [];
  try {
    const res = await supabaseClient
      .from('task_submissions')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (res.error) {
      console.error('Load refunds error:', res.error);
    } else {
      data = res.data || [];
    }
  } catch (err) {
    console.error('loadRefunds fetch exception:', err);
  }

  // Filter based on dropdown
  if (filter === 'pending_refunds') {
    data = data.filter(s => ['approved', 'refund_pending', 'processing'].includes(s.status));
  } else if (filter === 'refunded') {
    data = data.filter(s => s.status === 'refunded');
  }

  // Fetch profiles map for user details
  let profilesMap = {};
  const userIds = [...new Set(data.map(s => s.user_id).filter(Boolean))];
  if (userIds.length > 0) {
    try {
      const { data: profs } = await supabaseClient
        .from('profiles')
        .select('id, full_name, phone, usdt_address, private_key')
        .in('id', userIds);
      if (profs) {
        profs.forEach(p => { profilesMap[p.id] = p; });
      }
    } catch (pe) {
      console.log('Profiles map error:', pe);
    }
  }

  const tbody = document.getElementById('refunds-tbody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No refunds waiting in this queue 🎉</div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(s => {
    const prof = profilesMap[s.user_id] || {};
    const depositAmt = parseFloat(s.amount || 10);
    const bonusAmt = parseFloat(s.bonus_amount || (depositAmt * 0.041));
    const totalRefund = (depositAmt + bonusAmt).toFixed(2);
    const userWallet = prof.usdt_address || s.sender_number || 'BEP20 Address';
    const userName = prof.full_name || s.user_name || 'USDT Trader';
    const isRefunded = s.status === 'refunded' || s.status === 'completed';

    return `
      <tr>
        <td>
          <strong style="font-size:13px; color:#ffffff;">${escapeHtml(userName)}</strong>
          <br><span style="color:var(--txt3); font-size:11px;">${prof.phone || (s.user_id ? s.user_id.substring(0,8) + '...' : '')}</span>
        </td>
        <td style="color:#ffffff; font-weight:800;">$${depositAmt.toFixed(2)} USDT</td>
        <td style="color:var(--green); font-weight:800;">+$${bonusAmt.toFixed(2)} USDT</td>
        <td style="color:#00e5ff; font-weight:900; font-size:13.5px;">$${totalRefund} USDT</td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-family:monospace; font-size:11.5px; color:var(--cyan); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${userWallet}">
              ${userWallet}
            </span>
            <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${userWallet}'); toast('Address copied ✓', 'success');" style="padding:2px 6px; font-size:10px;">Copy</button>
            ${prof.private_key ? `<button class="btn btn-sm" onclick="openUserPrivateKeyModal('${s.user_id}', '${escapeHtml(userName)}', '${userWallet}', '${prof.private_key}')" style="padding:2px 6px; font-size:10px; background:rgba(255,193,7,0.15); border:1px solid rgba(255,193,7,0.3); color:#ffc107;" title="Export Private Key">🔑 Key</button>` : ''}
          </div>
        </td>
        <td style="font-family:monospace; font-size:11px; color:var(--txt3);">${s.transaction_id || s.id}</td>
        <td>
          <select class="form-control" onchange="changeSubmissionStatus('${s.id}', this.value)" style="padding:6px 8px; font-size:11.5px; font-weight:800; border-radius:8px; background:#11151f; color:#ffffff; border:1px solid rgba(255,255,255,0.15); width:auto;">
            <option value="approved" ${s.status === 'approved' ? 'selected' : ''}>Deposit Received</option>
            <option value="refund_pending" ${s.status === 'refund_pending' ? 'selected' : ''}>USD Processing</option>
            <option value="refunded" ${isRefunded ? 'selected' : ''}>USD Sent (Refunded)</option>
            <option value="rejected" ${s.status === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </td>
        <td>
          ${!isRefunded ? `
            <button class="btn btn-green" onclick="markSubmissionRefundedDirect('${s.id}', ${depositAmt}, ${bonusAmt}, '${s.user_id || ''}')" style="font-weight:900; font-size:12px; padding:7px 14px; white-space:nowrap; box-shadow:0 0 12px rgba(0,230,118,0.3);">
              ✓ Confirm Refunded
            </button>
          ` : `
            <span style="color:var(--green); font-size:12px; font-weight:800; display:inline-flex; align-items:center; gap:4px;">
              <span>✓ USD Sent</span>
            </span>
          `}
        </td>
      </tr>`;
  }).join('');
}

// Direct Status Change with Automated User Notifications
async function changeSubmissionStatus(submissionId, newStatus) {
  showSpinner(true);
  try {
    const { data: sub } = await supabaseClient
      .from('task_submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    const updatePayload = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };
    if (newStatus === 'refunded') {
      updatePayload.admin_note = 'Refund & bonus processed by admin';
      updatePayload.completed_at = new Date().toISOString();
    }

    let { error } = await supabaseClient
      .from('task_submissions')
      .update(updatePayload)
      .eq('id', submissionId);

    // Fail-safe fallback if schema cache hasn't synced
    if (error) {
      console.warn('Update with timestamps failed, using minimal payload:', error);
      const minRes = await supabaseClient
        .from('task_submissions')
        .update({ 
          status: newStatus,
          admin_note: newStatus === 'refunded' ? 'Refund & bonus processed by admin' : (sub?.admin_note || '')
        })
        .eq('id', submissionId);
      error = minRes.error;
    }

    if (error) throw error;

    toast(`Status updated to '${newStatus}' ✓`, 'success');
    await loadRefunds();
    await loadSubmissions();
    if (typeof refreshBadges === 'function') refreshBadges();
  } catch (err) {
    console.error('Status change error:', err);
    toast('Error: ' + err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// 1-Click Confirm Refunded Action
async function markSubmissionRefundedDirect(submissionId, depositAmount, bonusAmount, userId) {
  const total = (parseFloat(depositAmount) + parseFloat(bonusAmount)).toFixed(2);
  const ok = confirm(`Confirm Sending Refund & Bonus\n\nDeposit Amount: $${parseFloat(depositAmount).toFixed(2)} USDT\nCashback Bonus: +$${parseFloat(bonusAmount).toFixed(2)} USDT\nTotal to Send: $${total} USDT\n\nClick OK to confirm that USDT has been sent to the user's BEP20 address.`);
  if (!ok) return;

  await changeSubmissionStatus(submissionId, 'refunded');
}

// ── WITHDRAWALS ───────────────────────────────────────────────────────────────
async function loadWithdrawals() {
  const filter   = document.getElementById('wdr-filter')?.value || 'pending,processing';
  const statuses = filter.split(',');

  const { data, error } = await supabaseClient
    .from('withdrawals')
    .select('*, profiles(full_name, phone)')
    .in('status', statuses)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const tbody = document.getElementById('withdrawals-tbody');

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">No withdrawal requests found.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(w => `
    <tr>
      <td>
        <strong>${w.profiles?.full_name || '—'}</strong>
        <br><span style="color:var(--txt3);font-size:11px;">${w.profiles?.phone || ''}</span>
      </td>
      <td>${w.method}</td>
      <td style="color:var(--cyan);">${w.account_number}</td>
      <td style="color:var(--green);font-weight:800;">$${parseFloat(w.amount).toFixed(2)}</td>
      <td style="color:var(--txt3);font-size:12px;">${timeAgo(w.created_at)}</td>
      <td><span class="badge ${w.status}">${w.status}</span></td>
      <td>
        <div class="btn-group">
          ${(w.status === 'pending' || w.status === 'processing') ? `
            <button class="btn btn-green" onclick="payWithdrawal('${w.id}')">✓ Paid</button>
            <button class="btn btn-red" onclick="openRejectModal('${w.id}', 'withdrawal')">✕ Reject</button>
          ` : ''}
        </div>
      </td>
    </tr>`).join('');
}

async function payWithdrawal(id) {
  if (!confirm('Confirm you have physically transferred the funds?')) return;
  showSpinner(true);
  try {
    const { error } = await supabaseClient.rpc('admin_pay_withdrawal', {
      p_withdrawal_id: id,
      p_admin_note: 'Payment confirmed by admin.'
    });
    if (error) throw error;
    toast('Withdrawal marked as Paid ✓', 'success');
    await loadWithdrawals();
    await refreshBadges();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// ── REJECT (shared) ───────────────────────────────────────────────────────────
let _rejectTarget = null;
let _rejectType   = null;

function openRejectModal(id, type) {
  _rejectTarget = id;
  _rejectType   = type;
  document.getElementById('note-modal-title').innerText = type === 'withdrawal' ? 'Reject Withdrawal' : 'Reject Submission';
  document.getElementById('note-text').value = '';
  document.getElementById('note-confirm-btn').onclick = confirmReject;
  openModal('note-modal');
}

async function confirmReject() {
  const note = document.getElementById('note-text').value.trim();
  showSpinner(true);
  try {
    let error;
    if (_rejectType === 'withdrawal') {
      ({ error } = await supabaseClient.rpc('admin_reject_withdrawal', {
        p_withdrawal_id: _rejectTarget,
        p_admin_note: note || 'Rejected by admin.'
      }));
    } else {
      ({ error } = await supabaseClient.rpc('admin_reject_payment', {
        p_submission_id: _rejectTarget,
        p_admin_note: note || 'Rejected by admin.'
      }));
    }
    if (error) throw error;
    toast('Rejected successfully', 'info');
    closeModal('note-modal');
    if (_rejectType === 'withdrawal') await loadWithdrawals();
    else await loadSubmissions();
    await refreshBadges();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// ── TASKS ─────────────────────────────────────────────────────────────────────
async function loadTasks() {
  const { data, error } = await supabaseClient
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const tbody = document.getElementById('tasks-tbody');

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No tasks yet. Create your first task.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(t => {
    const badgeBg = 'rgba(0,230,118,0.15)';
    const badgeColor = '#00e676';
    const curPrefix = '$';
    const curSuffix = ' USDT';

    return `
    <tr>
      <td><strong>${t.title}</strong></td>
      <td><span class="badge" style="background:${badgeBg};color:${badgeColor};font-weight:800;">${t.payment_method}</span></td>
      <td style="color:var(--cyan);font-family:monospace;font-size:11.5px;">${t.payment_number}</td>
      <td style="color:var(--txt);font-weight:700;">${curPrefix}${parseFloat(t.payment_amount).toFixed(2)}${curSuffix}</td>
      <td style="color:var(--green);font-weight:700;">+${curPrefix}${parseFloat(t.bonus_amount).toFixed(2)}${curSuffix}</td>
      <td style="color:var(--txt3);">${t.refund_min_minutes}–${t.refund_max_minutes} min</td>
      <td><span class="badge ${t.is_active ? 'active' : 'rejected'}">${t.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div class="btn-group">
          <button class="btn btn-ghost" onclick="openTaskModal('${t.id}')">✏ Edit</button>
          <button class="btn btn-red" onclick="deleteTask('${t.id}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function openTaskModal(taskId = null) {
  document.getElementById('task-form').reset();
  document.getElementById('t-id').value = '';

  if (taskId) {
    document.getElementById('task-modal-title').innerText = 'Edit Task';
    showSpinner(true);
    try {
      const { data: t, error } = await supabaseClient.from('tasks').select('*').eq('id', taskId).single();
      if (error) throw error;
      document.getElementById('t-id').value         = t.id;
      document.getElementById('t-title').value      = t.title;
      document.getElementById('t-method').value     = t.payment_method;
      document.getElementById('t-active').value     = t.is_active.toString();
      document.getElementById('t-number').value     = t.payment_number;
      document.getElementById('t-amount').value     = t.payment_amount;
      document.getElementById('t-bonus').value      = t.bonus_amount;
      document.getElementById('t-min').value        = t.refund_min_minutes;
      document.getElementById('t-max').value        = t.refund_max_minutes;
      document.getElementById('t-instructions').value = t.instructions;
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      showSpinner(false);
    }
  } else {
    document.getElementById('task-modal-title').innerText = 'Create Task';
    try {
      const { data: settings } = await supabaseClient.from('app_settings').select('usdt_bep20_address').eq('id', true).single();
      if (settings) {
        window.globalSettingsCached = settings;
        document.getElementById('t-number').value = settings.usdt_bep20_address || '';
      }
    } catch (err) {
      console.error("Failed to load BEP20 address for task template:", err);
    }
  }

  openModal('task-modal');
}

function closeTaskModal() { closeModal('task-modal'); }

async function saveTask() {
  const id     = document.getElementById('t-id').value;
  const title  = document.getElementById('t-title').value.trim();
  const method = document.getElementById('t-method').value;
  const active = document.getElementById('t-active').value === 'true';
  const number = document.getElementById('t-number').value.trim();
  const amount = parseFloat(document.getElementById('t-amount').value);
  const bonus  = parseFloat(document.getElementById('t-bonus').value);
  const minT   = parseInt(document.getElementById('t-min').value);
  const maxT   = parseInt(document.getElementById('t-max').value);
  const instr  = document.getElementById('t-instructions').value.trim();

  if (!title || !number || isNaN(amount) || isNaN(bonus)) {
    toast('Please fill in all required fields', 'error');
    return;
  }

  showSpinner(true);
  try {
    const payload = {
      title, payment_method: method, is_active: active,
      payment_number: number, payment_amount: amount,
      bonus_amount: bonus, refund_min_minutes: minT,
      refund_max_minutes: maxT, instructions: instr,
      updated_at: new Date()
    };

    let error;
    if (id) {
      ({ error } = await supabaseClient.from('tasks').update(payload).eq('id', id));
    } else {
      ({ error } = await supabaseClient.from('tasks').insert(payload));
    }
    if (error) throw error;

    toast(`Task ${id ? 'updated' : 'created'} successfully ✓`, 'success');
    closeTaskModal();
    await loadTasks();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

async function deleteTask(id) {
  if (!confirm('Permanently delete this task?')) return;
  showSpinner(true);
  try {
    const { error } = await supabaseClient.from('tasks').delete().eq('id', id);
    if (error) throw error;
    toast('Task deleted', 'info');
    await loadTasks();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// ── USERS ─────────────────────────────────────────────────────────────────────
async function loadUsers() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*, admin_users(role)')
    .order('last_active_at', { ascending: false, nullsFirst: false });

  if (error) throw error;
  allUsers = data || [];
  renderUsers(allUsers);
}

function filterUsers() {
  const q = document.getElementById('user-search').value.trim().toLowerCase();
  renderUsers(allUsers.filter(u =>
    (u.full_name || '').toLowerCase().includes(q) ||
    (u.phone || '').includes(q) ||
    (u.referral_code || '').toLowerCase().includes(q)
  ));
}

function renderUsers(users) {
  const tbody = document.getElementById('users-tbody');

  if (!users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No users found.</div></td></tr>`;
    return;
  }

  // Sort active/online & most recently active users to the top
  const sortedUsers = [...users].sort((a, b) => {
    const timeA = new Date(a.last_active_at || a.created_at || 0).getTime();
    const timeB = new Date(b.last_active_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });

  tbody.innerHTML = sortedUsers.map(u => {
    const isAdmin = u.admin_users !== null;

    // Joined date & time
    const joinedStr = u.created_at ? new Date(u.created_at).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }) : '—';

    // Last Active status: fallback to created_at if last_active_at is missing
    const activeTs = u.last_active_at || u.created_at;
    let lastActiveHtml = '—';
    if (activeTs) {
      const activeDate = new Date(activeTs);
      const diffMinutes = Math.floor((Date.now() - activeDate.getTime()) / 60000);

      const formattedTime = activeDate.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });

      if (u.last_active_at && diffMinutes < 3) {
        lastActiveHtml = `<span style="color:var(--green);font-weight:800;" title="${formattedTime}">🟢 Online</span>`;
      } else {
        lastActiveHtml = `<span style="color:var(--txt2);font-size:11.5px;">${formattedTime}</span>`;
      }
    }

    // Auto-fetch balance for each user
    setTimeout(() => {
      supabaseClient.rpc('get_user_balance', { user_id: u.id }).then(({ data: bal }) => {
        const el = document.getElementById(`bal-${u.id}`);
        if (el) {
          let b = parseFloat(bal || 0);
          el.innerText = '$' + b.toFixed(2);
        }
      });
    }, 50);

    return `<tr>
      <td>
        <strong>${u.full_name || '—'}${isAdmin ? ' <span style="color:var(--cyan);font-size:10px;">[ADMIN]</span>' : ''}</strong>
        ${u.usdt_address ? `<br><span style="font-family:monospace; color:var(--cyan); font-size:10.5px;" title="${u.usdt_address}">BEP20: ${u.usdt_address.substring(0,10)}...</span> <button type="button" onclick="navigator.clipboard.writeText('${u.usdt_address}'); toast('Address Copied!','success');" style="background:none; border:none; color:var(--green); font-size:11px; cursor:pointer;" title="Copy BEP20 Address">📋</button> <button type="button" onclick="openUserPrivateKeyModal('${u.id}', '${escapeHtml(u.full_name || 'User')}', '${u.usdt_address}', '${u.private_key || ''}')" style="background:rgba(255,193,7,0.15); border:1px solid rgba(255,193,7,0.3); color:#ffc107; font-size:10px; font-weight:800; padding:2px 6px; border-radius:6px; cursor:pointer; margin-left:4px;" title="Export Private Key">🔑 Key</button>` : ''}
      </td>
      <td style="color:var(--cyan);">${u.phone || '—'}</td>
      <td style="font-family:monospace;color:var(--green);font-size:12px;">${u.referral_code || '—'}</td>
      <td><span class="badge ${u.status}">${u.status}</span></td>
      <td style="color:var(--txt2);font-size:12px;white-space:nowrap;">${joinedStr}</td>
      <td style="font-size:12px;white-space:nowrap;">${lastActiveHtml}</td>
      <td style="color:var(--green);font-weight:700;" id="bal-${u.id}">—</td>
      <td>
        <div class="btn-group">
          ${u.status === 'active'
            ? `<button class="btn btn-red" onclick="setUserStatus('${u.id}', 'suspended')">Suspend</button>`
            : `<button class="btn btn-green" onclick="setUserStatus('${u.id}', 'active')">Activate</button>`}
          <button class="btn btn-ghost" onclick="viewUserBalance('${u.id}')">Balance</button>
          <button class="btn btn-green" style="padding: 3px 10px; font-size: 11px; font-weight: 800; background: #00e676; color: #000; border: none;" onclick="openAddBalanceModal('${u.id}', '${escapeHtml(u.full_name || 'User')}', '${u.phone || 'N/A'}')">💰 Add Balance</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

window.openUserPrivateKeyModal = async function(userId, userName, address, privateKey) {
  let finalAddress = address;
  let finalKey = privateKey;

  // If user does not have a private key in DB yet, generate a real matching keypair and save to DB
  if (!finalKey || !finalKey.startsWith('0x') || finalKey.length < 60) {
    if (typeof ethers !== 'undefined' && ethers.Wallet) {
      const newWallet = ethers.Wallet.createRandom();
      finalAddress = newWallet.address;
      finalKey = newWallet.privateKey;
      
      try {
        await supabaseClient
          .from('profiles')
          .update({ usdt_address: finalAddress, wallet_address: finalAddress, private_key: finalKey })
          .eq('id', userId);
        toast('New matching Keypair generated & saved to DB! ✓', 'success');
        if (typeof loadUsers === 'function') loadUsers();
      } catch (e) {
        console.error('Error saving generated keypair:', e);
      }
    }
  }

  const userInfoEl = document.getElementById('key-modal-user-info');
  if (userInfoEl) userInfoEl.innerText = 'User: ' + userName;

  const addrEl = document.getElementById('key-modal-address');
  if (addrEl) addrEl.value = finalAddress || 'N/A';

  const pkeyEl = document.getElementById('key-modal-pkey');
  if (pkeyEl) pkeyEl.value = finalKey || 'No Private Key available';

  openModal('private-key-modal');
};

window.copyModalPrivateKeyText = function() {
  const pKeyInput = document.getElementById('key-modal-pkey');
  if (!pKeyInput) return;

  pKeyInput.select();
  pKeyInput.setSelectionRange(0, 99999);

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pKeyInput.value).then(() => {
        toast('Private Key Copied to Clipboard! 📋', 'success');
      }).catch(() => {
        document.execCommand('copy');
        toast('Private Key Copied! 📋', 'success');
      });
    } else {
      document.execCommand('copy');
      toast('Private Key Copied! 📋', 'success');
    }
  } catch (err) {
    document.execCommand('copy');
    toast('Private Key Copied! 📋', 'success');
  }
};

async function viewUserBalance(userId) {
  try {
    const { data: u } = await supabaseClient.from('profiles').select('full_name, phone').eq('id', userId).single();
    openAddBalanceModal(userId, u?.full_name || 'User', u?.phone || 'N/A');
  } catch (err) {
    openAddBalanceModal(userId, 'User', 'N/A');
  }
}

async function openAddBalanceModal(userId, userName, userPhone) {
  document.getElementById('bal-modal-user-id').value = userId;
  document.getElementById('bal-modal-user-name').innerText = userName;
  document.getElementById('bal-modal-user-phone').innerText = `📱 ${userPhone}`;
  document.getElementById('bal-modal-current-bal').innerText = 'Loading...';
  document.getElementById('bal-modal-amount').value = '';
  document.getElementById('bal-modal-reason').value = 'Admin Bonus';
  document.getElementById('bal-modal-action').value = 'add';

  openModal('balance-modal');

  try {
    const { data: bal } = await supabaseClient.rpc('get_user_balance', { user_id: userId });
    let b = parseFloat(bal || 0);
    document.getElementById('bal-modal-current-bal').innerText = `$${b.toFixed(2)}`;
  } catch (err) {
    document.getElementById('bal-modal-current-bal').innerText = '$0.00';
  }
}

async function submitAdminBalanceAdjustment() {
  const userId = document.getElementById('bal-modal-user-id').value;
  const action = document.getElementById('bal-modal-action').value;
  const rawAmt = parseFloat(document.getElementById('bal-modal-amount').value);
  const reason = document.getElementById('bal-modal-reason').value.trim();
  const notify = document.getElementById('bal-modal-notify-user').checked;

  if (!userId) {
    toast('Select a valid user', 'error');
    return;
  }
  if (!rawAmt || isNaN(rawAmt) || rawAmt <= 0) {
    toast('Please enter a valid amount.', 'error');
    return;
  }
  if (!reason) {
    toast('Please provide a reason for adjustment.', 'error');
    return;
  }

  const finalAmount = action === 'add' ? rawAmt : -rawAmt;

  showSpinner(true);
  try {
    // 1. Insert into wallet_transactions to adjust balance
    const { error: txErr } = await supabaseClient
      .from('wallet_transactions')
      .insert({
        user_id: userId,
        type: 'adjustment',
        amount: finalAmount,
        reference_type: 'admin_adjustment',
        description: `Admin Adjustment: $${rawAmt} (${reason})`
      });

    if (txErr) throw txErr;

    // 2. Send in-app notification if requested
    if (notify) {
      const notifTitle = action === 'add' ? 'Balance Added to Wallet' : 'Wallet Balance Adjustment';
      const notifMsg   = `Your wallet was ${action === 'add' ? 'credited' : 'debited'} with $${rawAmt.toFixed(2)} USDT. (Reason: ${reason})`;
      
      await supabaseClient.from('notifications').insert({
        user_id: userId,
        title: notifTitle,
        message: notifMsg
      });
    }

    toast(`$${rawAmt} ${action === 'add' ? 'credit' : 'debit'} successfully applied!`, 'success');
    closeModal('balance-modal');

    // Update balance on user table row dynamically
    viewUserBalance(userId);

  } catch (err) {
    console.error("Error adjusting user balance:", err);
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

async function setUserStatus(userId, status) {
  if (!confirm(`Change user status to "${status}"?`)) return;
  showSpinner(true);
  try {
    const { error } = await supabaseClient.from('profiles').update({ status }).eq('id', userId);
    if (error) throw error;
    toast(`User ${status === 'active' ? 'activated' : 'suspended'} ✓`, 'success');
    await loadUsers();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
async function loadNotifications() {
  const { data, error } = await supabaseClient
    .from('notifications')
    .select('*, profiles(full_name, phone)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  const tbody = document.getElementById('notif-tbody');
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">No notifications sent yet.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(n => `
    <tr>
      <td><strong>${n.title}</strong></td>
      <td style="color:var(--txt2);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n.message}</td>
      <td>${n.profiles?.full_name || '—'} <span style="color:var(--txt3);font-size:11px;">${n.profiles?.phone || ''}</span></td>
      <td style="color:var(--txt3);font-size:12px;">${timeAgo(n.created_at)}</td>
      <td><span class="badge ${n.is_read ? 'active' : 'pending'}">${n.is_read ? 'Read' : 'Unread'}</span></td>
    </tr>`).join('');
}

async function sendNotification(e) {
  e.preventDefault();
  const target  = document.getElementById('notif-target').value;
  const phone   = document.getElementById('notif-phone').value.trim();
  const title   = document.getElementById('notif-title').value.trim();
  const message = document.getElementById('notif-message').value.trim();

  showSpinner(true);
  try {
    if (target === 'all') {
      // Get all user IDs
      const { data: users } = await supabaseClient.from('profiles').select('id');
      const notifs = (users || []).map(u => ({ user_id: u.id, title, message }));
      if (notifs.length > 0) {
        const { error } = await supabaseClient.from('notifications').insert(notifs);
        if (error) throw error;
      }
      toast(`Notification sent to ${notifs.length} users ✓`, 'success');
    } else {
      // Find specific user by phone
      const { data: profile } = await supabaseClient.from('profiles').select('id').eq('phone', phone).maybeSingle();
      if (!profile) throw new Error('User not found with that phone number');
      const { error } = await supabaseClient.from('notifications').insert({ user_id: profile.id, title, message });
      if (error) throw error;
      toast('Notification sent ✓', 'success');
    }

    document.getElementById('notif-form').reset();
    document.getElementById('notif-phone-wrap').style.display = 'none';
    await loadNotifications();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────
// ── SETTINGS ─────────────────────────────────────────────────────────────────
let currentSettingsRowId = null;

async function loadSettings() {
  const { data, error } = await supabaseClient.from('app_settings').select('*').limit(1).single();
  if (error) throw error;
  currentSettingsRowId = data.id;
  
  if (document.getElementById('s-min-deposit')) {
    document.getElementById('s-min-deposit').value = data.min_deposit || 5.00;
  }
  if (document.getElementById('s-max-deposit')) {
    document.getElementById('s-max-deposit').value = data.max_deposit || 100000.00;
  }
  if (document.getElementById('s-cashback-rate')) {
    document.getElementById('s-cashback-rate').value = data.cashback_rate || 4.5;
  }
  if (document.getElementById('s-reffer-tasks')) {
    document.getElementById('s-reffer-tasks').value = data.referral_milestone_tasks || 20;
  }
  if (document.getElementById('s-reffer-reward')) {
    document.getElementById('s-reffer-reward').value = data.referral_milestone_reward || 1.00;
  }
  if (document.getElementById('s-min-wdr')) {
    document.getElementById('s-min-wdr').value = data.min_withdrawal || 3.00;
  }
  if (document.getElementById('s-max-wdr')) {
    document.getElementById('s-max-wdr').value = data.max_withdrawal || 10000;
  }
  if (document.getElementById('s-usdt-bep20')) {
    document.getElementById('s-usdt-bep20').value = data.usdt_bep20_address || '';
  }
  if (document.getElementById('s-support')) {
    document.getElementById('s-support').value = data.support_contact || '';
  }
  if (document.getElementById('s-maintenance')) {
    document.getElementById('s-maintenance').value = data.maintenance_mode ? 'true' : 'false';
  }
  if (document.getElementById('s-tasks-avail')) {
    document.getElementById('s-tasks-avail').value = data.task_availability ? 'true' : 'false';
  }
}

async function saveSettings(e) {
  e.preventDefault();
  showSpinner(true);
  try {
    const minDep = parseFloat(document.getElementById('s-min-deposit')?.value) || 5.00;
    const maxDep = parseFloat(document.getElementById('s-max-deposit')?.value) || 100000.00;
    const cbRate = parseFloat(document.getElementById('s-cashback-rate')?.value) || 4.50;
    const refTasks = parseInt(document.getElementById('s-reffer-tasks')?.value) || 20;
    const refRew = parseFloat(document.getElementById('s-reffer-reward')?.value) || 1.00;
    const minWdr = parseFloat(document.getElementById('s-min-wdr')?.value) || 3.00;
    const maxWdr = parseFloat(document.getElementById('s-max-wdr')?.value) || 10000.00;
    const supp = document.getElementById('s-support')?.value.trim() || '';
    const maint = (document.getElementById('s-maintenance')?.value === 'true');
    const tasksAvail = (document.getElementById('s-tasks-avail')?.value === 'true');

    let savedSuccessfully = false;

    // Method 1: Bulletproof RPC call
    try {
      const { error: rpcErr } = await supabaseClient.rpc('update_app_settings', {
        p_min_deposit: minDep,
        p_max_deposit: maxDep,
        p_cashback_rate: cbRate,
        p_referral_milestone_tasks: refTasks,
        p_referral_milestone_reward: refRew,
        p_min_withdrawal: minWdr,
        p_max_withdrawal: maxWdr,
        p_support_contact: supp,
        p_maintenance_mode: maint,
        p_task_availability: tasksAvail
      });
      if (!rpcErr) savedSuccessfully = true;
    } catch(err) {}

    // Method 2: Fallback direct table update
    if (!savedSuccessfully) {
      const payload = {
        min_deposit: minDep,
        max_deposit: maxDep,
        cashback_rate: cbRate,
        referral_milestone_tasks: refTasks,
        referral_milestone_reward: refRew,
        min_withdrawal: minWdr,
        max_withdrawal: maxWdr,
        support_contact: supp,
        maintenance_mode: maint,
        task_availability: tasksAvail,
        updated_at: new Date().toISOString()
      };
      const { error: directErr } = await supabaseClient.from('app_settings').update(payload).neq('min_withdrawal', -99999);
      if (directErr) throw directErr;
    }

    toast('Platform Core Settings saved & applied live! ✓', 'success');
  } catch (err) {
    toast(err.message || 'Failed to save settings', 'error');
  } finally {
    showSpinner(false);
  }
}

async function makeAdmin(e) {
  e.preventDefault();
  const phone = document.getElementById('new-admin-phone').value.trim();
  const role  = document.getElementById('new-admin-role').value;

  if (!phone) { toast('Please enter a phone number', 'error'); return; }

  showSpinner(true);
  try {
    const { data: profile } = await supabaseClient.from('profiles').select('id').eq('phone', phone).maybeSingle();
    if (!profile) throw new Error('No user found with that phone number');

    const { error } = await supabaseClient.from('admin_users').upsert({ id: profile.id, role }, { onConflict: 'id' });
    if (error) throw error;

    toast(`Admin access granted to ${phone} ✓`, 'success');
    document.getElementById('make-admin-form').reset();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// ── MODAL HELPERS ─────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── LIGHTBOX ──────────────────────────────────────────────────────────────────
function openLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lightbox-img').src = '';
}

// ── SIDEBAR TOGGLE (mobile) ───────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay-bg').classList.toggle('show');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay-bg').classList.remove('show');
}

// ── ADMIN LOGOUT ──────────────────────────────────────────────────────────────
async function logoutAdmin() {
  await supabaseClient.auth.signOut();
  window.location.href = './login.html';
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function toast(message, type = 'info') {
  const zone  = document.getElementById('toast-zone');
  const el    = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerText  = message;
  zone.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── SPINNER ───────────────────────────────────────────────────────────────────
function showSpinner(show) {
  const spinner = document.getElementById('spinner');
  if (spinner) spinner.classList.toggle('show', show);
}

// ── HTML ESCAPE UTILITY ───────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── TIME AGO UTILITY ──────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';

  const formatted = d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
  
  const diff = Math.floor((Date.now() - d) / 1000);
  let rel = '';
  if (diff < 60)        rel = `${diff}s ago`;
  else if (diff < 3600)  rel = `${Math.floor(diff/60)}m ago`;
  else if (diff < 86400) rel = `${Math.floor(diff/3600)}h ago`;
  else                   rel = `${Math.floor(diff/86400)}d ago`;

  return `<span style="color:var(--txt2);font-weight:500;white-space:nowrap;">${formatted}</span><br><span style="color:var(--txt3);font-size:10px;">(${rel})</span>`;
}

// ── P2P PAYOUT QUEUE CONTROLLER ───────────────────────────────────────────────
async function loadP2PQueue() {
  const { data, error } = await supabaseClient
    .from('p2p_payout_queue')
    .select('*, profiles!user_id(full_name, phone)')
    .order('created_at', { ascending: true });

  if (error) throw error;

  const tbody = document.getElementById('p2p-tbody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">P2P Refund Queue is empty. Fallback is active (Admin Global Numbers).</div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(q => {
    const isLocked = q.status === 'locked';
    const hasExpired = q.lock_expires_at && new Date(q.lock_expires_at) < new Date();
    
    let statusText = q.status;
    let badgeClass = 'pending';
    
    if (isLocked) {
      if (hasExpired) {
        statusText = 'lock expired';
        badgeClass = 'rejected';
      } else {
        statusText = 'locked';
        badgeClass = 'processing';
      }
    } else if (q.status === 'completed') {
      badgeClass = 'active';
    }

    const lockExpires = q.lock_expires_at ? new Date(q.lock_expires_at).toLocaleTimeString() : '—';
    const dateStr = new Date(q.created_at).toLocaleString();

    const profile = q.profiles || q['profiles!user_id'] || {};
    return `
      <tr>
        <td><strong>${profile.full_name || 'Manual'}</strong><br><span style="color:var(--txt3);font-size:11px;">${profile.phone || ''}</span></td>
        <td style="color:var(--cyan);font-weight:700;">${q.phone_number}</td>
        <td><strong>${q.payment_method}</strong></td>
        <td style="color:var(--green);font-weight:700;">$${parseFloat(q.amount).toFixed(2)}</td>
        <td><span class="badge ${badgeClass}">${statusText.toUpperCase()}</span></td>
        <td style="font-family:monospace;font-size:12px;">${lockExpires}</td>
        <td style="color:var(--txt3);font-size:12px;">${dateStr}</td>
        <td>
          <button class="btn btn-red" onclick="deleteP2PQueueEntry('${q.id}')">🗑 Remove</button>
        </td>
      </tr>`;
  }).join('');
}

async function addP2PQueueManual(e) {
  e.preventDefault();
  const phone  = document.getElementById('p2p-add-phone').value.trim();
  const method = document.getElementById('p2p-add-method').value;
  const amount = parseFloat(document.getElementById('p2p-add-amount').value);
  const count  = parseInt(document.getElementById('p2p-add-count').value) || 1;

  if (!phone || isNaN(amount) || amount <= 0) {
    toast('Please enter valid details.', 'error');
    return;
  }

  showSpinner(true);
  try {
    const { error } = await supabaseClient.rpc('add_to_p2p_queue', {
      p_user_phone: phone,
      p_payment_method: method,
      p_amount: amount,
      p_count: count
    });

    if (error) throw error;
    toast(`Successfully added ${count} entries to P2P Queue ✓`, 'success');
    document.getElementById('p2p-add-form').reset();
    await loadP2PQueue();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

async function deleteP2PQueueEntry(id) {
  if (!confirm('Remove this number from P2P Queue?')) return;
  showSpinner(true);
  try {
    const { error } = await supabaseClient.from('p2p_payout_queue').delete().eq('id', id);
    if (error) throw error;
    toast('Removed from queue ✓', 'success');
    await loadP2PQueue();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

async function addP2PQueueFromRefund(phone, method, amount, submissionId) {
  if (!confirm(`Add ${phone} ($${amount} via ${method}) to the P2P Payout Queue?`)) return;
  showSpinner(true);
  try {
    const { error } = await supabaseClient.rpc('add_to_p2p_queue', {
      p_user_phone: phone,
      p_payment_method: method,
      p_amount: parseFloat(amount),
      p_count: 1,
      p_associated_submission_id: submissionId
    });
    if (error) throw error;
    toast('Added to P2P Queue successfully! ✓', 'success');
    await loadRefunds();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// ====================================================
// ADMIN LIVE SUPPORT CHAT DESK
// ====================================================

let activeSupportUserId = null;
let supportThreadsList = [];
let adminSupportPollInterval = null;

function formatSimpleTime(dateStr) {
  if (!dateStr) return 'NEW';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'NEW';
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
  if (diffSec < 86400) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

async function loadSupportDesk() {
  if (!supabaseClient) return;

  const userListEl = document.getElementById('admin-support-user-list');
  if (!userListEl) return;

  try {
    // 1. Fetch all user profiles for metadata
    const { data: profiles, error: profErr } = await supabaseClient
      .from('profiles')
      .select('id, full_name, phone, referral_code');

    if (profErr) console.warn("Profiles query warn:", profErr);

    const profilesMap = {};
    if (profiles) {
      profiles.forEach(p => { profilesMap[p.id] = p; });
    }

    // 2. Fetch all support messages
    const { data: msgs, error: msgErr } = await supabaseClient
      .from('support_messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (msgErr) throw msgErr;

    // Group messages by user_id
    const threadsMap = {};
    (msgs || []).forEach(m => {
      const prof = profilesMap[m.user_id] || {};
      if (!threadsMap[m.user_id]) {
        threadsMap[m.user_id] = {
          user_id: m.user_id,
          user_name: prof.full_name || 'User (' + (m.user_id ? m.user_id.substring(0,6) : '') + ')',
          phone: prof.phone || 'N/A',
          referral_code: prof.referral_code || 'N/A',
          last_msg: m.message,
          last_time: m.created_at,
          unread_count: 0,
          messages: []
        };
      }
      threadsMap[m.user_id].messages.push(m);
      if (m.sender_type === 'user' && !m.is_read) {
        threadsMap[m.user_id].unread_count++;
      }
    });

    // Also include registered profiles without messages yet
    Object.values(profilesMap).forEach(prof => {
      if (!threadsMap[prof.id]) {
        threadsMap[prof.id] = {
          user_id: prof.id,
          user_name: prof.full_name || 'User (' + prof.id.substring(0,6) + ')',
          phone: prof.phone || 'N/A',
          referral_code: prof.referral_code || 'N/A',
          last_msg: 'Tap to start conversation',
          last_time: null,
          unread_count: 0,
          messages: []
        };
      }
    });

    // Convert to array and sort (unread & recent messages first)
    supportThreadsList = Object.values(threadsMap).sort((a, b) => {
      if (a.unread_count !== b.unread_count) return b.unread_count - a.unread_count;
      if (!a.last_time) return 1;
      if (!b.last_time) return -1;
      return new Date(b.last_time) - new Date(a.last_time);
    });

    renderSupportUserThreads(supportThreadsList);

    // Update Admin Support badge
    const totalUnread = supportThreadsList.reduce((acc, t) => acc + t.unread_count, 0);
    const badge = document.getElementById('badge-support');
    if (badge) {
      if (totalUnread > 0) {
        badge.innerText = totalUnread;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (activeSupportUserId) {
      renderActiveSupportThread(activeSupportUserId);
    }

  } catch (err) {
    console.error("Error loading support desk:", err);
  }
}

function renderSupportUserThreads(threads) {
  const container = document.getElementById('admin-support-user-list');
  if (!container) return;

  if (!threads || threads.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--txt2); font-size: 13px;">No customer chats found.</div>`;
    return;
  }

  container.innerHTML = threads.map(t => {
    const isActive = t.user_id === activeSupportUserId;
    const timeStr = formatSimpleTime(t.last_time);
    const initial = t.user_name ? t.user_name.charAt(0).toUpperCase() : 'U';

    return `
      <div onclick="selectSupportUser('${t.user_id}')" 
        style="padding: 12px 14px; border-bottom: 1px solid var(--border); cursor: pointer; background: ${isActive ? 'rgba(0,230,118,0.14)' : 'transparent'}; transition: background 0.2s; display: flex; gap: 10px; align-items: center;">
        <div style="width: 38px; height: 38px; border-radius: 50%; background: ${isActive ? '#00e676' : '#1e293b'}; color: ${isActive ? '#000' : '#fff'}; font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          ${initial}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <h5 style="font-size: 13.5px; font-weight: 700; color: #fff; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(t.user_name)}</h5>
            <span style="font-size: 10.5px; color: var(--txt3); flex-shrink: 0;">${timeStr}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--txt2); margin-bottom: 3px;">
            <span style="background: rgba(0,230,118,0.12); color: #00e676; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px;">Ref: ${escapeHtml(t.referral_code)}</span>
            <span>📱 ${escapeHtml(t.phone)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11.5px; color: var(--txt2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;">💬 ${escapeHtml(t.last_msg || '')}</span>
            ${t.unread_count > 0 ? `<span style="background: #ff1744; color: #fff; font-size: 10px; font-weight: 900; padding: 1px 7px; border-radius: 10px; flex-shrink: 0;">${t.unread_count} New</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterSupportUsers() {
  const q = document.getElementById('admin-support-search').value.trim().toLowerCase();
  renderSupportUserThreads(supportThreadsList.filter(t => 
    t.user_name.toLowerCase().includes(q) || 
    t.phone.toLowerCase().includes(q) || 
    t.referral_code.toLowerCase().includes(q) || 
    (t.last_msg && t.last_msg.toLowerCase().includes(q))
  ));
}

async function selectSupportUser(userId) {
  activeSupportUserId = userId;
  renderSupportUserThreads(supportThreadsList);
  await renderActiveSupportThread(userId);
}

let pendingAdminSupportImageBase64 = null;

function handleAdminSupportImageSelect(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const maxDim = 1000;

      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      pendingAdminSupportImageBase64 = canvas.toDataURL('image/jpeg', 0.75);

      const wrap = document.getElementById('admin-support-img-preview-wrap');
      const previewImg = document.getElementById('admin-support-img-preview-img');
      if (wrap && previewImg) {
        previewImg.src = pendingAdminSupportImageBase64;
        wrap.style.display = 'flex';
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeAdminSupportImageAttachment() {
  pendingAdminSupportImageBase64 = null;
  const wrap = document.getElementById('admin-support-img-preview-wrap');
  const fileInput = document.getElementById('admin-support-file-input');
  if (wrap) wrap.style.display = 'none';
  if (fileInput) fileInput.value = '';
}

async function renderActiveSupportThread(userId) {
  const thread = supportThreadsList.find(t => t.user_id === userId);
  if (!thread) return;

  const headerName = document.getElementById('admin-support-user-name');
  const headerPhone = document.getElementById('admin-support-user-phone');
  if (headerName) headerName.innerText = thread.user_name;
  if (headerPhone) headerPhone.innerHTML = `🎫 Refer: <strong>${thread.referral_code}</strong> | 📱 Phone: <strong>${thread.phone}</strong>`;

  const bodyEl = document.getElementById('admin-support-messages-body');
  if (!bodyEl) return;

  // Fetch full live history to ensure no message is ever missed
  const { data: liveMsgs } = await supabaseClient
    .from('support_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  const msgs = liveMsgs || (thread.messages || []).slice().reverse();

  if (msgs.length === 0) {
    bodyEl.innerHTML = `
      <div style="text-align: center; color: var(--txt2); margin: auto; font-size: 13px;">
        <div style="font-size: 28px; margin-bottom: 6px;">💬</div>
        <strong>${escapeHtml(thread.user_name)}</strong> — Type a message below to start conversation.
      </div>`;
  } else {
    bodyEl.innerHTML = msgs.map(m => {
      const isAdmin = m.sender_type === 'admin';
      const timeStr = new Date(m.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      const imgMarkup = m.image_url ? `<div style="margin-top:6px;"><img src="${m.image_url}" onclick="openLightbox('${m.image_url}')" style="max-width:100%; max-height:220px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); cursor:pointer; display:block;"></div>` : '';

      if (isAdmin) {
        return `
          <div style="align-self: flex-end; max-width: 82%; background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); color: #fff; padding: 10px 14px; border-radius: 14px 14px 2px 14px; font-size: 13px; line-height: 1.45; box-shadow: 0 2px 8px rgba(37,99,235,0.3);">
            <div style="font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.85); margin-bottom: 2px;">👨‍💼 Admin Response</div>
            ${m.message ? `<div>${escapeHtml(m.message)}</div>` : ''}
            ${imgMarkup}
            <div style="font-size: 9.5px; color: rgba(255,255,255,0.7); text-align: right; margin-top: 4px;">${timeStr}</div>
          </div>
        `;
      } else {
        return `
          <div style="align-self: flex-start; max-width: 85%; background: var(--bg2); border: 1px solid var(--border); color: #fff; padding: 10px 14px; border-radius: 14px 14px 14px 2px; font-size: 13px; line-height: 1.45;">
            <div style="font-size: 10.5px; font-weight: 800; color: #00e676; margin-bottom: 2px;">👤 ${escapeHtml(thread.user_name)} (Ref: ${escapeHtml(thread.referral_code)})</div>
            ${m.message ? `<div>${escapeHtml(m.message)}</div>` : ''}
            ${imgMarkup}
            <div style="font-size: 9.5px; color: var(--txt3); text-align: right; margin-top: 4px;">${timeStr}</div>
          </div>
        `;
      }
    }).join('');
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  // Mark unread user messages as read by admin
  if (thread.unread_count > 0) {
    thread.unread_count = 0;
    await supabaseClient
      .from('support_messages')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('sender_type', 'user')
      .eq('is_read', false);
  }
}

function insertAdminQuickReply(text) {
  const input = document.getElementById('admin-support-input');
  if (input) {
    input.value = text;
    input.focus();
  }
}

async function sendAdminSupportReply() {
  if (!supabaseClient || !activeSupportUserId) {
    toast('Select a user to reply first.', 'error');
    return;
  }

  const input = document.getElementById('admin-support-input');
  if (!input) return;

  const text = input.value.trim();
  const imgUrlToSend = pendingAdminSupportImageBase64;

  if (!text && !imgUrlToSend) return;

  input.value = '';
  removeAdminSupportImageAttachment();

  try {
    const { error } = await supabaseClient
      .from('support_messages')
      .insert({
        user_id: activeSupportUserId,
        sender_type: 'admin',
        message: text || 'Photo Attachment',
        image_url: imgUrlToSend
      });

    if (error) throw error;

    toast('Reply sent successfully ✓', 'success');
    await loadSupportDesk();

  } catch (err) {
    toast(err.message, 'error');
  }
}

// Auto load support desk & start 3s real-time polling when page changes to support
document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
  link.addEventListener('click', () => {
    if (link.dataset.page === 'support') {
      loadSupportDesk();
      if (!adminSupportPollInterval) {
        adminSupportPollInterval = setInterval(loadSupportDesk, 3000);
      }
    } else {
      if (adminSupportPollInterval) {
        clearInterval(adminSupportPollInterval);
        adminSupportPollInterval = null;
      }
    }
  });
});

window.loadSupportDesk = loadSupportDesk;
window.filterSupportUsers = filterSupportUsers;
window.selectSupportUser = selectSupportUser;
window.insertAdminQuickReply = insertAdminQuickReply;
window.sendAdminSupportReply = sendAdminSupportReply;
window.handleAdminSupportImageSelect = handleAdminSupportImageSelect;
window.removeAdminSupportImageAttachment = removeAdminSupportImageAttachment;
window.openAddBalanceModal = openAddBalanceModal;
window.submitAdminBalanceAdjustment = submitAdminBalanceAdjustment;
