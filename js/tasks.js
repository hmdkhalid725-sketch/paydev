// ====================================================
// TASKS PAGE — PREMIUM PILL FILTERS & CARD DESIGN
// ====================================================

let activeTasksList = [];
let filteredTasks   = [];
let currentMethod   = 'Nagad';
let currentMinAmt   = 100;
let currentMaxAmt   = 199; // Default selected range: 100 - 199

// ── LOAD TASKS ────────────────────────────────────────────────────────────────
async function loadTasks() {
  if (!supabaseClient) return;

  const container = document.getElementById('tasks-list-container');

  // Enforce task availability setting from admin settings
  if (window.globalAppSettings && window.globalAppSettings.task_availability === false) {
    if (container) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 60px 20px; text-align: center;">
          <div style="font-size: 40px; margin-bottom: 12px;">🚫</div>
          <p class="empty-state-text" style="font-size:14px; color:var(--text-secondary); line-height:1.6;">
            টাস্ক বর্তমানে বন্ধ আছে। অনুগ্রহ করে পরবর্তীতে আবার চেষ্টা করুন।
          </p>
        </div>`;
    }
    return;
  }

  try {
    const { data: tasks, error } = await supabaseClient
      .from('tasks')
      .select('*')
      .eq('is_active', true)
      .order('payment_amount', { ascending: true });

    if (error) throw error;

    activeTasksList = tasks || [];
    applyFilters();

  } catch (err) {
    console.error('টাস্ক লোড ব্যর্থ:', err);
    showToast('টাস্ক লোড করা সম্ভব হয়নি।', 'error');
  }
}

// ── FILTERS ───────────────────────────────────────────────────────────────────
function setMethodFilter(method) {
  currentMethod = method;

  // Update method filter buttons
  ['filter-all', 'filter-bkash', 'filter-nagad'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('active');
  });

  if (method === 'all')   document.getElementById('filter-all')?.classList.add('active');
  if (method === 'bKash') document.getElementById('filter-bkash')?.classList.add('active');
  if (method === 'Nagad') document.getElementById('filter-nagad')?.classList.add('active');

  applyFilters();
}

function setPillFilter(min, max, pillId) {
  currentMinAmt = min;
  currentMaxAmt = max;

  // Update active pill UI
  const pills = document.querySelectorAll('.btn-pill');
  pills.forEach(p => p.classList.remove('active'));

  const activePill = document.getElementById(pillId);
  if (activePill) activePill.classList.add('active');

  applyFilters();
}

function applyFilters() {
  filteredTasks = activeTasksList.filter(t => {
    const methodMatch = currentMethod === 'all' || t.payment_method === currentMethod;
    const amtMatch = t.payment_amount >= currentMinAmt && t.payment_amount <= currentMaxAmt;
    return methodMatch && amtMatch;
  });
  renderTasks(filteredTasks);
}

// ── RENDER TASK CARDS (PREMIUM MATCH) ─────────────────────────────────────────
function renderTasks(tasks) {
  const container = document.getElementById('tasks-list-container');
  if (!container) return;

  if (!tasks || tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px 0;">
        <svg viewBox="0 0 24 24" style="width:36px; height:36px; fill:var(--text-muted); opacity:0.4; margin-bottom:8px;"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
        <p class="empty-state-text" style="font-size:13px; color:var(--text-secondary);">এই রেঞ্জে কোনো সক্রিয় টাস্ক পাওয়া যায়নি।</p>
      </div>`;
    return;
  }

  container.innerHTML = '';
  tasks.forEach(task => {
    const isBkash    = task.payment_method === 'bKash';
    const brandColor = isBkash ? '#e2136e' : '#ff6a00';
    const logoPath   = isBkash ? './assets/bkash-logo.png' : './assets/nagad-logo.png';
    const brandName  = isBkash ? 'bkash' : 'nagad';
    
    // Reward Rate percentage (e.g. 6%)
    const rate = ((parseFloat(task.bonus_amount) / parseFloat(task.payment_amount)) * 100).toFixed(1);
    
    // Partially mask receiver phone number (e.g. 017***72831)
    const rawNum = task.payment_number || '01XXXXXXXXX';
    const maskedNum = rawNum.length >= 11 
      ? `${rawNum.substring(0, 3)}***${rawNum.substring(7)}` 
      : '017***XXXXX';

    const card = document.createElement('div');
    card.style.cssText = `
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

    card.innerHTML = `
      <!-- Top row -->
      <div style="display:flex; align-items:center; gap:12px; position:relative;">
        <img src="${logoPath}" alt="${brandName}" style="width:42px; height:42px; object-fit:cover; border-radius:10px; border:1px solid rgba(255,255,255,0.06);">
        <div style="flex:1;">
          <h4 style="font-size:16px; font-weight:800; color:#fff; margin:0 0 2px 0;">${parseFloat(task.payment_amount).toFixed(2)} BDT</h4>
          <span style="font-size:12px; color:var(--text-secondary); text-transform:lowercase;">${brandName}</span>
        </div>
        <span style="font-size:12px; color:var(--text-muted); font-family:monospace; position:absolute; right:0; top:4px;">${maskedNum}</span>
      </div>

      <!-- Stats and Button Row -->
      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.04); padding-top:12px; margin-top:4px;">
        <div style="display:flex; gap:14px; align-items:center;">

          <!-- Combined Bonus Stat: taka + % badge together -->
          <div style="background:rgba(0,230,118,0.07); border:1px solid rgba(0,230,118,0.18); border-radius:10px; padding:8px 12px;">
            <div style="display:flex; align-items:baseline; gap:6px; flex-wrap:nowrap;">
              <p style="font-size:15px; font-weight:800; color:var(--accent-green); margin:0; line-height:1;">+৳${parseFloat(task.bonus_amount).toFixed(0)}</p>
              <span style="font-size:11px; font-weight:700; color:#00e676; background:rgba(0,230,118,0.15); border:1px solid rgba(0,230,118,0.3); border-radius:5px; padding:1px 6px; letter-spacing:0.3px;">${rate}%</span>
            </div>
            <p style="font-size:10px; color:var(--text-muted); margin:3px 0 0 0; letter-spacing:0.3px;">ক্যাশব্যাক বোনাস</p>
          </div>

          <!-- Refund time -->
          <div>
            <p style="font-size:13px; font-weight:700; color:var(--accent-cyan); margin:0 0 2px 0;">৳${parseFloat(task.payment_amount).toFixed(0)}</p>
            <p style="font-size:10px; color:var(--text-muted); margin:0;">রিফান্ড পাবেন</p>
          </div>

        </div>

        <button onclick="startTask('${task.id}')" 
          style="background:linear-gradient(135deg, ${brandColor} 0%, ${brandColor}cc 100%); color:#fff; border:none; padding:10px 18px; border-radius:10px; font-size:12.5px; font-weight:800; cursor:pointer; box-shadow:0 3px 10px ${brandColor}25; white-space:nowrap;">
          টাস্ক নিন
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// ── TASK DETAIL + SUBMISSION MODAL (BANGLA, BRANDED) ─────────────────────────
async function startTask(taskId) {
  const task = activeTasksList.find(t => t.id === taskId);
  if (!task) return;

  const modal  = document.getElementById('modal-overlay-task');
  const content = document.getElementById('modal-task-details-content');
  if (!modal || !content) return;

  const isBkash   = task.payment_method === 'bKash';
  const brandColor = isBkash ? '#e2136e' : '#ff6a00';
  const brandName  = isBkash ? 'বিকাশ' : 'নগদ';
  const logoPath   = isBkash ? './assets/bkash-logo.png' : './assets/nagad-logo.png';
  const brandGrad  = isBkash
    ? 'linear-gradient(135deg, #e2136e 0%, #b30b54 100%)'
    : 'linear-gradient(135deg, #ff6a00 0%, #ec1c24 100%)';

  // Show loading indicator first
  content.innerHTML = `
    <div style="padding: 40px 20px; text-align: center; color: var(--text-secondary);">
      <div style="margin: 0 auto 12px auto; border: 3px solid rgba(255,255,255,0.05); border-top: 3px solid ${brandColor}; border-radius: 50%; width: 28px; height: 28px; animation: spin 0.8s linear infinite;"></div>
      পেমেন্ট নম্বর লোড হচ্ছে...
    </div>
  `;
  modal.classList.add('active');

  let receiverNumber = task.payment_number;
  let p2pQueueId = null;
  let lockTimeRemaining = 0;
  let userPhone = '';

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
      const { data: p } = await supabaseClient.from('profiles').select('phone').eq('id', user.id).single();
      if (p) userPhone = p.phone || '';
    }

    // Call acquire_p2p_payout to check for peer numbers
    const { data: p2pData, error: p2pErr } = await supabaseClient.rpc('acquire_p2p_payout', {
      p_payment_method: task.payment_method,
      p_amount: task.payment_amount
    });

    if (!p2pErr && p2pData && p2pData.length > 0) {
      receiverNumber = p2pData[0].phone_number;
      p2pQueueId = p2pData[0].id;
      lockTimeRemaining = p2pData[0].lock_expires_in_seconds || 120;
      cancelP2PRelease(p2pQueueId);
    }
  } catch (err) {
    console.error("Error setting up P2P task details:", err);
  }

  content.innerHTML = `
    <!-- ─── Brand Header with Logo ─── -->
    <div style="background:${brandGrad}; border-radius:12px 12px 0 0; padding:14px 20px; margin:-20px -20px 20px -20px; display:flex; align-items:center; gap:12px;">
      <img src="${logoPath}" alt="${brandName} Logo" style="height:38px; width:38px; object-fit:cover; border-radius:8px; border:2px solid rgba(255,255,255,0.2); box-shadow:0 2px 8px rgba(0,0,0,0.2);">
      <div>
        <div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:0.5px;">${brandName} পেমেন্ট টাস্ক</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.75);">${p2pQueueId ? 'পিয়ার-টু-পিয়ার অটো-রিফান্ড' : 'নিরাপদ ও তাৎক্ষণিক রিফান্ড'}</div>
      </div>
    </div>

    ${p2pQueueId ? `
      <!-- P2P Lock Timer Alert -->
      <div id="p2p-timer-alert" style="background: rgba(0, 229, 255, 0.08); border: 1px solid rgba(0, 229, 255, 0.25); border-radius: 10px; padding: 12px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 20px; animation: pulse 1s infinite;">⏱️</span>
        <div style="flex:1;">
          <p style="font-size: 12px; color: #fff; margin: 0 0 2px 0; font-weight: 700;">নম্বরটি সাময়িকভাবে আপনার জন্য লক করা হয়েছে</p>
          <p style="font-size: 11px; color: var(--text-secondary); margin: 0;">দয়া করে <span id="p2p-countdown" style="color: var(--accent-cyan); font-weight: 800; font-family: monospace;">${lockTimeRemaining}</span> সেকেন্ডের মধ্যে টাকা পাঠিয়ে ট্রানজেকশন আইডি সাবমিট করুন।</p>
        </div>
      </div>
    ` : ''}

    <!-- ─── Step 1: Info ─── -->
    <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:12px; padding:16px; margin-bottom:14px;">
      <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">ধাপ ১ — পেমেন্ট করুন</p>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <p style="font-size:11px;color:var(--text-secondary);">প্রাপকের ${brandName} নম্বর</p>
          <p style="font-size:22px;font-weight:800;color:#fff;letter-spacing:1px;font-family:monospace;">${receiverNumber}</p>
        </div>
        <button id="copy-num-btn" type="button" onclick="copyToClipboard('${receiverNumber}', this)" data-number="${receiverNumber}"
          style="background:${brandColor}18;color:${brandColor};border:1px solid ${brandColor}40;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.2s;">
          কপি নম্বর
        </button>
      </div>

      <div style="height:1px;background:var(--border-color);margin:12px 0;"></div>

      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <p style="font-size:11px;color:var(--text-secondary);">পাঠানোর পরিমাণ</p>
          <p style="font-size:24px;font-weight:800;color:${brandColor};">৳${parseFloat(task.payment_amount).toFixed(0)}</p>
        </div>
        <button id="copy-amt-btn" type="button" onclick="copyToClipboard('${task.payment_amount}', this)"
          style="background:${brandColor}18;color:${brandColor};border:1px solid ${brandColor}40;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.2s;">
          কপি পরিমাণ
        </button>
      </div>
    </div>

    <!-- ─── Instructions ─── -->
    <div style="background:rgba(255,145,0,0.05); border:1px solid rgba(255,145,0,0.12); border-radius:10px; padding:12px; margin-bottom:14px; display:flex; gap:10px; align-items:flex-start;">
      <span style="font-size:16px;line-height:1;">📋</span>
      <p style="font-size:12.5px;color:var(--text-secondary);line-height:1.5;">
        ${task.instructions || `${brandName} অ্যাপ খুলে সেন্ড মানি (Send Money) করুন। টাকা পাঠানো সম্পন্ন হলে ট্রানজেকশন আইডি (TrxID) কপি করে নিচের বক্সে বসান।`}
      </p>
    </div>

    <!-- ─── Reward Info ─── -->
    <div style="background:rgba(0,230,118,0.05); border:1px solid rgba(0,230,118,0.12); border-radius:10px; padding:12px; margin-bottom:14px; display:flex; align-items:center; gap:12px;">
      <span style="font-size:24px;line-height:1;">🎁</span>
      <div>
        <p style="font-size:11px;color:var(--text-secondary);margin:0;">ক্যাশব্যাক বোনাস পাবেন</p>
        <p style="font-size:20px;font-weight:800;color:var(--accent-green);margin:2px 0;">+৳${parseFloat(task.bonus_amount).toFixed(0)}</p>
        <p style="font-size:11px;color:var(--text-muted);margin:0;">রিফান্ড ভেরিফিকেশনের পর ${task.refund_min_minutes}–${task.refund_max_minutes} মিনিটের মধ্যে এটি আপনার ওয়ালেটে সরাসরি যোগ হবে।</p>
      </div>
    </div>

    <!-- ─── Step 2: Submission form ─── -->
    <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:12px; padding:16px; margin-bottom:14px;">
      <p style="font-size:11px;color:var(--text-muted);margin-bottom:14px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">ধাপ ২ — ভেরিফিকেশন তথ্য দিন</p>

      <div class="form-group" style="margin-bottom:14px;">
        <label class="form-label" style="color:var(--text-secondary);font-size:12px;font-weight:600;margin-bottom:6px;display:block;">আপনার ${brandName} নম্বর (রিফান্ড পাওয়ার জন্য)</label>
        <div style="position:relative;">
          <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:15px;">📱</span>
          <input class="form-control" type="tel" id="submit-sender-phone" required placeholder="01XXXXXXXXX" value="${userPhone}"
            style="background:var(--bg-primary); padding-left:42px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); height:48px; font-size:15px; color:#fff; font-weight:700;">
        </div>
        <p style="font-size:11px;color:var(--text-muted);margin-top:5px;line-height:1.4;">ভেরিফিকেশনের পর টাকা সরাসরি এই নম্বরে ফেরত (Refund) পাঠানো হবে।</p>
      </div>

      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label" style="color:var(--text-secondary);font-size:12px;font-weight:600;margin-bottom:6px;display:block;">ট্রানজেকশন আইডি (TrxID)</label>
        <div style="position:relative;">
          <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:15px;">🔑</span>
          <input class="form-control" type="text" id="submit-txnid" required placeholder="যেমন: 8M9X7Y2Z"
            style="background:var(--bg-primary); padding-left:42px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); height:48px; font-size:15px; color:#fff; text-transform:uppercase; letter-spacing:1.5px; font-family:monospace; font-weight:700;">
        </div>
        <p style="font-size:11px;color:var(--text-muted);margin-top:5px;line-height:1.4;">টাকা সফলভাবে পাঠানোর পর বিকাশ/নগদ এসএমএস অথবা অ্যাপ স্টেটমেন্টে ট্রানজেকশন আইডি (TrxID) পাবেন।</p>
      </div>
    </div>

    <!-- ─── Warning ─── -->
    <div style="background:rgba(255,61,0,0.05); border:1px solid rgba(255,61,0,0.12); border-radius:10px; padding:12px; margin-bottom:18px; display:flex; gap:10px;">
      <span style="font-size:16px;">⚠️</span>
      <p style="font-size:12px;color:rgba(255,100,60,0.9);line-height:1.4;margin:0;">সতর্কতা: কোনো ফেক (Fake) ট্রানজেকশন আইডি বা অন্য কোনো উপায়ে প্রতারণার চেষ্টা করা হলে আপনার অ্যাকাউন্ট সাথে সাথে স্থায়ীভাবে সাসপেন্ড করা হবে।</p>
    </div>

    <!-- ─── Action Buttons ─── -->
    <div style="display:flex; gap:10px;">
      <button type="button" id="btn-close-task-modal" class="btn-secondary" style="flex:1; padding:14px; border-radius:10px; font-size:14px; font-weight:700;">বন্ধ করুন</button>
      <button type="button" id="btn-submit-task" style="flex:2; padding:14px; border-radius:10px; background:${brandGrad}; color:#fff; font-size:14px; font-weight:800; border:none; cursor:pointer; box-shadow:0 4px 12px ${brandColor}40;">
        পেমেন্ট সাবমিট করুন ✓
      </button>
    </div>
  `;

  let timerInterval = null;
  if (p2pQueueId && lockTimeRemaining > 0) {
    timerInterval = setInterval(() => {
      lockTimeRemaining--;
      const countdownEl = document.getElementById('p2p-countdown');
      if (countdownEl) {
        countdownEl.innerText = lockTimeRemaining;
      }
      if (lockTimeRemaining <= 0) {
        clearInterval(timerInterval);
        showToast("⏳ সময় শেষ! নম্বরটির লক বাতিল করা হয়েছে। আবার চেষ্টা করুন।", "error");
        modal.classList.remove('active');
      }
    }, 1000);
  }

  // Close button listener
  document.getElementById('btn-close-task-modal').addEventListener('click', () => {
    if (timerInterval) clearInterval(timerInterval);
    modal.classList.remove('active');
    if (p2pQueueId) {
      queueP2PRelease(p2pQueueId);
    }
  });

  // Submit button listener
  document.getElementById('btn-submit-task').addEventListener('click', () => submitTask(task, p2pQueueId, timerInterval));
}

