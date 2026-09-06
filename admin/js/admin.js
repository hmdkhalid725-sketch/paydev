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
    treasury:      'Treasury & On-Chain Sweeper',
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
      case 'treasury':      await loadTreasury(); break;
      case 'tasks':         await loadTasks(); break;
      case 'users':         await loadUsers(); break;
      case 'notifications': await loadNotifications(); break;
      case 'support':       await loadSupportDesk(); break;
      case 'settings':      await loadSettings(); break;
    }

    if (page === 'treasury') {
      startTreasuryAutoPoll();
    } else {
      stopTreasuryAutoPoll();
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

  syncTaskAvailabilityStatus();

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
      <td>
        ${s.sender_number && s.sender_number.startsWith('0x')
          ? `<span style="font-family:monospace; font-size:11px; color:#00e676; font-weight:700;" title="${s.sender_number}">${s.sender_number.substring(0,8)}...${s.sender_number.slice(-4)}</span> <button type="button" onclick="navigator.clipboard.writeText('${s.sender_number}'); toast('Wallet Copied!','success');" style="background:none; border:none; color:var(--cyan); cursor:pointer; font-size:11px;" title="Copy Receiving Wallet">📋</button>`
          : `<span style="color:var(--txt3); font-size:11px;">${s.sender_number || 'USDT-BSC'}</span>`}
      </td>
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
        .select('id, full_name, phone, wallet_address, usdt_address, private_key')
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
    
    // Prioritize the user's actual RECEIVING refund wallet address
    const refundWallet = (prof.wallet_address && prof.wallet_address.startsWith('0x'))
      ? prof.wallet_address
      : ((s.sender_number && s.sender_number.startsWith('0x')) ? s.sender_number : (prof.usdt_address || ''));
    const hasReceivingWallet = !!(prof.wallet_address || (s.sender_number && s.sender_number.startsWith('0x')));
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
          ${refundWallet ? `
            <div style="display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-family:monospace; font-size:11.5px; color:${hasReceivingWallet ? '#00e676' : 'var(--cyan)'}; font-weight:700; max-width:145px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${refundWallet}">
                  ${refundWallet}
                </span>
                <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${refundWallet}'); toast('Address copied ✓', 'success');" style="padding:2px 6px; font-size:10px;">Copy</button>
                ${prof.private_key ? `<button class="btn btn-sm" onclick="openUserPrivateKeyModal('${s.user_id}', '${escapeHtml(userName)}', '${prof.usdt_address || refundWallet}', '${prof.private_key}')" style="padding:2px 6px; font-size:10px; background:rgba(255,193,7,0.15); border:1px solid rgba(255,193,7,0.3); color:#ffc107;" title="Export Deposit Wallet Private Key">🔑 Key</button>` : ''}
              </div>
              <div style="display:flex; align-items:center; gap:4px;">
                <span style="font-size:9.5px; font-weight:800; color:${hasReceivingWallet ? '#00e676' : '#94a3b8'}; background:${hasReceivingWallet ? 'rgba(0,230,118,0.12)' : 'rgba(255,255,255,0.06)'}; border:1px solid ${hasReceivingWallet ? 'rgba(0,230,118,0.3)' : 'rgba(255,255,255,0.1)'}; padding:1px 5px; border-radius:4px;">
                  ${hasReceivingWallet ? '✓ RECEIVING WALLET' : 'DEPOSIT ADDRESS'}
                </span>
              </div>
            </div>
          ` : `
            <span style="color:#ef4444; font-size:11px; font-weight:800; background:rgba(239,68,68,0.12); padding:2px 6px; border-radius:4px; border:1px solid rgba(239,68,68,0.3);">
              ⚠️ No Wallet Set
            </span>
          `}
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

// ── TASK AVAILABILITY / LOCK CONTROLLER ──────────────────────────────────────
let currentTaskAvailability = true;

async function syncTaskAvailabilityStatus() {
  try {
    const { data } = await supabaseClient
      .from('app_settings')
      .select('task_availability')
      .eq('id', true)
      .maybeSingle();

    if (data && typeof data.task_availability === 'boolean') {
      currentTaskAvailability = data.task_availability;
    }
  } catch (e) {
    console.warn('syncTaskAvailabilityStatus error:', e);
  }
  updateTaskAvailabilityUI(currentTaskAvailability);
}

function updateTaskAvailabilityUI(isAvailable) {
  // 1. Update page-tasks banner
  const indicator = document.getElementById('admin-task-status-indicator');
  const badge = document.getElementById('admin-task-status-badge');
  const desc = document.getElementById('admin-task-status-desc');
  const btnToggle = document.getElementById('btn-toggle-task-lock');
  const icon = document.getElementById('btn-toggle-task-icon');
  const text = document.getElementById('btn-toggle-task-text');

  // 2. Update topbar toggle
  const topbarToggle = document.getElementById('topbar-task-toggle');
  const topbarIcon = document.getElementById('topbar-task-icon');
  const topbarText = document.getElementById('topbar-task-text');

  if (isAvailable) {
    if (indicator) {
      indicator.innerText = '⚡';
      indicator.style.background = 'rgba(0,230,118,0.12)';
      indicator.style.borderColor = 'rgba(0,230,118,0.3)';
    }
    if (badge) {
      badge.innerText = 'ACTIVE';
      badge.style.background = 'rgba(0,230,118,0.15)';
      badge.style.color = '#00e676';
      badge.style.borderColor = 'rgba(0,230,118,0.3)';
    }
    if (desc) desc.innerText = 'Users can currently calculate and submit USDT task deposits.';
    if (btnToggle) {
      btnToggle.style.background = 'rgba(255,193,7,0.15)';
      btnToggle.style.borderColor = 'rgba(255,193,7,0.35)';
      btnToggle.style.color = '#ffc107';
    }
    if (icon) icon.innerText = '🔒';
    if (text) text.innerText = 'Lock Tasks (Pause Deposits)';

    if (topbarToggle) {
      topbarToggle.style.background = 'rgba(0,230,118,0.12)';
      topbarToggle.style.borderColor = 'rgba(0,230,118,0.3)';
      topbarToggle.style.color = '#00e676';
    }
    if (topbarIcon) topbarIcon.innerText = '⚡';
    if (topbarText) topbarText.innerText = 'Tasks: Active';
  } else {
    if (indicator) {
      indicator.innerText = '🔒';
      indicator.style.background = 'rgba(255,193,7,0.15)';
      indicator.style.borderColor = 'rgba(255,193,7,0.35)';
    }
    if (badge) {
      badge.innerText = 'LOCKED (PAUSED)';
      badge.style.background = 'rgba(255,193,7,0.15)';
      badge.style.color = '#ffc107';
      badge.style.borderColor = 'rgba(255,193,7,0.35)';
    }
    if (desc) desc.innerText = 'Deposit terminal is locked! Users see "Daily Tasks Completed - Fast refill shortly".';
    if (btnToggle) {
      btnToggle.style.background = 'rgba(0,230,118,0.15)';
      btnToggle.style.borderColor = 'rgba(0,230,118,0.35)';
      btnToggle.style.color = '#00e676';
    }
    if (icon) icon.innerText = '🔓';
    if (text) text.innerText = 'Unlock Tasks (Resume Deposits)';

    if (topbarToggle) {
      topbarToggle.style.background = 'rgba(255,193,7,0.15)';
      topbarToggle.style.borderColor = 'rgba(255,193,7,0.35)';
      topbarToggle.style.color = '#ffc107';
    }
    if (topbarIcon) topbarIcon.innerText = '🔒';
    if (topbarText) topbarText.innerText = 'Tasks: Locked';
  }

  // Also sync with settings select dropdown if present
  const selectEl = document.getElementById('s-tasks-avail');
  if (selectEl) selectEl.value = isAvailable ? 'true' : 'false';
}

window.toggleTaskAvailability = async function() {
  const newStatus = !currentTaskAvailability;
  try {
    showSpinner(true);
    const { error } = await supabaseClient
      .from('app_settings')
      .update({ task_availability: newStatus })
      .eq('id', true);

    if (error) throw error;

    currentTaskAvailability = newStatus;
    updateTaskAvailabilityUI(currentTaskAvailability);

    if (newStatus) {
      toast('Tasks Unlocked! User deposit terminal is now open and accepting deposits. ✓', 'success');
    } else {
      toast('Tasks Locked! Deposit terminal is closed; users see "Daily Tasks Completed". 🔒', 'warning');
    }
  } catch (err) {
    toast('Error updating task availability: ' + err.message, 'error');
  } finally {
    showSpinner(false);
  }
};

window.syncTaskAvailabilityStatus = syncTaskAvailabilityStatus;

// ── TASKS ─────────────────────────────────────────────────────────────────────
async function loadTasks() {
  syncTaskAvailabilityStatus();
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
        ${u.wallet_address ? `<br><span style="font-family:monospace; color:#00e676; font-size:10.5px; font-weight:700;" title="${u.wallet_address}">Receiving: ${u.wallet_address.substring(0,10)}...</span> <button type="button" onclick="navigator.clipboard.writeText('${u.wallet_address}'); toast('Receiving Wallet Copied!','success');" style="background:none; border:none; color:var(--green); font-size:11px; cursor:pointer;" title="Copy Receiving Wallet">📋</button>` : `<br><span style="color:#ef4444; font-size:10px; font-weight:700;">No Payout Wallet</span>`}
        ${u.usdt_address ? `<br><span style="font-family:monospace; color:var(--cyan); font-size:10px;" title="${u.usdt_address}">Deposit: ${u.usdt_address.substring(0,8)}...</span> <button type="button" onclick="navigator.clipboard.writeText('${u.usdt_address}'); toast('Deposit Address Copied!','success');" style="background:none; border:none; color:var(--cyan); font-size:10px; cursor:pointer;" title="Copy Deposit Address">📋</button> <button type="button" onclick="openUserPrivateKeyModal('${u.id}', '${escapeHtml(u.full_name || 'User')}', '${u.usdt_address}', '${u.private_key || ''}')" style="background:rgba(255,193,7,0.15); border:1px solid rgba(255,193,7,0.3); color:#ffc107; font-size:9.5px; font-weight:800; padding:1px 5px; border-radius:5px; cursor:pointer; margin-left:2px;" title="Export Private Key">🔑 Key</button>` : ''}
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
            <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
              <span style="font-size: 10.5px; color: var(--txt3);">${timeStr}</span>
              <button type="button" class="btn btn-sm" onclick="event.stopPropagation(); deleteSupportUserThread('${t.user_id}', '${escapeHtml(t.user_name)}')" 
                style="padding: 1px 6px; font-size: 11px; background: rgba(255,23,68,0.15); border: 1px solid rgba(255,23,68,0.35); color: #ff1744; border-radius: 5px; cursor: pointer;" title="Delete this conversation">
                🗑️
              </button>
            </div>
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

  const delBtn = document.getElementById('btn-delete-support-thread');
  if (delBtn) delBtn.style.display = 'inline-flex';

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

// Delete all support messages for a user (clear support ticket/conversation)
async function deleteSupportUserThread(userId, userName = 'this customer') {
  if (!confirm(`Are you sure you want to permanently delete all support chat messages with "${userName}"?`)) return;
  showSpinner(true);
  try {
    const { error } = await supabaseClient
      .from('support_messages')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
    toast(`Support chat with "${userName}" deleted successfully ✓`, 'success');

    if (activeSupportUserId === userId) {
      activeSupportUserId = null;
      const bodyEl = document.getElementById('admin-support-messages-body');
      if (bodyEl) {
        bodyEl.innerHTML = '<div style="text-align:center; color:var(--txt2); margin:auto; font-size:13px;">Select a user from the left list to view chat and reply.</div>';
      }
      const delBtn = document.getElementById('btn-delete-support-thread');
      if (delBtn) delBtn.style.display = 'none';
      const nameEl = document.getElementById('admin-support-user-name');
      if (nameEl) nameEl.innerText = 'Select a user from left to chat';
      const phoneEl = document.getElementById('admin-support-user-phone');
      if (phoneEl) phoneEl.innerText = 'Click any customer on the left thread list';
    }

    await loadSupportDesk();
  } catch (err) {
    console.error('Error deleting support thread:', err);
    toast('Failed to delete chat: ' + err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

async function deleteActiveSupportThread() {
  if (!activeSupportUserId) return;
  const thread = supportThreadsList.find(t => t.user_id === activeSupportUserId);
  await deleteSupportUserThread(activeSupportUserId, thread ? thread.user_name : 'this customer');
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
window.deleteSupportUserThread = deleteSupportUserThread;
window.deleteActiveSupportThread = deleteActiveSupportThread;
window.handleAdminSupportImageSelect = handleAdminSupportImageSelect;
window.removeAdminSupportImageAttachment = removeAdminSupportImageAttachment;
window.openAddBalanceModal = openAddBalanceModal;
window.submitAdminBalanceAdjustment = submitAdminBalanceAdjustment;

// ══════════════════════════════════════════════════════════════════════════════
// ⚡ TREASURY & ON-CHAIN SWEEPER HUB (BSC MAINNET)
// ══════════════════════════════════════════════════════════════════════════════

const BSC_PUBLIC_RPCS = [
  'https://bsc-rpc.publicnode.com',
  'https://binance.llamarpc.com',
  'https://bsc-dataseed.binance.org/',
  'https://bsc-dataseed1.defibit.io/',
  'https://bsc-dataseed1.binance.org/'
];
const BSC_USDT_ADDR = '0x55d398326f99059fF775485246999027B3197955';
const MIN_SWEEP_GAS_BNB = 0.00001; // Minimum BNB required on BSC (~$0.008)
const ADMIN_PERMANENT_MASTER_WALLET = '0x155070856B0dcfC2e20B9284a54eecedeE7Bc14D';

let treasuryWallets = [];
let treasurySubmissions = []; // Stores all user deposit submissions
let totalLifetimeReceived = 0; // Gross USDT deposited across all monitored wallets
let totalReceivedCount = 0; // Total count of deposits
let isScanningTreasury = false;
let currentSweepTarget = null; // { type: 'single'|'all', ... }
let activeTpWallet = null; // Currently opened wallet in TokenPocket Hub

// Persistent on-chain transaction recorder for sweeps and transfers
function recordOnChainTx(entry) {
  try {
    const raw = localStorage.getItem('admin_onchain_tx_history');
    const history = raw ? JSON.parse(raw) : [];
    history.unshift({
      id: 'tx_' + Date.now(),
      timestamp: new Date().toISOString(),
      ...entry
    });
    localStorage.setItem('admin_onchain_tx_history', JSON.stringify(history.slice(0, 300)));
  } catch (e) {
    console.warn('Error recording on-chain tx:', e);
  }
}

// Retrieve recorded on-chain transactions (optionally filtered by wallet)
function getOnChainTxHistory(walletAddress = null) {
  try {
    const raw = localStorage.getItem('admin_onchain_tx_history');
    const history = raw ? JSON.parse(raw) : [];
    if (!walletAddress) return history;
    const target = walletAddress.toLowerCase();
    return history.filter(tx => 
      (tx.from && tx.from.toLowerCase() === target) || 
      (tx.to && tx.to.toLowerCase() === target)
    );
  } catch (e) {
    return [];
  }
}

// Fetch live BSC network gas price and speed indicator
async function fetchBscGasTracker() {
  const gweiEl = document.getElementById('treasury-gas-gwei');
  if (!gweiEl) return;
  try {
    const provider = getBscJsonRpcProvider();
    if (!provider) return;
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 50000000n;
    const gwei = Number(gasPrice) / 1e9;
    gweiEl.innerText = gwei < 0.1 ? gwei.toFixed(2) + ' Gwei' : gwei.toFixed(1) + ' Gwei';
  } catch (e) {}
}

function getBscJsonRpcProvider() {
  if (typeof ethers === 'undefined') return null;
  return new ethers.JsonRpcProvider(BSC_PUBLIC_RPCS[0]);
}

// Low-level fast balance query using direct JSON-RPC calls for a single address
async function fetchOnChainWalletBalances(address) {
  const map = await fetchBatchOnChainBalances([address]);
  return map[address.toLowerCase()] || { usdt: 0, bnb: 0 };
}

// High-performance JSON-RPC Batch query: queries both USDT and BNB for up to 20 addresses in a single HTTP request!
async function fetchBatchOnChainBalances(addresses) {
  if (!addresses || addresses.length === 0) return {};

  const cleanAddrs = addresses.map(a => a.toLowerCase());
  const batchPayload = [];
  cleanAddrs.forEach((addr, idx) => {
    const padded = addr.replace('0x', '').padStart(64, '0');
    // 1. USDT balanceOf (id = idx * 3 + 1)
    batchPayload.push({
      jsonrpc: '2.0',
      id: idx * 3 + 1,
      method: 'eth_call',
      params: [{
        to: BSC_USDT_ADDR,
        data: '0x70a08231' + padded
      }, 'latest']
    });
    // 2. BNB eth_getBalance (id = idx * 3 + 2)
    batchPayload.push({
      jsonrpc: '2.0',
      id: idx * 3 + 2,
      method: 'eth_getBalance',
      params: [addr, 'latest']
    });
    // 3. Nonce eth_getTransactionCount (id = idx * 3 + 3)
    batchPayload.push({
      jsonrpc: '2.0',
      id: idx * 3 + 3,
      method: 'eth_getTransactionCount',
      params: [addr, 'latest']
    });
  });

  for (let rpc of BSC_PUBLIC_RPCS) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchPayload),
        signal: AbortSignal.timeout(5000)
      }).then(r => r.json());

      if (Array.isArray(response)) {
        const resultMap = {};
        response.forEach(item => {
          if (item && item.id != null) resultMap[item.id] = item.result;
        });

        const balances = {};
        cleanAddrs.forEach((addr, idx) => {
          let usdtBal = 0;
          let bnbBal = 0;
          let nonce = 0;
          const usdtHex = resultMap[idx * 3 + 1];
          const bnbHex = resultMap[idx * 3 + 2];
          const nonceHex = resultMap[idx * 3 + 3];

          if (usdtHex && usdtHex !== '0x') {
            try {
              usdtBal = Number(BigInt(usdtHex)) / 1e18;
            } catch (e) {}
          }
          if (bnbHex && bnbHex !== '0x') {
            try {
              bnbBal = Number(BigInt(bnbHex)) / 1e18;
            } catch (e) {}
          }
          if (nonceHex && nonceHex !== '0x') {
            try {
              nonce = Number(BigInt(nonceHex));
            } catch (e) {}
          }
          balances[addr] = { usdt: usdtBal, bnb: bnbBal, nonce: nonce };
        });
        return balances;
      }
    } catch (e) {
      console.warn('Batch RPC failover on:', rpc, e.message);
    }
  }

  // Fallback if batching fails
  const fallback = {};
  cleanAddrs.forEach(a => { fallback[a] = { usdt: 0, bnb: 0, nonce: 0 }; });
  return fallback;
}

// Fetch and display live on-chain balance of the Admin Master Vault
async function updateMainVaultLiveBalance() {
  const el = document.getElementById('main-vault-live-balance');
  if (!el) return;
  try {
    const bal = await fetchOnChainWalletBalances(ADMIN_PERMANENT_MASTER_WALLET);
    el.innerHTML = `Live Vault: <strong style="color:#00e676;">$${bal.usdt.toFixed(2)} USDT</strong> <span style="color:#a0a5b5; font-size:11px;">(${bal.bnb.toFixed(5)} BNB)</span>`;
  } catch (e) {
    el.innerText = 'Vault: Active';
  }
}

// Calculate & update the top cards on Treasury page in real-time
function updateTreasuryStatsSummary() {
  let totalSubLiveUsdt = 0;
  let totalUserLiveUsdt = 0;
  let totalLiveBnb = 0;
  let activeBalanceCount = 0;
  let onChainActivityCount = 0;

  treasuryWallets.forEach(w => {
    const u = w.usdt || 0;
    const b = w.bnb || 0;
    const uu = w.userUsdt || 0;
    const ub = w.userBnb || 0;
    totalSubLiveUsdt += u;
    totalUserLiveUsdt += uu;
    totalLiveBnb += (b + ub);

    const hasFunds = (u > 0.01 || b > 0.00001 || uu > 0.01 || ub > 0.00001);
    if (hasFunds) activeBalanceCount++;

    const hasActivity = hasFunds || (w.nonce || 0) > 0 || (w.userNonce || 0) > 0 || (w.swept || 0) > 0;
    if (hasActivity) onChainActivityCount++;
  });

  const totalEl = document.getElementById('t-total-wallets');
  if (totalEl) totalEl.innerText = treasuryWallets.length;

  const activeEl = document.getElementById('t-active-wallets');
  if (activeEl) activeEl.innerText = activeBalanceCount;
  const badgeOnChainEl = document.getElementById('t-active-onchain-badge');
  if (badgeOnChainEl) badgeOnChainEl.innerText = `${activeBalanceCount} Active on BSC`;

  // Top Card: User Web3 Wallets Live USDT
  const recEl = document.getElementById('t-total-received');
  if (recEl) {
    recEl.innerText = '$' + totalUserLiveUsdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USDT';
  }
  const countEl = document.getElementById('t-total-received-count');
  if (countEl) {
    countEl.innerText = `● Live in User Wallets (${activeBalanceCount} Funded)`;
  }

  // Sub-Wallets Live USDT
  const usdtEl = document.getElementById('t-total-usdt');
  if (usdtEl) usdtEl.innerText = '$' + totalSubLiveUsdt.toFixed(2) + ' USDT';

  // Sub-Wallets + User Wallets Total BNB Gas
  const bnbEl = document.getElementById('t-total-bnb');
  if (bnbEl) bnbEl.innerText = totalLiveBnb.toFixed(4) + ' BNB';

  const badgeEl = document.getElementById('badge-treasury');
  if (badgeEl) {
    badgeEl.innerText = activeBalanceCount;
    badgeEl.style.display = activeBalanceCount > 0 ? 'inline-block' : 'none';
  }
}

// Load Treasury page initial state with local cache for zero delay
async function loadTreasury() {
  updateMainVaultLiveBalance();
  fetchBscGasTracker();

  // 1. Load Admin Master Receiver Address
  try {
    const { data: settings } = await supabaseClient
      .from('app_settings')
      .select('usdt_bep20_address')
      .eq('id', true)
      .maybeSingle();

    const masterInput = document.getElementById('treasury-master-address');
    if (masterInput) {
      const saved = settings?.usdt_bep20_address || localStorage.getItem('admin_master_sweep_wallet') || ADMIN_PERMANENT_MASTER_WALLET;
      masterInput.value = saved;
    }
  } catch (e) {
    console.error('Error loading master address:', e);
  }

  // 2. Fetch all monitored deposit wallets AND deposit submissions simultaneously
  try {
    const [profsRes, subsRes] = await Promise.all([
      supabaseClient
        .from('profiles')
        .select('id, full_name, phone, usdt_address, wallet_address, private_key, created_at')
        .not('usdt_address', 'is', null)
        .order('created_at', { ascending: false }),
      supabaseClient
        .from('task_submissions')
        .select('*')
        .order('submitted_at', { ascending: false })
    ]);

    if (profsRes.error) throw profsRes.error;
    const profs = profsRes.data || [];
    treasurySubmissions = subsRes.data || [];

    // Map submissions by user_id and calculate gross received
    const userSubsMap = {};
    const userProfileMap = {};
    profs.forEach(p => { userProfileMap[p.id] = p; });

    let grossAll = 0;
    treasurySubmissions.forEach(s => {
      const amt = parseFloat(s.amount || 0);
      grossAll += amt;
      s.profile = userProfileMap[s.user_id] || null;
      const uid = s.user_id;
      if (uid) {
        if (!userSubsMap[uid]) userSubsMap[uid] = [];
        userSubsMap[uid].push(s);
      }
    });
    totalLifetimeReceived = grossAll;
    totalReceivedCount = treasurySubmissions.length;

    // Load cached balances for immediate display
    let cachedBalances = {};
    try {
      const rawCache = localStorage.getItem('admin_cached_wallet_balances');
      if (rawCache) cachedBalances = JSON.parse(rawCache);
    } catch (e) {}

    const onchainHistory = getOnChainTxHistory();
    treasuryWallets = profs.map(p => {
      const subAddrLower = (p.usdt_address || '').toLowerCase();
      const userAddrLower = (p.wallet_address || '').toLowerCase();
      const cachedSub = cachedBalances[subAddrLower];
      const cachedUser = userAddrLower ? cachedBalances[userAddrLower] : null;
      const userSubs = userSubsMap[p.id] || [];
      const walletReceived = userSubs.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
      const walletSweeps = onchainHistory
        .filter(tx => tx.from && tx.from.toLowerCase() === subAddrLower && tx.asset === 'USDT')
        .reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);

      return {
        userId: p.id,
        name: p.full_name || 'USDT Trader',
        phone: p.phone || 'N/A',
        address: p.usdt_address,
        walletAddress: p.wallet_address || '',
        privateKey: p.private_key || '',
        usdt: cachedSub ? (cachedSub.usdt || 0) : 0,
        bnb: cachedSub ? (cachedSub.bnb || 0) : 0,
        nonce: cachedSub ? (cachedSub.nonce || 0) : 0,
        userUsdt: cachedUser ? (cachedUser.usdt || 0) : 0,
        userBnb: cachedUser ? (cachedUser.bnb || 0) : 0,
        userNonce: cachedUser ? (cachedUser.nonce || 0) : 0,
        swept: walletSweeps,
        totalReceived: walletReceived,
        depositsCount: userSubs.length,
        submissions: userSubs,
        scanned: !!(cachedSub || cachedUser)
      };
    });

    // Immediate zero-latency UI display
    updateTreasuryStatsSummary();
    filterTreasuryTable();

    // Auto-trigger background batch scan
    startTreasuryAutoPoll();
    if (treasuryWallets.length > 0) {
      setTimeout(() => scanAllTreasuryWallets(true), 50);
    }
  } catch (err) {
    console.error('loadTreasury error:', err);
    toast('Error loading wallets: ' + err.message, 'error');
  }
}

