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
    settings:      'Settings'
  };

  document.getElementById('page-title').innerText = titles[page] || 'Admin Panel';

  // Show page
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
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
    const [{ count: s }, { count: r }, { count: w }] = await Promise.all([
      supabaseClient.from('task_submissions').select('*', { count: 'exact', head: true }).in('status', ['pending', 'under_review']),
      supabaseClient.from('task_submissions').select('*', { count: 'exact', head: true }).eq('status', 'refund_pending'),
      supabaseClient.from('withdrawals').select('*', { count: 'exact', head: true }).in('status', ['pending', 'processing'])
    ]);

    setBadge('badge-submissions', s);
    setBadge('badge-refunds', r);
    setBadge('badge-withdrawals', w);
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
  document.getElementById('d-total-bonus').innerText = '৳' + totalBonus.toFixed(2);
  document.getElementById('d-active-tasks').innerText = activeTasks ?? 0;

  // Recent 10 submissions
  const { data: recent } = await supabaseClient
    .from('task_submissions')
    .select('*, profiles(full_name, phone), tasks(title)')
    .order('submitted_at', { ascending: false })
    .limit(10);

  const wrap = document.getElementById('d-recent-wrap');
  if (!recent || recent.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No submissions yet.</div>';
    return;
  }

  wrap.innerHTML = `<table class="data-table">
    <thead><tr><th>User</th><th>Task</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead>
    <tbody>
      ${recent.map(s => `
        <tr>
          <td><strong>${s.profiles?.full_name || '—'}</strong><br><span style="color:var(--txt3);font-size:11px;">${s.profiles?.phone || ''}</span></td>
          <td>${s.tasks?.title || '—'}</td>
          <td style="color:var(--green);font-weight:700;">৳${parseFloat(s.amount).toFixed(2)}</td>
          <td><span class="badge ${s.status}">${s.status.replace(/_/g,' ')}</span></td>
          <td style="color:var(--txt3);">${timeAgo(s.submitted_at)}</td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