// ── SUBMIT TASK ───────────────────────────────────────────────────────────────
async function submitTask(task, p2pQueueId = null, timerInterval = null) {
  if (!supabaseClient) return;

  // Prevent submission if the P2P lock timer has already expired and closed the modal
  if (p2pQueueId) {
    const modal = document.getElementById('modal-overlay-task');
    if (!modal || !modal.classList.contains('active')) {
      showToast('⏳ সময় শেষ! নম্বরটির লক বাতিল করা হয়েছে। আবার চেষ্টা করুন।', 'error');
      return;
    }
  }

  const txnId        = document.getElementById('submit-txnid')?.value.trim().toUpperCase();
  const senderPhone  = document.getElementById('submit-sender-phone')?.value.trim();
  const amount       = parseFloat(task.payment_amount);

  if (!senderPhone || senderPhone.length < 11) {
    showToast('আপনার সঠিক বিকাশ/নগদ নম্বর দিন', 'error');
    return;
  }

  if (!txnId) {
    showToast('ট্রানজেকশন আইডি (TrxID) দিন', 'error');
    return;
  }

  showSpinner(true);
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('লগইন করা নেই');

    // Create submission
    const { data: submission, error: subErr } = await supabaseClient
      .from('task_submissions')
      .insert({
        user_id: user.id,
        task_id: task.id,
        sender_number: senderPhone,
        transaction_id: txnId,
        amount,
        screenshot_url: null,
        status: 'pending',
        p2p_queue_id: p2pQueueId
      })
      .select()
      .single();

    if (subErr) {
      if (subErr.code === '23505') throw new Error('এই TrxID আগেই জমা দেওয়া হয়েছে।');
      throw subErr;
    }

    const activeReceiverNumber = document.getElementById('copy-num-btn')?.getAttribute('data-number') || task.payment_number;

    // Create payment record
    await supabaseClient.from('payments').insert({
      user_id: user.id,
      task_id: task.id,
      submission_id: submission.id,
      sender_number: senderPhone,
      receiver_number: activeReceiverNumber,
      amount,
      transaction_id: txnId,
      payment_method: task.payment_method,
      status: 'pending'
    });

    if (timerInterval) clearInterval(timerInterval);
    showToast('✅ তথ্য সফলভাবে জমা দেওয়া হয়েছে! ভেরিফিকেশনের অপেক্ষা করুন।', 'success');
    document.getElementById('modal-overlay-task').classList.remove('active');
    switchTab('home');

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// P2P Payout queue early release management
let pendingReleaseTimeouts = {};

function queueP2PRelease(queueId) {
  if (!queueId) return;
  if (pendingReleaseTimeouts[queueId]) {
    clearTimeout(pendingReleaseTimeouts[queueId]);
  }
  pendingReleaseTimeouts[queueId] = setTimeout(async () => {
    try {
      await supabaseClient.rpc('release_p2p_payout', { p_queue_id: queueId });
      console.log(`[P2P] Lock for queue entry ${queueId} released early.`);
    } catch (err) {
      console.error('[P2P] Error releasing payout lock:', err);
    }
    delete pendingReleaseTimeouts[queueId];
  }, 10000); // 10 seconds delay
}

function cancelP2PRelease(queueId) {
  if (queueId && pendingReleaseTimeouts[queueId]) {
    clearTimeout(pendingReleaseTimeouts[queueId]);
    delete pendingReleaseTimeouts[queueId];
    console.log(`[P2P] Cancelled early release timer for queue entry ${queueId}.`);
  }
}