// Background real-time poller: scans all wallets silently every 15s
let adminTreasuryPollInterval = null;

function startTreasuryAutoPoll() {
  if (!adminTreasuryPollInterval) {
    adminTreasuryPollInterval = setInterval(() => {
      if (currentPage === 'treasury') {
        fetchBscGasTracker();
        const dot = document.getElementById('treasury-sync-dot');
        if (dot) {
          dot.style.background = '#00e5ff';
          dot.style.boxShadow = '0 0 10px #00e5ff';
        }
        scanAllTreasuryWallets(true).finally(() => {
          if (dot) {
            dot.style.background = '#00e676';
            dot.style.boxShadow = '0 0 6px #00e676';
          }
        });
      }
    }, 15000); // 15 seconds real-time cycle
  }
}

function stopTreasuryAutoPoll() {
  if (adminTreasuryPollInterval) {
    clearInterval(adminTreasuryPollInterval);
    adminTreasuryPollInterval = null;
  }
}

// Save Admin Master Sweep Destination Wallet
async function saveTreasuryMasterAddress() {
  const input = document.getElementById('treasury-master-address');
  if (!input) return;
  const addr = input.value.trim();

  if (!addr || !addr.startsWith('0x') || addr.length !== 42) {
    toast('Invalid BEP20 address! Must start with 0x and be 42 characters.', 'error');
    return;
  }

  localStorage.setItem('admin_master_sweep_wallet', addr);

  try {
    const { error } = await supabaseClient
      .from('app_settings')
      .update({ usdt_bep20_address: addr })
      .eq('id', true);

    if (error) throw error;
    toast('Master Sweep Wallet updated and saved to Database! ✓', 'success');
  } catch (e) {
    toast('Saved locally! Database update note: ' + e.message, 'info');
  }
}