// ── SUBMISSIONS ───────────────────────────────────────────────────────────────
async function loadSubmissions() {
  const filter = document.getElementById('sub-filter')?.value || 'pending,under_review';
  const statuses = filter.split(',');

  const { data, error } = await supabaseClient
    .from('task_submissions')
    .select('*, profiles(full_name, phone), tasks(title, payment_method)')
    .in('status', statuses)
    .order('submitted_at', { ascending: true });

  if (error) throw error;

  const tbody = document.getElementById('submissions-tbody');

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">No submissions found.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(s => `
    <tr>
      <td>
        <strong style="font-size:13px;">${s.profiles?.full_name || '—'}</strong>
        <br><span style="color:var(--txt3);font-size:11px;">${s.profiles?.phone || ''}</span>
      </td>
      <td>${s.tasks?.title || '—'}</td>
      <td>${s.sender_number}</td>
      <td style="font-family:monospace;font-size:12px;">${s.transaction_id}</td>
      <td style="color:var(--green);font-weight:700;">৳${parseFloat(s.amount).toFixed(2)}</td>
      <td>
        ${s.screenshot_url
          ? `<img class="thumb" src="${s.screenshot_url}" onclick="openLightbox('${s.screenshot_url}')" alt="Receipt">`
          : `<span style="color:var(--txt3);font-size:11px;">No image</span>`}
      </td>
      <td style="color:var(--txt3);font-size:12px;">${timeAgo(s.submitted_at)}</td>
      <td><span class="badge ${s.status}">${s.status.replace(/_/g,' ')}</span></td>
      <td>
        <div class="btn-group">
          ${(s.status === 'pending' || s.status === 'under_review') ? `
            <button class="btn btn-green" onclick="verifySubmission('${s.id}')">✓ Verify</button>
            <button class="btn btn-red" onclick="openRejectModal('${s.id}', 'submission')">✕ Reject</button>
          ` : ''}
          ${s.status === 'refund_pending' ? `
            <button class="btn btn-orange" onclick="openRefundModal('${s.id}', '${s.amount}', '${s.sender_number}', '${s.tasks?.payment_method || 'bKash'}')">Refund</button>
          ` : ''}
        </div>
      </td>
    </tr>`).join('');
}

async function verifySubmission(id) {
  showSpinner(true);
  try {
    const { error } = await supabaseClient.rpc('admin_verify_payment', {
      p_submission_id: id,
      p_admin_note: 'Payment verified by admin.'
    });
    if (error) throw error;
    toast('Payment verified! Status → Refund Pending', 'success');
    await loadSubmissions();
    await refreshBadges();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// ── REFUNDS ───────────────────────────────────────────────────────────────────
async function loadRefunds() {
  const { data, error } = await supabaseClient
    .from('task_submissions')
    .select('*, profiles(full_name, phone), tasks(title, payment_method)')
    .eq('status', 'refund_pending')
    .order('verified_at', { ascending: true });

  if (error) throw error;

  const tbody = document.getElementById('refunds-tbody');

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No pending refunds 🎉</div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(s => `
    <tr>
      <td><strong>${s.profiles?.full_name || '—'}</strong></td>
      <td style="color:var(--cyan);">${s.profiles?.phone || '—'}</td>
      <td>${s.tasks?.title || '—'}</td>
      <td style="color:var(--cyan);font-weight:700;">${s.sender_number}</td>
      <td style="color:var(--orange);font-weight:800;">৳${parseFloat(s.amount).toFixed(2)}</td>
      <td style="font-family:monospace;font-size:11px;">${s.transaction_id}</td>
      <td style="color:var(--txt3);font-size:12px;">${s.verified_at ? timeAgo(s.verified_at) : '—'}</td>
      <td>
        <button class="btn btn-green" onclick="openRefundModal('${s.id}', '${s.amount}', '${s.sender_number}', '${s.tasks?.payment_method || 'bKash'}')">
          ✓ Mark Refunded
        </button>
      </td>
    </tr>`).join('');
}

function openRefundModal(submissionId, amount, phone, method) {
  document.getElementById('r-submission-id').value = submissionId;
  document.getElementById('r-amount-display').innerText = '৳' + parseFloat(amount).toFixed(2);
  document.getElementById('r-phone-display').innerText = phone;
  document.getElementById('r-method-display').innerText = method;
  document.getElementById('r-txn-id').value = '';
  document.getElementById('r-note').value = '';
  openModal('refund-modal');
}

async function confirmRefund() {
  const id     = document.getElementById('r-submission-id').value;
  const txnId  = document.getElementById('r-txn-id').value.trim();
  const note   = document.getElementById('r-note').value.trim();

  if (!txnId) { toast('Please enter the refund transaction ID', 'error'); return; }

  showSpinner(true);
  try {
    const { error } = await supabaseClient.rpc('admin_mark_refunded', {
      p_submission_id: id,
      p_refund_number:  txnId,
      p_admin_note:     note || 'Refund processed by admin.'
    });
    if (error) throw error;
    toast('Refund confirmed! Cashback bonus credited ✓', 'success');
    closeModal('refund-modal');
    await loadRefunds();
    await refreshBadges();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
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
      <td style="color:var(--green);font-weight:800;">৳${parseFloat(w.amount).toFixed(2)}</td>
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

  tbody.innerHTML = data.map(t => `
    <tr>
      <td><strong>${t.title}</strong></td>
      <td><span class="badge ${t.payment_method.toLowerCase()}" style="background:${t.payment_method==='bKash'?'rgba(226,19,110,0.15)':'rgba(236,28,36,0.15)'};color:${t.payment_method==='bKash'?'#e2136e':'#ec1c24'}">${t.payment_method}</span></td>
      <td style="color:var(--cyan);">${t.payment_number}</td>
      <td style="color:var(--txt);font-weight:700;">৳${parseFloat(t.payment_amount).toFixed(2)}</td>
      <td style="color:var(--green);font-weight:700;">+৳${parseFloat(t.bonus_amount).toFixed(2)}</td>
      <td style="color:var(--txt3);">${t.refund_min_minutes}–${t.refund_max_minutes} min</td>
      <td><span class="badge ${t.is_active ? 'active' : 'rejected'}">${t.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div class="btn-group">
          <button class="btn btn-ghost" onclick="openTaskModal('${t.id}')">✏ Edit</button>
          <button class="btn btn-red" onclick="deleteTask('${t.id}')">🗑</button>
        </div>
      </td>
    </tr>`).join('');
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
    .order('created_at', { ascending: false });

  if (error) throw error;
  allUsers = data || [];
  renderUsers(allUsers);
}

function filterUsers() {
  const q = document.getElementById('user-search').value.toLowerCase();
  renderUsers(allUsers.filter(u =>
    (u.full_name || '').toLowerCase().includes(q) ||
    (u.phone || '').includes(q)
  ));
}

function renderUsers(users) {
  const tbody = document.getElementById('users-tbody');

  if (!users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">No users found.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const isAdmin = u.admin_users !== null;
    return `<tr>
      <td>
        <strong>${u.full_name || '—'}${isAdmin ? ' <span style="color:var(--cyan);font-size:10px;">[ADMIN]</span>' : ''}</strong>
      </td>
      <td style="color:var(--cyan);">${u.phone || '—'}</td>
      <td style="font-family:monospace;color:var(--green);font-size:12px;">${u.referral_code || '—'}</td>
      <td><span class="badge ${u.status}">${u.status}</span></td>
      <td style="color:var(--txt3);font-size:12px;">${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
      <td style="color:var(--green);font-weight:700;" id="bal-${u.id}">—</td>
      <td>
        <div class="btn-group">
          ${u.status === 'active'
            ? `<button class="btn btn-red" onclick="setUserStatus('${u.id}', 'suspended')">Suspend</button>`
            : `<button class="btn btn-green" onclick="setUserStatus('${u.id}', 'active')">Activate</button>`}
          <button class="btn btn-ghost" onclick="viewUserBalance('${u.id}')">Balance</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function viewUserBalance(userId) {
  try {
    const { data: bal } = await supabaseClient.rpc('get_user_balance', { user_id: userId });
    const el = document.getElementById(`bal-${userId}`);
    if (el) el.innerText = '৳' + parseFloat(bal || 0).toFixed(2);
  } catch (err) {
    toast(err.message, 'error');
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
async function loadSettings() {
  const { data, error } = await supabaseClient.from('app_settings').select('*').eq('id', true).single();
  if (error) throw error;
  document.getElementById('s-min-wdr').value     = data.min_withdrawal;
  document.getElementById('s-max-wdr').value     = data.max_withdrawal;
  document.getElementById('s-support').value     = data.support_contact;
  document.getElementById('s-maintenance').value = data.maintenance_mode.toString();
  document.getElementById('s-tasks-avail').value = data.task_availability.toString();
  document.getElementById('s-instructions').value = data.default_task_instructions;
}

async function saveSettings(e) {
  e.preventDefault();
  showSpinner(true);
  try {
    const { error } = await supabaseClient.from('app_settings').update({
      min_withdrawal:           parseFloat(document.getElementById('s-min-wdr').value),
      max_withdrawal:           parseFloat(document.getElementById('s-max-wdr').value),
      support_contact:          document.getElementById('s-support').value.trim(),
      maintenance_mode:         document.getElementById('s-maintenance').value === 'true',
      task_availability:        document.getElementById('s-tasks-avail').value === 'true',
      default_task_instructions: document.getElementById('s-instructions').value.trim(),
      updated_at:               new Date()
    }).eq('id', true);

    if (error) throw error;
    toast('Settings saved ✓', 'success');
  } catch (err) {
    toast(err.message, 'error');
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

// ── TIME AGO UTILITY ──────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return new Date(dateStr).toLocaleDateString();
}