// Scan all monitored wallets using high-speed JSON-RPC Batching
async function scanAllTreasuryWallets(silent = false) {
  if (isScanningTreasury || treasuryWallets.length === 0) return;
  isScanningTreasury = true;

  const banner = document.getElementById('treasury-status-banner');
  const statusText = document.getElementById('treasury-status-text');
  const statusPct = document.getElementById('treasury-status-pct');
  const btnScan = document.getElementById('btn-scan-treasury');
  const icon = document.getElementById('scan-btn-icon');

  if (!silent) {
    if (banner) banner.style.display = 'flex';
    if (btnScan) btnScan.style.opacity = '0.6';
    if (icon) icon.innerText = '⏳';
  }

  // Collect all unique addresses (both deposit sub-wallets and user personal wallets)
  const addressSet = new Set();
  treasuryWallets.forEach(w => {
    if (w.address && w.address.startsWith('0x')) addressSet.add(w.address.toLowerCase());
    if (w.walletAddress && w.walletAddress.startsWith('0x')) addressSet.add(w.walletAddress.toLowerCase());
  });
  const allAddrs = Array.from(addressSet);

  const total = allAddrs.length;
  let completed = 0;
  const batchSize = 20; // 20 addresses per batch call

  const balanceMap = {};

  for (let i = 0; i < total; i += batchSize) {
    const chunk = allAddrs.slice(i, i + batchSize);
    try {
      const chunkMap = await fetchBatchOnChainBalances(chunk);
      Object.assign(balanceMap, chunkMap);

      // Progressively update table and stats as soon as each batch arrives
      treasuryWallets.forEach(w => {
        const subBal = balanceMap[(w.address || '').toLowerCase()];
        if (subBal) {
          w.usdt = subBal.usdt;
          w.bnb = subBal.bnb;
          w.nonce = subBal.nonce || 0;
        }
        if (w.walletAddress && w.walletAddress.startsWith('0x')) {
          const userBal = balanceMap[w.walletAddress.toLowerCase()];
          if (userBal) {
            w.userUsdt = userBal.usdt;
            w.userBnb = userBal.bnb;
            w.userNonce = userBal.nonce || 0;
          }
        }
        w.scanned = true;
      });

      updateTreasuryStatsSummary();
      filterTreasuryTable();
    } catch (e) {
      console.warn('Batch scan error:', e);
    } finally {
      completed += chunk.length;
      if (!silent) {
        const pct = Math.min(100, Math.round((completed / total) * 100));
        if (statusPct) statusPct.innerText = pct + '%';
        if (statusText) statusText.innerText = `Scanning BSC blockchain (${completed}/${total} addresses checked)...`;
      }
    }
  }

  // Cache fresh on-chain balances to localStorage
  try {
    localStorage.setItem('admin_cached_wallet_balances', JSON.stringify(balanceMap));
  } catch (e) {}

  updateMainVaultLiveBalance();

  if (!silent) {
    if (banner) banner.style.display = 'none';
    if (btnScan) btnScan.style.opacity = '1';
    if (icon) icon.innerText = '🔄';
    const totalUserUsdt = treasuryWallets.reduce((acc, w) => acc + (w.userUsdt || 0), 0);
    const activeWalletsCount = treasuryWallets.filter(w => (w.userUsdt || 0) > 0.01 || (w.usdt || 0) > 0.01 || (w.bnb || 0) > 0.00001 || (w.userBnb || 0) > 0.00001).length;
    toast(`Scan Complete! $${totalUserUsdt.toFixed(2)} USDT live across ${activeWalletsCount} active wallet(s) ✓`, 'success');
  }
  isScanningTreasury = false;
}

// Instant on-chain refresh for a single wallet in ~200ms
async function refreshSingleWalletBalance(address, silent = false) {
  const w = treasuryWallets.find(x => 
    (x.address && x.address.toLowerCase() === address.toLowerCase()) ||
    (x.walletAddress && x.walletAddress.toLowerCase() === address.toLowerCase())
  );
  if (!w) return null;
  if (!silent) toast(`Syncing ${address.substring(0,8)}... with BSC blockchain...`, 'info');

  try {
    const addrsToSync = [w.address];
    if (w.walletAddress && w.walletAddress.startsWith('0x') && w.walletAddress.toLowerCase() !== w.address.toLowerCase()) {
      addrsToSync.push(w.walletAddress);
    }
    const balanceMap = await fetchBatchOnChainBalances(addrsToSync);
    const subBal = balanceMap[(w.address || '').toLowerCase()];
    if (subBal) {
      w.usdt = subBal.usdt;
      w.bnb = subBal.bnb;
      w.nonce = subBal.nonce || 0;
    }
    if (w.walletAddress) {
      const userBal = balanceMap[w.walletAddress.toLowerCase()];
      if (userBal) {
        w.userUsdt = userBal.usdt;
        w.userBnb = userBal.bnb;
        w.userNonce = userBal.nonce || 0;
      }
    }
    w.scanned = true;

    // Update cache
    try {
      const raw = localStorage.getItem('admin_cached_wallet_balances');
      const cache = raw ? JSON.parse(raw) : {};
      if (w.address) cache[w.address.toLowerCase()] = { usdt: w.usdt, bnb: w.bnb, nonce: w.nonce || 0 };
      if (w.walletAddress) cache[w.walletAddress.toLowerCase()] = { usdt: w.userUsdt, bnb: w.userBnb, nonce: w.userNonce || 0 };
      localStorage.setItem('admin_cached_wallet_balances', JSON.stringify(cache));
    } catch (e) {}

    updateTreasuryStatsSummary();
    filterTreasuryTable();

    // If TokenPocket modal is open for this wallet, update modal UI live
    if (activeTpWallet && activeTpWallet.address.toLowerCase() === address.toLowerCase()) {
      updateTokenPocketModalUI(w);
    }

    if (!silent) toast(`Updated! User: $${(w.userUsdt||0).toFixed(2)} USDT | Sub: $${w.usdt.toFixed(2)} USDT ✓`, 'success');
  } catch (e) {
    console.error('Error refreshing single wallet:', e);
  }
  return w;
}

// Open TokenPocket All-In-One Wallet Manager Modal
function openTokenPocketModal(address) {
  const w = treasuryWallets.find(x => x.address.toLowerCase() === address.toLowerCase());
  if (!w) {
    toast('Wallet not found!', 'error');
    return;
  }
  activeTpWallet = w;

  updateTokenPocketModalUI(w);
  tpSwitchTab('transfer');

  // Background refresh to guarantee fresh on-chain data
  refreshSingleWalletBalance(w.address, true);

  openModal('tokenpocket-wallet-modal');
}

// Update TokenPocket Modal Elements
function updateTokenPocketModalUI(w) {
  const subEl = document.getElementById('tp-modal-user-subtitle');
  if (subEl) subEl.innerText = `${escapeHtml(w.name)} (${escapeHtml(w.phone)})`;

  const addrEl = document.getElementById('tp-card-address');
  if (addrEl) addrEl.innerText = w.address;

  const bscLink = document.getElementById('tp-card-bscscan-link');
  if (bscLink) bscLink.href = `https://bscscan.com/address/${w.address}`;

  const usdtEl = document.getElementById('tp-card-usdt');
  if (usdtEl) usdtEl.innerText = `$${(w.usdt || 0).toFixed(2)} USDT`;

  const bnbEl = document.getElementById('tp-card-bnb');
  if (bnbEl) bnbEl.innerText = `${(w.bnb || 0).toFixed(5)} BNB`;

  const estNetworth = (w.usdt || 0) + ((w.bnb || 0) * 600);
  const netEl = document.getElementById('tp-card-networth');
  if (netEl) netEl.innerText = `$${estNetworth.toFixed(2)}`;

  const hasGas = (w.bnb || 0) >= MIN_SWEEP_GAS_BNB;
  const gasBadge = document.getElementById('tp-card-gas-badge');
  if (gasBadge) {
    gasBadge.innerText = hasGas ? 'Gas Ready ✓' : 'Needs Gas ⚠️';
    gasBadge.style.color = hasGas ? '#00e676' : '#ffc107';
    gasBadge.style.background = hasGas ? 'rgba(0,230,118,0.2)' : 'rgba(255,193,7,0.2)';
  }

  const transferAvail = document.getElementById('tp-transfer-avail-label');
  const selectedAsset = document.querySelector('input[name="tp-asset"]:checked')?.value || 'USDT';
  if (transferAvail) {
    transferAvail.innerText = selectedAsset === 'USDT' 
      ? `Avail: ${(w.usdt || 0).toFixed(2)} USDT` 
      : `Avail: ${(w.bnb || 0).toFixed(5)} BNB`;
  }

  const gasStatus = document.getElementById('tp-gas-check-status');
  if (gasStatus) {
    gasStatus.innerText = hasGas ? 'Gas Ready ✓' : 'Low Gas ⚠️';
    gasStatus.style.color = hasGas ? '#00e676' : '#ffc107';
  }

  // QR Code Image
  const qrImg = document.getElementById('tp-qr-img');
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(w.address)}`;
  }
  const recvAddr = document.getElementById('tp-receive-addr-text');
  if (recvAddr) recvAddr.innerText = w.address;

  // Donor wallet detection for Gas Refuel tab
  const donor = treasuryWallets.find(x => 
    x.address.toLowerCase() !== w.address.toLowerCase() && 
    x.bnb >= 0.00003 && 
    !!x.privateKey
  );
  const donorNameEl = document.getElementById('tp-donor-wallet-name');
  const donorBnbEl = document.getElementById('tp-donor-wallet-bnb');
  if (donorNameEl && donorBnbEl) {
    if (donor) {
      donorNameEl.innerText = `${donor.name} (${donor.address.substring(0, 8)}...)`;
      donorBnbEl.innerText = `${donor.bnb.toFixed(5)} BNB`;
    } else {
      donorNameEl.innerText = 'No donor sub-wallet with BNB found';
      donorBnbEl.innerText = '0.0000 BNB';
    }
  }

  // Sweepers Tab Available Amounts
  const sweepUsdt = document.getElementById('tp-sweep-avail-usdt');
  if (sweepUsdt) sweepUsdt.innerText = `$${(w.usdt || 0).toFixed(2)} USDT`;

  const sweepBnb = document.getElementById('tp-sweep-avail-bnb');
  if (sweepBnb) sweepBnb.innerText = `${(w.bnb || 0).toFixed(5)} BNB`;

  const sweepVault = document.getElementById('tp-sweep-vault-addr');
  if (sweepVault) sweepVault.innerText = ADMIN_PERMANENT_MASTER_WALLET.substring(0, 10) + '...';

  // Private Key Tab
  const pkeyEl = document.getElementById('tp-key-textarea');
  if (pkeyEl) pkeyEl.value = w.privateKey || 'No private key stored for this wallet.';

  // History Tab Elements
  const histInEl = document.getElementById('tp-hist-total-in');
  if (histInEl) histInEl.innerText = `$${(w.totalReceived || 0).toFixed(2)}`;

  const histLiveEl = document.getElementById('tp-hist-live-bal');
  if (histLiveEl) histLiveEl.innerText = `$${(w.usdt || 0).toFixed(2)}`;

  const subs = w.submissions || [];
  const inCountEl = document.getElementById('tp-hist-in-count');
  if (inCountEl) inCountEl.innerText = subs.length;

  const walletOutgoing = getOnChainTxHistory(w.address).filter(tx => 
    tx.from && tx.from.toLowerCase() === (w.address || '').toLowerCase()
  );
  const totalSweptUsdt = walletOutgoing
    .filter(tx => tx.asset === 'USDT')
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const histOutEl = document.getElementById('tp-hist-total-out');
  if (histOutEl) histOutEl.innerText = `$${totalSweptUsdt.toFixed(2)}`;

  const outCountEl = document.getElementById('tp-hist-out-count');
  if (outCountEl) outCountEl.innerText = walletOutgoing.length;

  // Render Incoming deposits
  const listInEl = document.getElementById('tp-hist-list-in');
  if (listInEl) {
    if (subs.length === 0) {
      listInEl.innerHTML = `<div class="empty-state" style="padding:16px; font-size:11.5px;">No deposit records found for this user.</div>`;
    } else {
      listInEl.innerHTML = subs.map(s => {
        const dateStr = (s.submitted_at || s.created_at) ? new Date(s.submitted_at || s.created_at).toLocaleString() : 'N/A';
        const st = (s.status || 'pending').toLowerCase();
        const stColor = st === 'refunded' ? '#00e676' : (st === 'rejected' ? '#ff3d00' : (st === 'approved' ? '#00e5ff' : '#ffc107'));
        const stLabel = st === 'refunded' ? 'Paid / Refunded' : (s.status || 'Pending');
        const txProof = s.transaction_id || s.sender_number || 'N/A';
        return `
          <div style="background:var(--bg2); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-weight:800; color:#00e676; font-size:12.5px; font-family:monospace;">+$${parseFloat(s.amount || 0).toFixed(2)} USDT</span>
                <span style="font-size:9.5px; padding:1px 5px; border-radius:4px; font-weight:700; background:rgba(255,255,255,0.06); color:${stColor}; border:1px solid ${stColor}40;">${escapeHtml(stLabel)}</span>
              </div>
              <div style="font-size:10.5px; color:var(--txt3); margin-top:2px; font-family:monospace; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(txProof)}">
                Proof: ${escapeHtml(txProof)}
              </div>
            </div>
            <div style="text-align:right;">
              <span style="font-size:10px; color:var(--txt3); display:block;">${escapeHtml(dateStr)}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Render Outgoing sweeps
  const listOutEl = document.getElementById('tp-hist-list-out');
  if (listOutEl) {
    if (walletOutgoing.length === 0) {
      listOutEl.innerHTML = `<div class="empty-state" style="padding:16px; font-size:11.5px;">No on-chain sweeps recorded for this wallet yet.</div>`;
    } else {
      listOutEl.innerHTML = walletOutgoing.map(tx => {
        const timeStr = tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'Recent';
        const typeLabel = tx.type === 'sweep_usdt' ? 'USDT Sweep' : (tx.type === 'sweep_bnb' ? 'BNB Sweep' : (tx.type === 'gas_refuel' ? 'Gas Refuel' : 'Transfer'));
        const amtStr = tx.asset === 'USDT' ? `$${(tx.amount || 0).toFixed(2)} USDT` : `${(tx.amount || 0).toFixed(5)} BNB`;
        const bscScanLink = tx.hash ? `https://bscscan.com/tx/${tx.hash}` : null;
        return `
          <div style="background:var(--bg2); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-weight:800; color:#f0b90b; font-size:12px; font-family:monospace;">-${amtStr}</span>
                <span style="font-size:9.5px; padding:1px 5px; border-radius:4px; font-weight:700; background:rgba(240,185,11,0.1); color:#f0b90b; border:1px solid rgba(240,185,11,0.3);">${escapeHtml(typeLabel)}</span>
              </div>
              <div style="font-size:10.5px; color:var(--txt3); margin-top:2px;">
                To: <span style="font-family:monospace; color:var(--cyan);">${tx.to ? tx.to.substring(0, 10) + '...' : 'Vault'}</span>
                ${bscScanLink ? `<a href="${bscScanLink}" target="_blank" style="color:var(--cyan); margin-left:6px; text-decoration:none;">View ↗</a>` : ''}
              </div>
            </div>
            <div style="text-align:right;">
              <span style="font-size:10px; color:var(--txt3); display:block;">${escapeHtml(timeStr)}</span>
              <span style="font-size:9.5px; color:#00e676; font-weight:700;">Confirmed ✓</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Hide terminal log initially
  const logEl = document.getElementById('tp-modal-log');
  if (logEl) {
    logEl.style.display = 'none';
    logEl.innerHTML = '';
  }
}

// Switch tabs inside TokenPocket modal
function tpSwitchTab(tabName) {
  const tabs = ['transfer', 'receive', 'refuel', 'sweepers', 'history', 'key'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tp-tab-btn-${t}`);
    const content = document.getElementById(`tp-tab-content-${t}`);
    if (t === tabName) {
      if (btn) {
        btn.style.background = 'rgba(0,229,255,0.15)';
        btn.style.color = 'var(--cyan)';
        btn.style.borderColor = 'rgba(0,229,255,0.4)';
        btn.style.fontWeight = '800';
      }
      if (content) content.style.display = 'block';
    } else {
      if (btn) {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--txt2)';
        btn.style.borderColor = 'var(--border)';
        btn.style.fontWeight = '400';
      }
      if (content) content.style.display = 'none';
    }
  });
}

// Switch subtab inside History tab (Incoming deposits vs Outgoing sweeps)
function tpSwitchHistorySubtab(subtab) {
  const btnIn = document.getElementById('tp-hist-subtab-in');
  const btnOut = document.getElementById('tp-hist-subtab-out');
  const listIn = document.getElementById('tp-hist-list-in');
  const listOut = document.getElementById('tp-hist-list-out');

  if (subtab === 'in') {
    if (btnIn) {
      btnIn.style.background = 'rgba(0,230,118,0.15)';
      btnIn.style.color = '#00e676';
      btnIn.style.borderColor = 'rgba(0,230,118,0.3)';
      btnIn.style.fontWeight = '800';
    }
    if (btnOut) {
      btnOut.style.background = 'transparent';
      btnOut.style.color = 'var(--txt2)';
      btnOut.style.borderColor = 'var(--border)';
      btnOut.style.fontWeight = '400';
    }
    if (listIn) listIn.style.display = 'flex';
    if (listOut) listOut.style.display = 'none';
  } else {
    if (btnOut) {
      btnOut.style.background = 'rgba(240,185,11,0.15)';
      btnOut.style.color = '#f0b90b';
      btnOut.style.borderColor = 'rgba(240,185,11,0.3)';
      btnOut.style.fontWeight = '800';
    }
    if (btnIn) {
      btnIn.style.background = 'transparent';
      btnIn.style.color = 'var(--txt2)';
      btnIn.style.borderColor = 'var(--border)';
      btnIn.style.fontWeight = '400';
    }
    if (listIn) listIn.style.display = 'none';
    if (listOut) listOut.style.display = 'flex';
  }
}

// Handle asset radio change in Transfer tab
function tpOnAssetChange() {
  if (!activeTpWallet) return;
  const asset = document.querySelector('input[name="tp-asset"]:checked')?.value || 'USDT';
  const badge = document.getElementById('tp-transfer-symbol-badge');
  const avail = document.getElementById('tp-transfer-avail-label');
  if (badge) badge.innerText = asset;
  if (avail) {
    avail.innerText = asset === 'USDT' 
      ? `Avail: ${(activeTpWallet.usdt || 0).toFixed(2)} USDT` 
      : `Avail: ${(activeTpWallet.bnb || 0).toFixed(5)} BNB`;
  }
}

// Percentage preset buttons (25%, 50%, 75%, 100%)
function tpSetAmountPct(pct) {
  if (!activeTpWallet) return;
  const asset = document.querySelector('input[name="tp-asset"]:checked')?.value || 'USDT';
  const input = document.getElementById('tp-transfer-amount');
  if (!input) return;

  if (asset === 'USDT') {
    const total = activeTpWallet.usdt || 0;
    const calc = total * pct;
    input.value = calc <= 0 ? '0' : calc.toFixed(2);
  } else {
    // BNB: leave enough for gas
    const total = activeTpWallet.bnb || 0;
    const estGas = 0.000025;
    if (pct === 1.00) {
      const maxBnb = Math.max(0, total - estGas);
      input.value = maxBnb.toFixed(6);
    } else {
      const calc = (total * pct);
      input.value = calc <= 0 ? '0' : calc.toFixed(6);
    }
  }
}

// Paste Admin Permanent Master Vault address into recipient field
function tpPasteMasterVault() {
  const input = document.getElementById('tp-transfer-to');
  if (input) {
    input.value = ADMIN_PERMANENT_MASTER_WALLET;
    toast('Master Vault address pasted ✓', 'success');
  }
}

// Copy deposit address
function tpCopyAddress() {
  if (activeTpWallet) {
    navigator.clipboard.writeText(activeTpWallet.address);
    toast('Deposit address copied! ✓', 'success');
  }
}

// Copy private key
function tpCopyPrivateKey() {
  if (activeTpWallet && activeTpWallet.privateKey) {
    navigator.clipboard.writeText(activeTpWallet.privateKey);
    toast('Private key copied to clipboard! ✓', 'success');
  } else {
    toast('No private key available to copy.', 'error');
  }
}

// Single-wallet live refresh button in TokenPocket modal
function tpRefreshCurrentWallet() {
  if (activeTpWallet) {
    const btn = document.getElementById('tp-btn-refresh');
    if (btn) btn.innerText = 'Syncing...';
    refreshSingleWalletBalance(activeTpWallet.address).finally(() => {
      if (btn) btn.innerText = '🔄 Refresh Balance';
    });
  }
}

// Execute custom on-chain transfer directly signed by this wallet's private key
async function tpExecuteCustomTransfer() {
  if (!activeTpWallet) return;
  const { address, privateKey } = activeTpWallet;
  if (!privateKey) {
    toast('Private key missing for this wallet! Cannot sign on-chain.', 'error');
    return;
  }

  const asset = document.querySelector('input[name="tp-asset"]:checked')?.value || 'USDT';
  const toAddr = (document.getElementById('tp-transfer-to')?.value || '').trim();
  const amountStr = (document.getElementById('tp-transfer-amount')?.value || '').trim();
  const amount = parseFloat(amountStr);

  if (!toAddr || !toAddr.startsWith('0x') || toAddr.length !== 42) {
    toast('Invalid recipient address! Must start with 0x and be 42 characters.', 'error');
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    toast('Please enter a valid transfer amount greater than 0.', 'error');
    return;
  }

  const confirmMsg = `Transfer ${amount} ${asset} from ${address.substring(0,8)}... to ${toAddr.substring(0,8)}...?\n\nThis transaction will be broadcast directly on the Binance Smart Chain.`;
  if (!confirm(confirmMsg)) return;

  const logEl = document.getElementById('tp-modal-log');
  const btn = document.getElementById('tp-btn-send-transfer');
  if (logEl) {
    logEl.style.display = 'block';
    logEl.innerHTML = `<div style="color:var(--cyan);">[${new Date().toLocaleTimeString()}] Initializing ${asset} on-chain transfer...</div>`;
  }
  if (btn) btn.disabled = true;

  try {
    const provider = getBscJsonRpcProvider();
    const signer = new ethers.Wallet(privateKey, provider);

    if (asset === 'USDT') {
      if ((activeTpWallet.bnb || 0) < 0.000015) {
        throw new Error('This wallet has no BNB gas (~0.00002 BNB needed). Refuel gas first!');
      }

      if (logEl) logEl.innerHTML += `<div style="color:#a0a5b5;">Preparing BEP-20 USDT transfer...</div>`;
      const tokenContract = new ethers.Contract(BSC_USDT_ADDR, [
        'function transfer(address to, uint256 amount) returns (bool)'
      ], signer);

      const amountWei = ethers.parseUnits(amount.toFixed(6), 18);
      const tx = await tokenContract.transfer(toAddr, amountWei);
      if (logEl) {
        logEl.innerHTML += `<div style="color:#00e676;">Tx Broadcasted! Hash: ${tx.hash.substring(0, 20)}...</div>`;
        logEl.innerHTML += `<div style="color:#a0a5b5;">Awaiting confirmation...</div>`;
      }
      await tx.wait(1);
      recordOnChainTx({
        type: 'custom_transfer',
        asset: 'USDT',
        amount: amount,
        from: address,
        to: toAddr,
        hash: tx.hash,
        status: 'confirmed'
      });
      if (logEl) {
        logEl.innerHTML += `<div style="color:#00e676; font-weight:800;">✅ Confirmed on BSC!</div>`;
        logEl.innerHTML += `<div><a href="https://bscscan.com/tx/${tx.hash}" target="_blank" style="color:var(--cyan);">View on BscScan ↗</a></div>`;
      }
      toast(`Sent ${amount} USDT successfully! 🚀`, 'success');
    } else {
      // BNB Native Transfer
      if (logEl) logEl.innerHTML += `<div style="color:#a0a5b5;">Preparing BNB transfer...</div>`;
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || 50000000n;
      let exactGas = 21210n;
      try {
        exactGas = await provider.estimateGas({ to: toAddr, value: 0n });
      } catch (e) {
        exactGas = 21210n;
      }
      const gasCost = exactGas * gasPrice;

      const balanceWei = await provider.getBalance(address);
      let sendWei = ethers.parseEther(amount.toString());

      if (sendWei + gasCost > balanceWei) {
        // Auto-adjust if close to max
        if (balanceWei > gasCost) {
          sendWei = balanceWei - gasCost;
          if (logEl) logEl.innerHTML += `<div style="color:#ffc107;">Adjusted to max transferable BNB: ${ethers.formatEther(sendWei)} BNB</div>`;
        } else {
          throw new Error('Insufficient BNB to cover gas fee and transfer.');
        }
      }

      const tx = await signer.sendTransaction({
        to: toAddr,
        value: sendWei,
        gasLimit: exactGas,
        gasPrice: gasPrice
      });

      if (logEl) {
        logEl.innerHTML += `<div style="color:#00e676;">Tx Broadcasted! Hash: ${tx.hash.substring(0, 20)}...</div>`;
        logEl.innerHTML += `<div style="color:#a0a5b5;">Awaiting confirmation...</div>`;
      }
      await tx.wait(1);
      recordOnChainTx({
        type: 'custom_transfer',
        asset: 'BNB',
        amount: amount,
        from: address,
        to: toAddr,
        hash: tx.hash,
        status: 'confirmed'
      });
      if (logEl) {
        logEl.innerHTML += `<div style="color:#00e676; font-weight:800;">✅ Confirmed on BSC!</div>`;
        logEl.innerHTML += `<div><a href="https://bscscan.com/tx/${tx.hash}" target="_blank" style="color:var(--cyan);">View on BscScan ↗</a></div>`;
      }
      toast(`Sent ${amount} BNB successfully! 🚀`, 'success');
    }

    // Refresh balance
    setTimeout(() => refreshSingleWalletBalance(address, true), 1000);
  } catch (err) {
    console.error('Transfer failed:', err);
    if (logEl) logEl.innerHTML += `<div style="color:#ff3d00;">❌ Failed: ${err.message}</div>`;
    toast('Transfer failed: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// 1-Click Gas Refuel: transfers 0.00005 BNB from donor sub-wallet to active sub-wallet
async function tpExecuteRefuelGas() {
  if (!activeTpWallet) return;
  const targetAddr = activeTpWallet.address;

  const donor = treasuryWallets.find(x => 
    x.address.toLowerCase() !== targetAddr.toLowerCase() && 
    x.bnb >= 0.00003 && 
    !!x.privateKey
  );

  if (!donor) {
    toast('No donor sub-wallet with BNB found to refuel gas from.', 'error');
    return;
  }

  const btn = document.getElementById('tp-btn-exec-refuel');
  const logEl = document.getElementById('tp-modal-log');
  if (logEl) {
    logEl.style.display = 'block';
    logEl.innerHTML = `<div style="color:var(--cyan);">[${new Date().toLocaleTimeString()}] Transferring 0.00005 BNB gas from ${donor.name} (${donor.address.substring(0,8)}...)...</div>`;
  }
  if (btn) btn.disabled = true;

  try {
    const provider = getBscJsonRpcProvider();
    const donorSigner = new ethers.Wallet(donor.privateKey, provider);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 50000000n;

    const tx = await donorSigner.sendTransaction({
      to: targetAddr,
      value: ethers.parseEther('0.00005'),
      gasLimit: 21210n,
      gasPrice: gasPrice
    });

    if (logEl) logEl.innerHTML += `<div style="color:#00e676;">Tx Sent: ${tx.hash.substring(0, 20)}...</div>`;
    await tx.wait(1);

    recordOnChainTx({
      type: 'gas_refuel',
      asset: 'BNB',
      amount: 0.00005,
      from: donor.address,
      to: targetAddr,
      hash: tx.hash,
      status: 'confirmed'
    });

    if (logEl) logEl.innerHTML += `<div style="color:#00e676; font-weight:800;">✅ Gas Refuel Confirmed! Wallet is ready for transfers.</div>`;
    toast('Gas Refuel Completed! ✓', 'success');

    refreshSingleWalletBalance(donor.address, true);
    refreshSingleWalletBalance(targetAddr, true);
  } catch (err) {
    console.error('Refuel gas error:', err);
    if (logEl) logEl.innerHTML += `<div style="color:#ff3d00;">❌ Refuel Error: ${err.message}</div>`;
    toast('Gas refuel failed: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Trigger Sweep USDT from TokenPocket modal
function tpTriggerSweepUsdt() {
  if (!activeTpWallet) return;
  closeModal('tokenpocket-wallet-modal');
  initiateSingleSweep(activeTpWallet.userId, activeTpWallet.address, activeTpWallet.privateKey, activeTpWallet.usdt, activeTpWallet.bnb);
}

// Trigger Sweep BNB from TokenPocket modal
function tpTriggerSweepBnb() {
  if (!activeTpWallet) return;
  closeModal('tokenpocket-wallet-modal');
  initiateSingleBnbSweep(activeTpWallet.userId, activeTpWallet.address, activeTpWallet.privateKey, activeTpWallet.bnb);
}

// Active view mode and wallet filter for history modal
let currentHistoryViewMode = 'onchain'; // 'onchain' (default) or 'forms'
let currentHistoryWalletFilter = null;

// Switch between On-Chain Blockchain Ledger and Sub-Wallet Deposits
function switchHistoryViewMode(mode) {
  currentHistoryViewMode = mode;
  const btnOnchain = document.getElementById('hist-tab-btn-onchain');
  const btnForms = document.getElementById('hist-tab-btn-forms');
  const bannerOnchain = document.getElementById('hist-banner-onchain');
  const bannerForms = document.getElementById('hist-banner-forms');

  if (mode === 'onchain') {
    if (btnOnchain) {
      btnOnchain.style.background = 'rgba(0,229,255,0.15)';
      btnOnchain.style.color = 'var(--cyan)';
      btnOnchain.style.borderColor = 'rgba(0,229,255,0.4)';
      btnOnchain.style.fontWeight = '800';
    }
    if (btnForms) {
      btnForms.style.background = 'transparent';
      btnForms.style.color = 'var(--txt2)';
      btnForms.style.borderColor = 'var(--border)';
      btnForms.style.fontWeight = '600';
    }
    if (bannerOnchain) bannerOnchain.style.display = 'flex';
    if (bannerForms) bannerForms.style.display = 'none';

    const lbl1 = document.getElementById('hist-modal-lbl-1');
    if (lbl1) lbl1.innerText = 'Live On-Chain USDT';
    const lbl2 = document.getElementById('hist-modal-lbl-2');
    if (lbl2) lbl2.innerText = 'Swept to Master Vault';
    const lbl3 = document.getElementById('hist-modal-lbl-3');
    if (lbl3) lbl3.innerText = 'Active On-Chain Wallets';
  } else {
    if (btnForms) {
      btnForms.style.background = 'rgba(0,230,118,0.15)';
      btnForms.style.color = '#00e676';
      btnForms.style.borderColor = 'rgba(0,230,118,0.4)';
      btnForms.style.fontWeight = '800';
    }
    if (btnOnchain) {
      btnOnchain.style.background = 'transparent';
      btnOnchain.style.color = 'var(--txt2)';
      btnOnchain.style.borderColor = 'var(--border)';
      btnOnchain.style.fontWeight = '600';
    }
    if (bannerOnchain) bannerOnchain.style.display = 'none';
    if (bannerForms) bannerForms.style.display = 'flex';

    const lbl1 = document.getElementById('hist-modal-lbl-1');
    if (lbl1) lbl1.innerText = 'Sub-Wallets Received ($)';
    const lbl2 = document.getElementById('hist-modal-lbl-2');
    if (lbl2) lbl2.innerText = 'Refunded / Paid';
    const lbl3 = document.getElementById('hist-modal-lbl-3');
    if (lbl3) lbl3.innerText = 'Deposits Count';
  }
  filterTreasuryHistoryTable();
}

// Open the Lifetime Deposit Received History Modal
function openTreasuryHistoryModal(walletFilter = null, defaultMode = 'onchain') {
  currentHistoryWalletFilter = walletFilter || null;
  const searchInput = document.getElementById('hist-modal-search');
  if (searchInput) {
    searchInput.value = walletFilter ? walletFilter : '';
  }
  const statusFilter = document.getElementById('hist-modal-status-filter');
  if (statusFilter) {
    statusFilter.value = 'all';
  }
  switchHistoryViewMode(defaultMode);
  openModal('treasury-history-modal');
}

// Filter and render the Deposit History Table
function filterTreasuryHistoryTable() {
  const query = (document.getElementById('hist-modal-search')?.value || '').trim().toLowerCase();
  const status = document.getElementById('hist-modal-status-filter')?.value || 'all';
  const tbody = document.getElementById('hist-modal-tbody');
  if (!tbody) return;

  const onchainCountEl = document.getElementById('hist-onchain-count');
  const formsCountEl = document.getElementById('hist-forms-count');
  if (formsCountEl) formsCountEl.innerText = treasurySubmissions.length;

  if (currentHistoryViewMode === 'onchain') {
    // ════════════════════════════════════════════════════════════════
    // ⛓️ MODE 1: PURE ON-CHAIN BLOCKCHAIN VERIFIED LEDGER
    // ════════════════════════════════════════════════════════════════
    const onchainTxs = getOnChainTxHistory();
    const liveFunded = treasuryWallets.filter(w => w.usdt > 0.01 || w.bnb > 0.00001);

    // Build unified on-chain ledger items
    let onchainItems = [];

    // 1. All recorded on-chain sweeps and transfers
    onchainTxs.forEach(tx => {
      const user = treasuryWallets.find(w => w.address.toLowerCase() === (tx.from || '').toLowerCase());
      onchainItems.push({
        isLiveBalance: false,
        timestamp: tx.timestamp || new Date().toISOString(),
        userName: user ? user.name : 'Sub-Wallet',
        userPhone: user ? user.phone : 'N/A',
        walletAddr: tx.from || 'N/A',
        targetAddr: tx.to || ADMIN_PERMANENT_MASTER_WALLET,
        type: tx.type === 'sweep_usdt' ? 'USDT Sweep ⚡' : (tx.type === 'sweep_bnb' ? 'BNB Sweep 🟡' : (tx.type === 'gas_refuel' ? 'Gas Refuel ⛽' : 'Custom Transfer')),
        asset: tx.asset || 'USDT',
        amount: parseFloat(tx.amount || 0),
        txHash: tx.hash || '',
        status: 'confirmed'
      });
    });

    // 2. Sub-wallets currently holding live funds on BSC
    liveFunded.forEach(w => {
      onchainItems.push({
        isLiveBalance: true,
        timestamp: new Date().toISOString(),
        userName: w.name,
        userPhone: w.phone,
        walletAddr: w.address,
        targetAddr: ADMIN_PERMANENT_MASTER_WALLET,
        type: 'Live On-Chain Balance',
        asset: 'USDT',
        amount: w.usdt,
        bnbAmount: w.bnb,
        txHash: '',
        status: 'live'
      });
    });

    if (onchainCountEl) onchainCountEl.innerText = onchainItems.length;

    // Filter by wallet
    if (currentHistoryWalletFilter) {
      const target = currentHistoryWalletFilter.toLowerCase();
      onchainItems = onchainItems.filter(item => item.walletAddr.toLowerCase() === target);
    }

    // Filter by search query
    if (query) {
      onchainItems = onchainItems.filter(item => 
        item.userName.toLowerCase().includes(query) ||
        item.userPhone.toLowerCase().includes(query) ||
        item.walletAddr.toLowerCase().includes(query) ||
        item.txHash.toLowerCase().includes(query)
      );
    }

    // Metric Summary for On-Chain View
    const totalLiveUsdt = treasuryWallets.reduce((acc, w) => acc + (w.usdt || 0), 0);
    const totalSweptUsdt = onchainTxs
      .filter(tx => tx.asset === 'USDT' && (tx.type === 'sweep_usdt' || tx.type === 'custom_transfer'))
      .reduce((acc, tx) => acc + (parseFloat(tx.amount) || 0), 0);
    const activeCount = treasuryWallets.filter(w => w.usdt > 0.01 || w.bnb > 0.00001 || (w.nonce || 0) > 0).length;

    const amtEl = document.getElementById('hist-modal-total-amt');
    if (amtEl) amtEl.innerText = '$' + totalLiveUsdt.toFixed(2) + ' USDT';

    const verEl = document.getElementById('hist-modal-verified-amt');
    if (verEl) verEl.innerText = '$' + totalSweptUsdt.toFixed(2) + ' USDT';

    const cntEl = document.getElementById('hist-modal-total-count');
    if (cntEl) cntEl.innerText = activeCount;

    const indEl = document.getElementById('hist-modal-count-indicator');
    if (indEl) indEl.innerText = `Showing ${onchainItems.length} on-chain blockchain records (${activeCount} active wallets on BSC)`;

    if (onchainItems.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7">
          <div class="empty-state" style="padding:24px;">
            <div style="font-size:24px; margin-bottom:6px;">⛓️</div>
            <strong>No On-Chain Blockchain Activity Found Yet</strong>
            <p style="color:var(--txt3); font-size:12px; margin-top:4px;">When sub-wallets receive USDT or are swept to the Master Vault, the verified transactions will appear here with BscScan links.</p>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = onchainItems.map(item => {
      const dateStr = item.isLiveBalance ? '<span style="color:#00e5ff; font-weight:800;">🟢 Live Right Now</span>' : new Date(item.timestamp).toLocaleString();
      const hasHash = item.txHash && item.txHash.startsWith('0x');

      return `
        <tr>
          <td style="font-size:11px; color:var(--txt3); white-space:nowrap;">
            ${dateStr}
          </td>
          <td>
            <strong style="font-size:12px; color:#fff;">${escapeHtml(item.userName)}</strong>
            <br><span style="font-size:10.5px; color:var(--txt3);">${escapeHtml(item.userPhone)}</span>
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:4px;">
              <span style="font-family:monospace; font-size:11px; color:var(--cyan); max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.walletAddr}">
                ${item.walletAddr}
              </span>
              <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${item.walletAddr}'); toast('Address copied', 'success');" style="padding:1px 5px; font-size:9.5px;">Copy</button>
            </div>
          </td>
          <td>
            <strong style="font-family:monospace; font-size:13px; color:${item.isLiveBalance ? '#00e676' : '#f0b90b'};">
              ${item.isLiveBalance ? `+$${item.amount.toFixed(2)} USDT` : `-$${item.amount.toFixed(2)} ${item.asset}`}
            </strong>
            ${item.isLiveBalance && item.bnbAmount > 0 ? `<br><span style="font-size:10px; color:var(--txt3); font-family:monospace;">+${item.bnbAmount.toFixed(5)} BNB</span>` : ''}
          </td>
          <td>
            ${hasHash ? `
              <div style="display:flex; align-items:center; gap:4px;">
                <span style="font-family:monospace; font-size:11px; color:var(--txt2); max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.txHash}">
                  ${item.txHash.substring(0, 10)}...
                </span>
                <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${item.txHash}'); toast('TxHash Copied', 'success');" style="padding:1px 5px; font-size:9.5px;">Copy</button>
                <a href="https://bscscan.com/tx/${item.txHash}" target="_blank" style="color:var(--cyan); font-size:11px; text-decoration:none;" title="View on BscScan">↗</a>
              </div>
            ` : item.isLiveBalance ? `
              <span style="font-size:11px; color:var(--cyan); font-family:monospace;">Scanned via BSC RPC</span>
            ` : '<span style="color:var(--txt3); font-size:11px;">Internal</span>'}
          </td>
          <td>
            ${item.isLiveBalance ? `
              <span style="font-size:10.5px; font-weight:800; color:#00e5ff; background:rgba(0,229,255,0.12); padding:2px 7px; border-radius:6px; border:1px solid rgba(0,229,255,0.3);">Live on BSC ⚡</span>
            ` : `
              <span style="font-size:10.5px; font-weight:800; color:#00e676; background:rgba(0,230,118,0.12); padding:2px 7px; border-radius:6px; border:1px solid rgba(0,230,118,0.3);">Confirmed on BSC ✓</span>
            `}
          </td>
          <td>
            <button class="btn btn-sm" onclick="closeModal('treasury-history-modal'); openTokenPocketModal('${item.walletAddr}');" 
              style="padding:3px 8px; font-size:10.5px; background:linear-gradient(135deg, #1e3a8a, #0284c7); color:#fff; border:none; border-radius:5px; font-weight:700;" title="Open in TokenPocket Hub">
              📱 Wallet
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } else {
    // ════════════════════════════════════════════════════════════════
    // 📝 MODE 2: WEBSITE FORM CLAIMS (UNVERIFIED)
    // ════════════════════════════════════════════════════════════════
    let list = [...treasurySubmissions];

    if (status !== 'all') {
      list = list.filter(s => (s.status || '').toLowerCase() === status.toLowerCase());
    }
    if (currentHistoryWalletFilter) {
      const target = currentHistoryWalletFilter.toLowerCase();
      list = list.filter(s => s.profile && s.profile.usdt_address && s.profile.usdt_address.toLowerCase() === target);
    }
    if (query) {
      list = list.filter(s => {
        const name = (s.profile?.full_name || s.user_name || '').toLowerCase();
        const phone = (s.profile?.phone || s.sender_number || '').toLowerCase();
        const addr = (s.profile?.usdt_address || '').toLowerCase();
        const txid = (s.transaction_id || '').toLowerCase();
        return name.includes(query) || phone.includes(query) || addr.includes(query) || txid.includes(query);
      });
    }

    let grossAmt = 0;
    let verifiedAmt = 0;
    list.forEach(s => {
      const amt = parseFloat(s.amount || 0);
      grossAmt += amt;
      const st = (s.status || '').toLowerCase();
      if (st === 'refunded' || st === 'approved') verifiedAmt += amt;
    });

    const amtEl = document.getElementById('hist-modal-total-amt');
    if (amtEl) amtEl.innerText = '$' + grossAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const verEl = document.getElementById('hist-modal-verified-amt');
    if (verEl) verEl.innerText = '$' + verifiedAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const cntEl = document.getElementById('hist-modal-total-count');
    if (cntEl) cntEl.innerText = list.length;

    const indEl = document.getElementById('hist-modal-count-indicator');
    if (indEl) indEl.innerText = `Showing ${list.length} website form claims (Unverified on-chain)`;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:24px;">No website form submissions found matching filter.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(s => {
      const dateStr = (s.submitted_at || s.created_at) ? new Date(s.submitted_at || s.created_at).toLocaleString() : 'N/A';
      const userName = s.profile?.full_name || s.user_name || 'USDT Trader';
      const userPhone = s.profile?.phone || s.sender_number || 'N/A';
      const walletAddr = s.profile?.usdt_address || 'N/A';
      const amt = parseFloat(s.amount || 0);
      const txProof = s.transaction_id || s.sender_number || 'N/A';

      const st = (s.status || 'pending').toLowerCase();
      let stBadge = '';
      if (st === 'refunded') {
        stBadge = `<span style="font-size:10.5px; font-weight:800; color:#00e676; background:rgba(0,230,118,0.12); padding:2px 7px; border-radius:6px; border:1px solid rgba(0,230,118,0.3);">Paid / Refunded ✓</span>`;
      } else if (st === 'approved') {
        stBadge = `<span style="font-size:10.5px; font-weight:800; color:#00e5ff; background:rgba(0,229,255,0.12); padding:2px 7px; border-radius:6px; border:1px solid rgba(0,229,255,0.3);">Approved ✓</span>`;
      } else if (st === 'rejected') {
        stBadge = `<span style="font-size:10.5px; font-weight:800; color:#ff3d00; background:rgba(255,61,0,0.12); padding:2px 7px; border-radius:6px; border:1px solid rgba(255,61,0,0.3);">Rejected ✕</span>`;
      } else {
        stBadge = `<span style="font-size:10.5px; font-weight:800; color:#ffc107; background:rgba(255,193,7,0.12); padding:2px 7px; border-radius:6px; border:1px solid rgba(255,193,7,0.3);">Pending ⏳</span>`;
      }

      return `
        <tr>
          <td style="font-size:11px; color:var(--txt3); white-space:nowrap;">
            ${escapeHtml(dateStr)}
          </td>
          <td>
            <strong style="font-size:12px; color:#fff;">${escapeHtml(userName)}</strong>
            <br><span style="font-size:10.5px; color:var(--txt3);">${escapeHtml(userPhone)}</span>
          </td>
          <td>
            ${walletAddr !== 'N/A' ? `
              <div style="display:flex; align-items:center; gap:4px;">
                <span style="font-family:monospace; font-size:11px; color:var(--cyan); max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${walletAddr}">
                  ${walletAddr}
                </span>
                <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${walletAddr}'); toast('Address copied', 'success');" style="padding:1px 5px; font-size:9.5px;">Copy</button>
              </div>
            ` : '<span style="color:var(--txt3); font-size:11px;">N/A</span>'}
          </td>
          <td>
            <strong style="font-family:monospace; font-size:13px; color:#ffc107;">$${amt.toFixed(2)} USDT</strong>
            <br><span style="font-size:9.5px; color:var(--txt3);">Claimed in Form</span>
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:4px;">
              <span style="font-family:monospace; font-size:11px; color:var(--txt2); max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(txProof)}">
                ${escapeHtml(txProof)}
              </span>
              ${txProof !== 'N/A' ? `<button class="btn btn-sm" onclick="navigator.clipboard.writeText('${escapeHtml(txProof)}'); toast('Copied', 'success');" style="padding:1px 5px; font-size:9.5px;">Copy</button>` : ''}
            </div>
          </td>
          <td>${stBadge}</td>
          <td>
            ${walletAddr !== 'N/A' ? `
              <button class="btn btn-sm" onclick="closeModal('treasury-history-modal'); openTokenPocketModal('${walletAddr}');" 
                style="padding:3px 8px; font-size:10.5px; background:linear-gradient(135deg, #1e3a8a, #0284c7); color:#fff; border:none; border-radius:5px; font-weight:700;" title="Open in TokenPocket Hub">
                📱 Wallet
              </button>
            ` : '<span style="color:var(--txt3); font-size:11px;">-</span>'}
          </td>
        </tr>
      `;
    }).join('');
  }
}

// Export the filtered deposit history as a CSV file
function exportTreasuryHistoryCsv() {
  if (currentHistoryViewMode === 'onchain') {
    const onchainTxs = getOnChainTxHistory();
    const liveFunded = treasuryWallets.filter(w => w.usdt > 0.01 || w.bnb > 0.00001);
    let items = [];
    onchainTxs.forEach(tx => {
      items.push({
        date: tx.timestamp || '',
        wallet: tx.from || '',
        type: tx.type || 'Sweep',
        amount: (tx.amount || 0) + ' ' + (tx.asset || 'USDT'),
        txHash: tx.hash || '',
        status: 'Confirmed on BSC',
        bscScan: tx.hash ? `https://bscscan.com/tx/${tx.hash}` : ''
      });
    });
    liveFunded.forEach(w => {
      items.push({
        date: new Date().toISOString(),
        wallet: w.address,
        type: 'Live On-Chain Balance',
        amount: `$${w.usdt.toFixed(2)} USDT (${w.bnb.toFixed(5)} BNB)`,
        txHash: 'Live On-Chain',
        status: 'Live on BSC',
        bscScan: `https://bscscan.com/address/${w.address}`
      });
    });

    const headers = ['Date', 'Wallet Address', 'Type', 'Amount', 'TxHash', 'Status', 'BscScan URL'];
    const rows = items.map(it => `"${it.date}","${it.wallet}","${it.type}","${it.amount}","${it.txHash}","${it.status}","${it.bscScan}"`);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `onchain_blockchain_ledger_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast(`Exported ${items.length} on-chain records to CSV! ✓`, 'success');
  } else {
    if (!treasurySubmissions || treasurySubmissions.length === 0) {
      toast('No deposit records available to export.', 'error');
      return;
    }
    const headers = ['Date', 'User Name', 'User Phone', 'Deposit Wallet Address', 'Amount (USDT)', 'TxID / Proof', 'Status', 'Admin Note'];
    const rows = treasurySubmissions.map(s => {
      const date = (s.submitted_at || s.created_at) ? new Date(s.submitted_at || s.created_at).toISOString() : '';
      const name = (s.profile?.full_name || s.user_name || '').replace(/"/g, '""');
      const phone = (s.profile?.phone || s.sender_number || '').replace(/"/g, '""');
      const addr = (s.profile?.usdt_address || '').replace(/"/g, '""');
      const amt = parseFloat(s.amount || 0).toFixed(2);
      const tx = (s.transaction_id || s.sender_number || '').replace(/"/g, '""');
      const st = (s.status || '').replace(/"/g, '""');
      const note = (s.admin_note || '').replace(/"/g, '""');
      return `"${date}","${name}","${phone}","${addr}","${amt}","${tx}","${st}","${note}"`;
    });
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `website_form_claims_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast(`Exported ${treasurySubmissions.length} form records to CSV! ✓`, 'success');
  }
}

// Filter and render Treasury table
function filterTreasuryTable() {
  const filter = document.getElementById('treasury-filter')?.value || 'active';
  const query = (document.getElementById('treasury-search')?.value || '').trim().toLowerCase();
  const tbody = document.getElementById('treasury-tbody');
  if (!tbody) return;

  let filtered = [...treasuryWallets];

  // Filter active (> $0 USDT or BNB in user wallet or sub-wallet)
  if (filter === 'active') {
    filtered = filtered.filter(w => !w.scanned || (w.userUsdt || 0) > 0.01 || (w.usdt || 0) > 0.01 || (w.bnb || 0) > 0.00001 || (w.userBnb || 0) > 0.00001);
  } else if (filter === 'onchain_activity') {
    filtered = filtered.filter(w => (w.userUsdt || 0) > 0.01 || (w.usdt || 0) > 0.01 || (w.bnb || 0) > 0.00001 || (w.userBnb || 0) > 0.00001 || (w.nonce || 0) > 0 || (w.userNonce || 0) > 0 || (w.swept || 0) > 0);
  }

  // Filter search
  if (query) {
    filtered = filtered.filter(w => 
      w.name.toLowerCase().includes(query) ||
      w.phone.toLowerCase().includes(query) ||
      w.address.toLowerCase().includes(query) ||
      (w.walletAddress && w.walletAddress.toLowerCase().includes(query))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">${treasuryWallets.length === 0 ? 'No deposit wallets found in database.' : 'No wallets matching the selected filter.'}</div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(w => {
    const hasGas = w.bnb >= MIN_SWEEP_GAS_BNB;
    const canSweep = w.usdt >= 0.1 && !!w.privateKey;
    const gasBadge = hasGas 
      ? `<span style="font-size:10px; font-weight:800; color:#00e676; background:rgba(0,230,118,0.12); padding:2px 7px; border-radius:6px; border:1px solid rgba(0,230,118,0.3);">Gas Ready ✓</span>`
      : `<span style="font-size:10px; font-weight:800; color:#ffc107; background:rgba(255,193,7,0.12); padding:2px 7px; border-radius:6px; border:1px solid rgba(255,193,7,0.3);">Needs Gas (~$0.01)</span>`;

    // Gas & On-Chain Status Indicator
    let onChainStatusHtml = `<div>${gasBadge}</div>`;
    if ((w.userUsdt || 0) > 0.01) {
      onChainStatusHtml += `<div style="font-size:10px; color:#00e676; font-weight:700; margin-top:3px;">🟢 User Web3 Funded</div>`;
    }
    if ((w.usdt || 0) > 0.01) {
      onChainStatusHtml += `<div style="font-size:10px; color:#00e5ff; font-weight:700; margin-top:2px;">⚡ Ready to Sweep</div>`;
    }
    if ((w.nonce || 0) > 0) {
      onChainStatusHtml += `<div style="font-size:10px; color:var(--cyan); font-family:monospace; margin-top:2px;">⛓️ ${w.nonce} sub-txs</div>`;
    }
    if (w.submissions && w.submissions.length > 0) {
      onChainStatusHtml += `<div style="margin-top:2px;"><span style="font-size:9.5px; color:rgba(255,255,255,0.4); cursor:pointer; text-decoration:underline;" onclick="openTreasuryHistoryModal('${escapeHtml(w.address)}', 'forms')" title="Click to view website form submissions">📝 ${w.submissions.length} Form Claims</span></div>`;
    }

    return `
      <tr>
        <td>
          <strong style="font-size:13px; color:#ffffff;">${escapeHtml(w.name)}</strong>
          <br><span style="color:var(--txt3); font-size:11px;">${escapeHtml(w.phone)}</span>
        </td>
        <td>
          ${(w.walletAddress && w.walletAddress.startsWith('0x')) ? `
            <div style="display:flex; align-items:center; gap:5px;">
              <span style="font-family:monospace; font-size:11.5px; color:#00e5ff; font-weight:700; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${w.walletAddress}">
                ${w.walletAddress}
              </span>
              <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${w.walletAddress}'); toast('User wallet copied ✓', 'success');" style="padding:2px 5px; font-size:10px;">Copy</button>
              <a href="https://bscscan.com/address/${w.walletAddress}" target="_blank" style="color:var(--cyan); font-size:11px; text-decoration:none; font-weight:700;" title="View on BscScan">↗</a>
            </div>
          ` : `
            <span style="color:var(--txt3); font-size:11px; font-style:italic;">Not Connected</span>
          `}
        </td>
        <td>
          ${((w.userUsdt || 0) > 0.01) ? `
            <strong style="font-family:monospace; font-size:13.5px; color:#00e676; font-weight:900;">
              +$${(w.userUsdt || 0).toFixed(2)} USDT
            </strong>
            <br><span style="font-size:9.5px; color:#00e676; font-weight:800; background:rgba(0,230,118,0.12); padding:1px 5px; border-radius:4px;">🟢 Live on BSC</span>
          ` : `
            <span style="font-family:monospace; color:var(--txt3); font-size:12px;">$0.00 USDT</span>
          `}
          ${((w.userBnb || 0) > 0.0001) ? `
            <br><span style="font-family:monospace; font-size:10px; color:var(--cyan);">${(w.userBnb || 0).toFixed(4)} BNB</span>
          ` : ''}
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:5px;">
            <span style="font-family:monospace; font-size:11.5px; color:var(--txt2); max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${w.address}">
              ${w.address}
            </span>
            <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${w.address}'); toast('Address copied ✓', 'success');" style="padding:2px 5px; font-size:10px;">Copy</button>
            <button class="btn btn-sm" onclick="refreshSingleWalletBalance('${w.address}')" style="padding:2px 4px; font-size:10px; border-color:rgba(0,229,255,0.3); color:var(--cyan);" title="Instant Sync Balance">🔄</button>
            <a href="https://bscscan.com/address/${w.address}" target="_blank" style="color:var(--txt3); font-size:11px; text-decoration:none;" title="View on BscScan">↗</a>
          </div>
        </td>
        <td>
          <div style="font-family:monospace; font-size:12.5px; font-weight:800; color:${(w.usdt || 0) > 0.01 ? '#00e676' : 'var(--txt3)'};">
            $${(w.usdt || 0).toFixed(2)} USDT
          </div>
          <div style="font-family:monospace; font-size:10.5px; color:${hasGas ? 'var(--cyan)' : '#ffc107'};">
            ${(w.bnb || 0).toFixed(5)} BNB
          </div>
        </td>
        <td>${onChainStatusHtml}</td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn" onclick="openTokenPocketModal('${w.address}')" 
              style="background:linear-gradient(135deg, #1e3a8a, #0284c7); color:#fff; font-weight:800; padding:4px 9px; font-size:11px; border:none; box-shadow:0 0 10px rgba(2,132,199,0.35); cursor:pointer; display:flex; align-items:center; gap:4px;" title="TokenPocket All-In-One Wallet Manager">
              <span>📱</span> <span>TokenPocket</span>
            </button>
            <button class="btn btn-green" onclick="initiateSingleSweep('${w.userId}', '${w.address}', '${w.privateKey}', ${w.usdt}, ${w.bnb})" 
              ${!canSweep ? 'disabled style="opacity:0.4; cursor:not-allowed; padding:4px 9px; font-size:11px;"' : 'style="font-weight:900; padding:4px 9px; font-size:11px; box-shadow:0 0 10px rgba(0,230,118,0.25);"'}>
              ⚡ Sweep USDT
            </button>
            ${w.bnb > 0.000025 && w.privateKey ? `
              <button class="btn" onclick="initiateSingleBnbSweep('${w.userId}', '${w.address}', '${w.privateKey}', ${w.bnb})" 
                style="background:rgba(240,185,11,0.18); border:1px solid rgba(240,185,11,0.4); color:#f0b90b; font-weight:900; padding:4px 9px; font-size:11px; cursor:pointer;" title="Sweep BNB to Master Wallet">
                🟡 Sweep BNB
              </button>
            ` : ''}
            ${w.privateKey ? `
              <button class="btn btn-sm" onclick="openUserPrivateKeyModal('${w.userId}', '${escapeHtml(w.name)}', '${w.address}', '${w.privateKey}')" 
                style="padding:3px 7px; font-size:10.5px; background:rgba(255,193,7,0.15); border:1px solid rgba(255,193,7,0.3); color:#ffc107;" title="Export Private Key">
                🔑 Key
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Initiate sweep for a single wallet
function initiateSingleSweep(userId, address, privateKey, usdtAmount, bnbAmount) {
  const masterAddr = ADMIN_PERMANENT_MASTER_WALLET;

  currentSweepTarget = {
    type: 'single',
    userId,
    address,
    privateKey,
    usdtAmount,
    bnbAmount,
    masterAddr
  };

  document.getElementById('sweep-modal-dest').innerText = masterAddr;
  document.getElementById('sweep-modal-amount').innerText = '$' + usdtAmount.toFixed(2) + ' USDT';

  const gasWarning = document.getElementById('sweep-gas-warning');
  if (gasWarning) {
    if (bnbAmount < MIN_SWEEP_GAS_BNB) {
      const donor = treasuryWallets.find(w => 
        w.address.toLowerCase() !== address.toLowerCase() && 
        w.bnb >= 0.000028 && 
        !!w.privateKey
      );
      gasWarning.style.display = 'block';
      if (donor) {
        gasWarning.style.background = 'rgba(0, 230, 118, 0.12)';
        gasWarning.style.borderColor = 'rgba(0, 230, 118, 0.35)';
        gasWarning.style.color = '#00e676';
        gasWarning.innerHTML = `⛽ <strong>Auto-Gas Refuel Ready!</strong> This wallet has no BNB, but donor wallet <strong>${escapeHtml(donor.name)} (${donor.address.substring(0, 8)}...)</strong> has <strong>${donor.bnb.toFixed(5)} BNB</strong>. The system will automatically transfer 0.00002 BNB (~$0.01) gas fee from that wallet to fuel this sweep!`;
      } else {
        gasWarning.style.background = 'rgba(255,193,7,0.1)';
        gasWarning.style.borderColor = 'rgba(255,193,7,0.3)';
        gasWarning.style.color = '#ffc107';
        gasWarning.innerHTML = `⚠️ <strong>No Donor Wallet with BNB Found:</strong> None of your sub-wallets currently hold BNB gas (~0.00002 BNB / ~$0.01). Send a tiny bit of BNB to any sub-wallet, or import this wallet's private key into MetaMask to sweep.`;
      }
    } else {
      gasWarning.style.display = 'none';
    }
  }

  document.getElementById('sweep-modal-intro').style.display = 'block';
  document.getElementById('sweep-exec-log').style.display = 'none';
  document.getElementById('sweep-exec-log').innerHTML = '';
  document.getElementById('btn-confirm-sweep-exec').disabled = false;
  document.getElementById('btn-confirm-sweep-exec').innerText = '⚡ Confirm & Sweep Now';

  openModal('sweep-modal');
}

// Initiate sweep for ALL active wallets
function confirmSweepAllWallets() {
  const masterAddr = ADMIN_PERMANENT_MASTER_WALLET;

  const activeWallets = treasuryWallets.filter(w => w.usdt >= 0.1 && !!w.privateKey);
  if (activeWallets.length === 0) {
    toast('No wallets with USDT balance >= $0.10 found. Run a scan first!', 'error');
    return;
  }

  const totalUsdt = activeWallets.reduce((acc, w) => acc + w.usdt, 0);

  currentSweepTarget = {
    type: 'all',
    wallets: activeWallets,
    totalUsdt,
    masterAddr
  };

  document.getElementById('sweep-modal-dest').innerText = masterAddr;
  document.getElementById('sweep-modal-amount').innerText = '$' + totalUsdt.toFixed(2) + ' USDT (' + activeWallets.length + ' wallets)';

  const gasWarning = document.getElementById('sweep-gas-warning');
  if (gasWarning) gasWarning.style.display = 'none';

  document.getElementById('sweep-modal-intro').style.display = 'block';
  document.getElementById('sweep-exec-log').style.display = 'none';
  document.getElementById('sweep-exec-log').innerHTML = '';
  document.getElementById('btn-confirm-sweep-exec').disabled = false;
  document.getElementById('btn-confirm-sweep-exec').innerText = '⚡ Sweep All (' + activeWallets.length + ' Wallets)';

  openModal('sweep-modal');
}

// Initiate sweep of BNB for a single wallet
function initiateSingleBnbSweep(userId, address, privateKey, bnbAmount) {
  const masterAddr = ADMIN_PERMANENT_MASTER_WALLET;

  currentSweepTarget = {
    type: 'single_bnb',
    userId,
    address,
    privateKey,
    bnbAmount,
    masterAddr
  };

  document.getElementById('sweep-modal-dest').innerText = masterAddr;
  document.getElementById('sweep-modal-amount').innerText = bnbAmount.toFixed(6) + ' BNB';

  const gasWarning = document.getElementById('sweep-gas-warning');
  if (gasWarning) {
    gasWarning.style.display = 'block';
    gasWarning.style.background = 'rgba(240,185,11,0.12)';
    gasWarning.style.borderColor = 'rgba(240,185,11,0.35)';
    gasWarning.style.color = '#f0b90b';
    gasWarning.innerHTML = `🟡 <strong>Native BNB Transfer:</strong> All available BNB minus exact network gas (~0.000005 - 0.00001 BNB / < $0.005) will be transferred directly to your permanent Master Vault.`;
  }

  document.getElementById('sweep-modal-intro').style.display = 'block';
  document.getElementById('sweep-exec-log').style.display = 'none';
  document.getElementById('sweep-exec-log').innerHTML = '';
  document.getElementById('btn-confirm-sweep-exec').disabled = false;
  document.getElementById('btn-confirm-sweep-exec').innerText = '🟡 Confirm & Sweep BNB';

  openModal('sweep-modal');
}

// Initiate sweep of ALL wallets with BNB
function confirmSweepAllBnbWallets() {
  const masterAddr = ADMIN_PERMANENT_MASTER_WALLET;
  const bnbWallets = treasuryWallets.filter(w => w.bnb > 0.000025 && !!w.privateKey);

  if (bnbWallets.length === 0) {
    toast('No wallets with BNB balance (> 0.000025 BNB) found. Run a scan first!', 'warning');
    return;
  }

  const totalBnb = bnbWallets.reduce((acc, w) => acc + w.bnb, 0);

  currentSweepTarget = {
    type: 'all_bnb',
    wallets: bnbWallets,
    totalBnb,
    masterAddr
  };

  document.getElementById('sweep-modal-dest').innerText = masterAddr;
  document.getElementById('sweep-modal-amount').innerText = totalBnb.toFixed(6) + ' BNB (' + bnbWallets.length + ' wallets)';

  const gasWarning = document.getElementById('sweep-gas-warning');
  if (gasWarning) {
    gasWarning.style.display = 'block';
    gasWarning.style.background = 'rgba(240,185,11,0.12)';
    gasWarning.style.borderColor = 'rgba(240,185,11,0.35)';
    gasWarning.style.color = '#f0b90b';
    gasWarning.innerHTML = `🟡 <strong>Batch Native BNB Transfer:</strong> Sweeping all BNB from ${bnbWallets.length} sub-wallets directly to your permanent Master Vault in one click!`;
  }

  document.getElementById('sweep-modal-intro').style.display = 'block';
  document.getElementById('sweep-exec-log').style.display = 'none';
  document.getElementById('sweep-exec-log').innerHTML = '';
  document.getElementById('btn-confirm-sweep-exec').disabled = false;
  document.getElementById('btn-confirm-sweep-exec').innerText = '🟡 Sweep All BNB (' + bnbWallets.length + ' Wallets)';

  openModal('sweep-modal');
}

// Execute on-chain sweep
async function executeSweepConfirmed() {
  if (!currentSweepTarget) return;

  const btn = document.getElementById('btn-confirm-sweep-exec');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '⏳ Processing On-Chain Transfer...';
  }

  const logBox = document.getElementById('sweep-exec-log');
  if (logBox) {
    logBox.style.display = 'block';
    logBox.innerHTML = '';
  }

  function appendLog(msg, color = '#a0a5b5') {
    if (logBox) {
      logBox.innerHTML += `<div style="color:${color}; margin-bottom:4px;">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
      logBox.scrollTop = logBox.scrollHeight;
    }
  }

  appendLog('Connecting to BSC Mainnet (Chain ID: 56)...', '#00e5ff');

  const provider = getBscJsonRpcProvider();
  if (!provider) {
    appendLog('❌ Error: Ethers library or RPC provider unavailable.', '#ff3d00');
    if (btn) btn.disabled = false;
    return;
  }

  // Minimal ABI for ERC20 transfer
  const usdtAbi = [
    'function transfer(address to, uint256 value) returns (bool)',
    'function balanceOf(address account) view returns (uint256)'
  ];

  if (currentSweepTarget.type === 'single') {
    const { address, privateKey, usdtAmount, bnbAmount, masterAddr } = currentSweepTarget;
    appendLog(`Preparing sweep for wallet: ${address}`, '#fff');
    appendLog(`Target Destination: ${masterAddr}`, '#00e5ff');

    if (bnbAmount < MIN_SWEEP_GAS_BNB) {
      appendLog(`🔍 Insufficient gas on target wallet. Searching for donor wallet with BNB...`, '#00e5ff');
      const donorWallet = treasuryWallets.find(w => 
        w.address.toLowerCase() !== address.toLowerCase() && 
        w.bnb >= 0.000025 && 
        !!w.privateKey
      );

      if (donorWallet) {
        appendLog(`⛽ Found donor wallet: ${donorWallet.name || 'Sub-Wallet'} (${donorWallet.address.substring(0, 10)}...) (Has: ${donorWallet.bnb.toFixed(5)} BNB)`, '#00e676');
        appendLog(`Auto-transferring 0.00002 BNB (~$0.01) gas fee to ${address}...`, '#00e5ff');
        try {
          const donorSigner = new ethers.Wallet(donorWallet.privateKey, provider);
          const fuelTx = await donorSigner.sendTransaction({
            to: address,
            value: ethers.parseEther('0.00002')
          });
          appendLog(`Fuel Tx broadcasted: ${fuelTx.hash.substring(0, 18)}... Awaiting confirmation...`, '#00e676');
          await fuelTx.wait(1);
          appendLog(`✅ Gas refueled successfully! Proceeding with USDT sweep...`, '#00e676');
          donorWallet.bnb -= 0.000022;
        } catch (fuelErr) {
          appendLog(`❌ Auto-refuel failed: ${fuelErr.message}`, '#ff3d00');
          if (btn) btn.disabled = false;
          return;
        }
      } else {
        appendLog(`⚠️ Insufficient BNB for gas fee (Has: ${bnbAmount.toFixed(6)} BNB, Needs: ~${MIN_SWEEP_GAS_BNB} BNB / ~$0.01).`, '#ffc107');
        appendLog(`💡 Tip: Send a tiny amount of BNB (~$0.01 - $0.02) to ${address} or click '🔑 Key' to import into MetaMask and transfer with your connected wallet.`, '#ffc107');
        if (btn) btn.disabled = false;
        return;
      }
    }

    try {
      const signer = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(BSC_USDT_ADDR, usdtAbi, signer);

      appendLog(`Reading exact on-chain balance...`);
      const rawBalance = await contract.balanceOf(address);
      if (rawBalance === 0n) {
        appendLog(`❌ Balance is 0 on-chain. Nothing to sweep.`, '#ff3d00');
        if (btn) btn.disabled = false;
        return;
      }

      appendLog(`Broadcasting transaction on BSC...`, '#00e5ff');
      const tx = await contract.transfer(masterAddr, rawBalance);
      appendLog(`Tx Broadcasted! Hash: ${tx.hash}`, '#00e676');
      appendLog(`Awaiting blockchain confirmation...`);

      const receipt = await tx.wait(1);
      appendLog(`✅ Transaction Confirmed in block ${receipt.blockNumber}!`, '#00e676');
      appendLog(`🔗 <a href="https://bscscan.com/tx/${tx.hash}" target="_blank" style="color:#00e5ff; text-decoration:underline;">View on BscScan</a>`, '#00e5ff');

      toast('USDT Swept to Master Wallet Successfully! 🚀', 'success');

      // Refresh balance in local list
      const targetInList = treasuryWallets.find(w => w.address.toLowerCase() === address.toLowerCase());
      if (targetInList) targetInList.usdt = 0;
      filterTreasuryTable();

    } catch (err) {
      console.error('Sweep execution error:', err);
      appendLog(`❌ Transaction Failed: ${err.message}`, '#ff3d00');
      toast('Sweep failed: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Done ✓';
      }
    }
  } else if (currentSweepTarget.type === 'all') {
    const { wallets, masterAddr } = currentSweepTarget;
    appendLog(`Beginning batch sweep of ${wallets.length} wallets...`, '#00e5ff');

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      appendLog(`--- [${i + 1}/${wallets.length}] Sweeping ${w.address} ($${w.usdt.toFixed(2)}) ---`, '#fff');

      if (w.bnb < MIN_SWEEP_GAS_BNB) {
        appendLog(`🔍 Insufficient gas on ${w.address}. Searching for donor wallet...`, '#00e5ff');
        const donor = treasuryWallets.find(d => 
          d.address.toLowerCase() !== w.address.toLowerCase() && 
          d.bnb >= 0.000025 && 
          !!d.privateKey
        );

        if (donor) {
          appendLog(`⛽ Found donor: ${donor.name || 'Sub-Wallet'} (${donor.address.substring(0, 10)}...) with ${donor.bnb.toFixed(5)} BNB`, '#00e676');
          appendLog(`Auto-transferring 0.00002 BNB (~$0.01) gas to ${w.address}...`, '#00e5ff');
          try {
            const donorSigner = new ethers.Wallet(donor.privateKey, provider);
            const fuelTx = await donorSigner.sendTransaction({
              to: w.address,
              value: ethers.parseEther('0.00002')
            });
            appendLog(`Fuel Tx sent: ${fuelTx.hash.substring(0, 18)}... Waiting confirmation...`, '#00e676');
            await fuelTx.wait(1);
            appendLog(`✅ Gas refueled successfully! Proceeding with sweep...`, '#00e676');
            donor.bnb -= 0.000022;
            w.bnb += 0.00002;
          } catch (fuelErr) {
            appendLog(`❌ Auto-refuel failed: ${fuelErr.message}`, '#ff3d00');
            failedCount++;
            continue;
          }
        } else {
          appendLog(`⚠️ Skipped: Needs BNB gas fee (~${MIN_SWEEP_GAS_BNB} BNB / ~$0.01) and no donor wallet had BNB.`, '#ffc107');
          failedCount++;
          continue;
        }
      }

      try {
        const signer = new ethers.Wallet(w.privateKey, provider);
        const contract = new ethers.Contract(BSC_USDT_ADDR, usdtAbi, signer);
        const rawBal = await contract.balanceOf(w.address);

        if (rawBal === 0n) {
          appendLog(`Notice: On-chain balance is 0.`, '#94a3b8');
          continue;
        }

        const tx = await contract.transfer(masterAddr, rawBal);
        appendLog(`Tx Sent: ${tx.hash.substring(0, 18)}...`, '#00e676');
        await tx.wait(1);
        appendLog(`✓ Swept successfully!`, '#00e676');
        w.usdt = 0;
        successCount++;
      } catch (err) {
        appendLog(`❌ Failed: ${err.message}`, '#ff3d00');
        failedCount++;
      }
    }

    appendLog(`🎉 Batch Sweep Finished! Success: ${successCount}, Skipped/Failed: ${failedCount}`, '#00e676');
    filterTreasuryTable();
    toast(`Batch sweep complete! ${successCount} wallets swept.`, 'success');
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Completed ✓';
    }
  } else if (currentSweepTarget.type === 'single_bnb') {
    const { address, privateKey, masterAddr } = currentSweepTarget;
    appendLog(`Preparing BNB sweep for wallet: ${address}`, '#fff');
    appendLog(`Target Destination: ${masterAddr}`, '#00e5ff');

    try {
      const signer = new ethers.Wallet(privateKey, provider);
      const balance = await provider.getBalance(address);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || 50000000n;
      
      // Exact gas calculation to wipe sub-wallet to exactly 0.00000000 BNB
      let exactGasLimit = 21210n;
      try {
        const est = await provider.estimateGas({
          to: masterAddr,
          value: 0n
        });
        exactGasLimit = est;
      } catch (e) {
        exactGasLimit = 21210n;
      }

      const gasCost = exactGasLimit * gasPrice;

      if (balance <= gasCost) {
        appendLog(`❌ Balance (${ethers.formatEther(balance)} BNB) is too small to cover the exact network fee (${ethers.formatEther(gasCost)} BNB).`, '#ff3d00');
        if (btn) btn.disabled = false;
        return;
      }

      // Sends 100% of transferable BNB so that sub-wallet balance becomes exactly 0.00000000 BNB
      const amountToSend = balance - gasCost;
      appendLog(`Wiping sub-wallet clean! Transferring ${ethers.formatEther(amountToSend)} BNB to Master Vault...`, '#f0b90b');
      appendLog(`Remaining sub-wallet balance will be: 0.00000000 BNB (100% Cleared) ✓`, '#00e676');

      const tx = await signer.sendTransaction({
        to: masterAddr,
        value: amountToSend,
        gasLimit: exactGasLimit,
        gasPrice: gasPrice
      });
      appendLog(`Tx Broadcasted! Hash: ${tx.hash}`, '#00e676');
      appendLog(`Awaiting blockchain confirmation...`);

      const receipt = await tx.wait(1);
      appendLog(`✅ Confirmed in block ${receipt.blockNumber}!`, '#00e676');
      appendLog(`🔗 <a href="https://bscscan.com/tx/${tx.hash}" target="_blank" style="color:#00e5ff; text-decoration:underline;">View on BscScan</a>`, '#00e5ff');

      toast('Sub-wallet 100% Cleared & BNB Swept to Master Vault! 🚀', 'success');

      const targetInList = treasuryWallets.find(w => w.address.toLowerCase() === address.toLowerCase());
      if (targetInList) targetInList.bnb = 0;
      filterTreasuryTable();
      updateMainVaultLiveBalance();

    } catch (err) {
      console.error('Sweep BNB error:', err);
      appendLog(`❌ Transaction Failed: ${err.message}`, '#ff3d00');
      toast('Sweep BNB failed: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Done ✓';
      }
    }
  } else if (currentSweepTarget.type === 'all_bnb') {
    const { wallets, masterAddr } = currentSweepTarget;
    appendLog(`Beginning batch 100% BNB sweep of ${wallets.length} wallets...`, '#f0b90b');

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      appendLog(`--- [${i + 1}/${wallets.length}] Sweeping BNB from ${w.address} ---`, '#fff');

      try {
        const signer = new ethers.Wallet(w.privateKey, provider);
        const balance = await provider.getBalance(w.address);
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || 50000000n;

        let exactGasLimit = 21210n;
        try {
          const est = await provider.estimateGas({
            to: masterAddr,
            value: 0n
          });
          exactGasLimit = est;
        } catch (e) {
          exactGasLimit = 21210n;
        }

        const gasCost = exactGasLimit * gasPrice;

        if (balance <= gasCost) {
          appendLog(`Notice: Balance too small to cover exact gas. Skipped.`, '#94a3b8');
          failedCount++;
          continue;
        }

        const amountToSend = balance - gasCost;
        appendLog(`Wiping sub-wallet: Sending ${ethers.formatEther(amountToSend)} BNB (0.00000000 BNB remaining)...`, '#f0b90b');

        const tx = await signer.sendTransaction({
          to: masterAddr,
          value: amountToSend,
          gasLimit: exactGasLimit,
          gasPrice: gasPrice
        });
        appendLog(`Tx Sent: ${tx.hash.substring(0, 18)}...`, '#00e676');
        await tx.wait(1);
        appendLog(`✓ Swept successfully!`, '#00e676');
        w.bnb = 0;
        successCount++;
      } catch (err) {
        appendLog(`❌ Failed: ${err.message}`, '#ff3d00');
        failedCount++;
      }
    }

    appendLog(`🎉 Batch BNB Sweep Finished! Success: ${successCount}, Skipped: ${failedCount}`, '#00e676');
    filterTreasuryTable();
    updateMainVaultLiveBalance();
    toast(`Batch BNB sweep complete! ${successCount} wallets swept.`, 'success');
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Completed ✓';
    }
  }
}

window.loadTreasury = loadTreasury;
window.saveTreasuryMasterAddress = saveTreasuryMasterAddress;
window.scanAllTreasuryWallets = scanAllTreasuryWallets;
window.filterTreasuryTable = filterTreasuryTable;
window.initiateSingleSweep = initiateSingleSweep;
window.confirmSweepAllWallets = confirmSweepAllWallets;
window.initiateSingleBnbSweep = initiateSingleBnbSweep;
window.confirmSweepAllBnbWallets = confirmSweepAllBnbWallets;
window.executeSweepConfirmed = executeSweepConfirmed;
window.refreshSingleWalletBalance = refreshSingleWalletBalance;
window.openTokenPocketModal = openTokenPocketModal;
window.tpSwitchTab = tpSwitchTab;
window.tpOnAssetChange = tpOnAssetChange;
window.tpSetAmountPct = tpSetAmountPct;
window.tpPasteMasterVault = tpPasteMasterVault;
window.tpCopyAddress = tpCopyAddress;
window.tpCopyPrivateKey = tpCopyPrivateKey;
window.tpRefreshCurrentWallet = tpRefreshCurrentWallet;
window.tpExecuteCustomTransfer = tpExecuteCustomTransfer;
window.tpExecuteRefuelGas = tpExecuteRefuelGas;
window.tpTriggerSweepUsdt = tpTriggerSweepUsdt;
window.tpTriggerSweepBnb = tpTriggerSweepBnb;
window.openTreasuryHistoryModal = openTreasuryHistoryModal;
window.switchHistoryViewMode = switchHistoryViewMode;
window.filterTreasuryHistoryTable = filterTreasuryHistoryTable;
window.exportTreasuryHistoryCsv = exportTreasuryHistoryCsv;

