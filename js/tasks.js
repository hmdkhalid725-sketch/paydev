// ====================================================
// TASKS PAGE — PREMIUM PILL FILTERS & CARD DESIGN
// ====================================================

let activeTasksList = [];
let filteredTasks   = [];
let currentMethod   = 'bKash';
let currentMinAmt   = 0;
let currentMaxAmt   = 999999; // Default selected range: All Amounts

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
  ['filter-all', 'filter-bkash', 'filter-nagad', 'filter-usdt'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('active');
  });

  if (method === 'Nagad') document.getElementById('filter-nagad')?.classList.add('active');
  if (method === 'USDT')  document.getElementById('filter-usdt')?.classList.add('active');
  if (method === 'bKash') document.getElementById('filter-bkash')?.classList.add('active');
  if (method === 'all')   document.getElementById('filter-all')?.classList.add('active');

  // Hide/Show BDT Pill Container when USDT is selected vs Nagad
  const pillsWrap = document.getElementById('pills-container');
  if (pillsWrap) {
    pillsWrap.style.display = method === 'USDT' ? 'none' : 'flex';
  }

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
    if (currentMethod === 'USDT') return t.payment_method === 'USDT';
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
    // Dedicated USDT Task Card Rendering
    if (task.payment_method === 'USDT') {
      const usdtCard = document.createElement('div');
      usdtCard.style.cssText = `
        background: linear-gradient(135deg, rgba(0,150,136,0.14) 0%, rgba(0,77,64,0.18) 100%);
        border: 1px solid rgba(0,230,118,0.35);
        border-radius: 16px;
        padding: 16px;
        margin-bottom: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      `;
      usdtCard.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="./assets/usdt-logo.png" alt="USDT" style="width:44px; height:44px; object-fit:cover; border-radius:10px; border:1.5px solid rgba(0,230,118,0.4); flex-shrink:0;">
          <div style="flex:1;">
            <h4 style="font-size:16px; font-weight:800; color:#fff; margin:0 0 2px 0;">USDT Crypto প্রফিট টাস্ক</h4>
            <span style="font-size:12px; color:var(--accent-green);">কাস্টম অ্যামাউন্ট ও ৬% প্রফিট</span>
          </div>
          <span style="font-size:11px; font-weight:800; color:#00e676; background:rgba(0,230,118,0.18); border:1px solid rgba(0,230,118,0.35); border-radius:6px; padding:3px 8px;">+6.0% Bonus</span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; margin-top:2px;">
          <div>
            <p style="font-size:13px; font-weight:700; color:#fff; margin:0 0 2px 0;">যেকোনো USDT ডিপোজিট</p>
            <p style="font-size:10px; color:var(--text-muted); margin:0;">TRC20 / BEP20 / ERC20 / SOL / MATIC</p>
          </div>
          <button onclick="startTask('${task.id}')" 
            style="background:linear-gradient(135deg, #00e676 0%, #00b0ff 100%); color:#000; border:none; padding:10px 18px; border-radius:10px; font-size:12.5px; font-weight:800; cursor:pointer; box-shadow:0 3px 10px rgba(0,230,118,0.3); white-space:nowrap;">
            টাস্ক নিন
          </button>
        </div>
      `;
      container.appendChild(usdtCard);
      return;
    }

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

  if (task.payment_method === 'USDT') {
    renderUsdtTaskModal(task);
    return;
  }

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

// ── USDT TASK SYSTEM CONTROLLER (4-STEP FUTURISTIC NEON WIZARD) ───────────────
let usdtCurrentStep = 1;
let selectedUsdtNetwork = 'BEP20'; // Default deposit network
let selectedUsdtRefundNetwork = 'BEP20'; // Default refund network
let selectedUsdtSubmitType = 'trx'; // 'trx' or 'screenshot'
let usdtTaskId = null;
let usdtScreenshotBase64 = null;
let usdtDepositAmount = 10;
let usdtUserRefundAddress = '';
let usdtTxnId = '';

const cryptoSvgIcons = {
  TRC20: `<img src="./assets/tron-logo.png" alt="TRON" style="width:20px; height:20px; object-fit:contain; flex-shrink:0;">`,
  BEP20: `<img src="./assets/bep20-logo.png" alt="BEP20" style="width:20px; height:20px; object-fit:contain; flex-shrink:0;">`,
  ERC20: `<svg viewBox="0 0 24 24" width="20" height="20" style="vertical-align:middle;flex-shrink:0;filter:drop-shadow(0 0 4px rgba(98,126,234,0.6));"><path fill="#627EEA" d="M11.94 0L11.75.64v15.97l.19.19 7.43-4.39z"/><path fill="#8A92B2" d="M11.94 0L4.5 12.41l7.44 4.39V0z"/><path fill="#627EEA" d="M11.94 18.23l-.1.13v5.4l.1.29 7.44-10.47z"/><path fill="#8A92B2" d="M11.94 24.05v-5.82L4.5 13.58z"/></svg>`,
  SOL: `<img src="./assets/sol-logo.png" alt="SOL" style="width:20px; height:20px; object-fit:contain; flex-shrink:0;">`,
  POLYGON: `<img src="./assets/polygon-logo.png" alt="POLYGON" style="width:20px; height:20px; object-fit:contain; flex-shrink:0;">`
};

const networkMeta = {
  BEP20:   { name: 'BEP20 (BSC)', desc: 'Binance Smart Chain', fee: 'ফি: ~$0.01 (কম 🚀)', isBest: true },
  POLYGON: { name: 'POLYGON', desc: 'Polygon MATIC', fee: 'ফি: ~$0.07 (কম ⚡)' },
  SOL:     { name: 'SOL (Solana)', desc: 'Solana Network', fee: 'ফি: ~$0.30 (মাঝারি)' },
  ERC20:   { name: 'ERC20 (ETH)', desc: 'Ethereum Network', fee: 'ফি: ~$0.30 (মাঝারি)' },
  TRC20:   { name: 'TRC20 (TRON)', desc: 'TRON Network', fee: 'ফি: ~$1.50 (বেশি ⚠️)', isWarning: true }
};

function handleUsdtScreenshotSelect(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      usdtScreenshotBase64 = e.target.result;
      const prevWrap = document.getElementById('ss-file-preview-wrap');
      const prevImg  = document.getElementById('ss-file-preview-img');
      const prevName = document.getElementById('ss-file-name');
      if (prevWrap) prevWrap.style.display = 'block';
      if (prevImg)  prevImg.src = e.target.result;
      if (prevName) prevName.innerText = '✅ ' + file.name + ' (' + Math.round(file.size / 1024) + ' KB)';
    };
    reader.readAsDataURL(file);
  }
}

function closeTaskModal() {
  const modal = document.getElementById('modal-overlay-task');
  if (modal) modal.classList.remove('active');
  const sheetTitle = document.getElementById('modal-task-title');
  if (sheetTitle) sheetTitle.style.display = 'block';
}

function renderUsdtTaskModal(task) {
  usdtTaskId = task.id;
  const modal   = document.getElementById('modal-overlay-task');
  const content = document.getElementById('modal-task-details-content');
  if (!modal || !content) return;

  // Hide default "Task Details" title for USDT modal to avoid duplicate titles
  const sheetTitle = document.getElementById('modal-task-title');
  if (sheetTitle) sheetTitle.style.display = 'none';

  modal.classList.add('active');
  usdtCurrentStep = 1;
  selectedUsdtNetwork = 'BEP20';
  selectedUsdtRefundNetwork = 'BEP20';
  selectedUsdtSubmitType = 'trx';
  usdtScreenshotBase64 = null;

  renderUsdtWizardStep(1);
}

function renderUsdtWizardStep(step) {
  usdtCurrentStep = step;
  const content = document.getElementById('modal-task-details-content');
  if (!content) return;

  const settings = window.globalAppSettings || {};
  const defaultAddrs = {
    TRC20:   settings.usdt_trc20_address   || 'TJTA1XHohsyPFmNW1uJRRMWpLq8MiLiKCz',
    BEP20:   settings.usdt_bep20_address   || '0x155070856B0dcfC2e20B9284a54eecedeE7Bc14D',
    ERC20:   settings.usdt_erc20_address   || '0x155070856B0dcfC2e20B9284a54eecedeE7Bc14D',
    SOL:     settings.usdt_sol_address     || 'DDLQPfummxbKVpa3wjgNsHcxRBSZUahoe7yZRur5oBoc',
    POLYGON: settings.usdt_polygon_address || '0x155070856B0dcfC2e20B9284a54eecedeE7Bc14D'
  };

  const currAddr = defaultAddrs[selectedUsdtNetwork] || defaultAddrs.BEP20;

  // Header (Fixed Responsive Padding & No Overflow)
  const headerHtml = `
    <div style="background:linear-gradient(135deg, #022c22 0%, #001510 100%); border-radius:16px 16px 0 0; padding:16px 18px; margin:-20px -20px 16px -20px; display:flex; align-items:center; justify-content:space-between; border-bottom:1.5px solid rgba(0,230,118,0.4); box-shadow:0 6px 20px rgba(0,230,118,0.15); box-sizing:border-box; width:calc(100% + 40px);">
      <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
        <img src="./assets/usdt-logo.png" alt="Tether USDT" style="height:40px; width:40px; object-fit:cover; border-radius:10px; border:2px solid #00e676; box-shadow:0 0 12px rgba(0,230,118,0.4); flex-shrink:0;">
        <div style="min-width:0; flex:1;">
          <div style="font-size:15px; font-weight:900; color:#fff; letter-spacing:0.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:6px;">
            USDT Crypto টাস্ক
            <span style="font-size:9.5px; font-weight:800; background:rgba(0,230,118,0.2); border:1px solid #00e676; color:#00e676; padding:1.5px 5px; border-radius:5px; flex-shrink:0;">+6% Bonus</span>
          </div>
          <div style="font-size:11px; color:rgba(255,255,255,0.75); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">ইনস্ট্যান্ট ৬% ক্যাশব্যাক বোনাস ও রিফান্ড</div>
        </div>
      </div>
      <button type="button" onclick="closeTaskModal()" 
        style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; width:32px; height:32px; border-radius:50%; font-size:16px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-left:8px;">✕</button>
    </div>

    <!-- Wizard 4-Step Progress Tracker (1 -> 2 -> 3 -> 4) -->
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; padding:0 2px;">
      <div style="flex:1; text-align:center;">
        <div style="width:24px; height:24px; border-radius:50%; background:${step >= 1 ? 'linear-gradient(135deg, #00e676, #00b0ff)' : 'rgba(255,255,255,0.08)'}; color:${step >= 1 ? '#000' : '#888'}; font-weight:900; font-size:11px; display:flex; align-items:center; justify-content:center; margin:0 auto 3px auto; box-shadow:${step >= 1 ? '0 0 10px rgba(0,230,118,0.6)' : 'none'};">১</div>
        <span style="font-size:9px; font-weight:800; color:${step === 1 ? '#00e676' : 'var(--text-muted)'};">অ্যামাউন্ট</span>
      </div>
      <div style="height:2px; flex:0.6; background:${step >= 2 ? '#00e676' : 'rgba(255,255,255,0.08)'}; margin-top:-14px;"></div>
      <div style="flex:1; text-align:center;">
        <div style="width:24px; height:24px; border-radius:50%; background:${step >= 2 ? 'linear-gradient(135deg, #00e676, #00b0ff)' : 'rgba(255,255,255,0.08)'}; color:${step >= 2 ? '#000' : '#888'}; font-weight:900; font-size:11px; display:flex; align-items:center; justify-content:center; margin:0 auto 3px auto; box-shadow:${step >= 2 ? '0 0 10px rgba(0,230,118,0.6)' : 'none'};">২</div>
        <span style="font-size:9px; font-weight:800; color:${step === 2 ? '#00e676' : 'var(--text-muted)'};">ডিপোজিট</span>
      </div>
      <div style="height:2px; flex:0.6; background:${step >= 3 ? '#00e676' : 'rgba(255,255,255,0.08)'}; margin-top:-14px;"></div>
      <div style="flex:1; text-align:center;">
        <div style="width:24px; height:24px; border-radius:50%; background:${step >= 3 ? 'linear-gradient(135deg, #00e676, #00b0ff)' : 'rgba(255,255,255,0.08)'}; color:${step >= 3 ? '#000' : '#888'}; font-weight:900; font-size:11px; display:flex; align-items:center; justify-content:center; margin:0 auto 3px auto; box-shadow:${step >= 3 ? '0 0 10px rgba(0,230,118,0.6)' : 'none'};">৩</div>
        <span style="font-size:9px; font-weight:800; color:${step === 3 ? '#00e676' : 'var(--text-muted)'};">ভেরিফিকেশন</span>
      </div>
      <div style="height:2px; flex:0.6; background:${step >= 4 ? '#00e676' : 'rgba(255,255,255,0.08)'}; margin-top:-14px;"></div>
      <div style="flex:1; text-align:center;">
        <div style="width:24px; height:24px; border-radius:50%; background:${step >= 4 ? 'linear-gradient(135deg, #00e676, #00b0ff)' : 'rgba(255,255,255,0.08)'}; color:${step >= 4 ? '#000' : '#888'}; font-weight:900; font-size:11px; display:flex; align-items:center; justify-content:center; margin:0 auto 3px auto; box-shadow:${step >= 4 ? '0 0 10px rgba(0,230,118,0.6)' : 'none'};">৪</div>
        <span style="font-size:9px; font-weight:800; color:${step === 4 ? '#00e676' : 'var(--text-muted)'};">রিফান্ড</span>
      </div>
    </div>
  `;

  if (step === 1) {
    const prevAmt = document.getElementById('usdt-amount-input')?.value || 10;
    
    // Build Network Selection Cards Grid with Binance Fee Details
    const networks = ['BEP20', 'POLYGON', 'SOL', 'ERC20', 'TRC20'];
    const netCardsHtml = networks.map(netKey => {
      const isSelected = selectedUsdtNetwork === netKey;
      const icon = cryptoSvgIcons[netKey];
      const meta = networkMeta[netKey];
      return `
        <div onclick="selectUsdtNetwork('${netKey}')" id="net-card-${netKey.toLowerCase()}" data-network="${netKey}"
          style="background:${isSelected ? 'linear-gradient(135deg, rgba(0,230,118,0.18) 0%, rgba(0,176,255,0.12) 100%)' : 'rgba(255,255,255,0.03)'};
                 border:${isSelected ? '1.5px solid #00e676' : '1px solid rgba(255,255,255,0.08)'};
                 box-shadow:${isSelected ? '0 0 16px rgba(0,230,118,0.3)' : 'none'};
                 border-radius:12px; padding:10px 8px; cursor:pointer; display:flex; align-items:center; gap:8px; transition:all 0.2s; box-sizing:border-box; width:100%; position:relative; overflow:hidden; user-select:none; -webkit-user-select:none; outline:none;">
          
          ${meta.isBest ? `<span style="position:absolute; right:6px; top:4px; font-size:8.5px; font-weight:900; background:#00e676; color:#000; padding:1px 5px; border-radius:4px; pointer-events:none;">BEST</span>` : ''}

          <div style="background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.1); border-radius:8px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; flex-shrink:0; pointer-events:none;">
            ${icon}
          </div>
          <div style="flex:1; min-width:0; pointer-events:none;">
            <div style="font-size:12px; font-weight:900; color:${isSelected ? '#fff' : '#e0e0e0'}; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${meta.name}</div>
            <div style="font-size:9.5px; font-weight:700; color:${meta.isWarning ? '#ff9100' : (isSelected ? '#00e676' : 'var(--accent-cyan)')}; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${meta.fee}</div>
          </div>
          <div class="net-radio-circle" style="width:18px; height:18px; border-radius:50%; border:${isSelected ? 'none' : '1.5px solid rgba(255,255,255,0.25)'}; background:${isSelected ? '#00e676' : 'rgba(255,255,255,0.05)'}; color:#000; font-size:11px; font-weight:900; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:${isSelected ? '0 0 10px rgba(0,230,118,0.6)' : 'none'}; pointer-events:none;">
            ${isSelected ? '✓' : ''}
          </div>
        </div>
      `;
    }).join('');

    content.innerHTML = headerHtml + `
      <!-- STEP 1 VIEW -->
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:16px; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <p style="font-size:11px; color:var(--accent-cyan); margin:0; text-transform:uppercase; letter-spacing:1px; font-weight:800;">ধাপ ১ — ডিপোজিট পরিমাণ দিন</p>
          <span style="font-size:10.5px; color:#ff9100; font-weight:800; background:rgba(255,145,0,0.12); padding:2px 7px; border-radius:5px;">সর্বনিম্ন $3 USDT</span>
        </div>
        
        <div style="position:relative; margin-bottom:12px;">
          <input type="number" id="usdt-amount-input" value="${prevAmt}" min="3" step="any" oninput="updateUsdtProfitCalc()"
            style="width:100%; background:rgba(0,0,0,0.5) !important; border:1.5px solid var(--accent-cyan) !important; color:#fff !important; font-size:22px; font-weight:900; padding:12px 65px 12px 14px; border-radius:12px; box-sizing:border-box; outline:none; box-shadow:inset 0 2px 8px rgba(0,0,0,0.5);">
          <span style="position:absolute; right:14px; top:14px; color:var(--accent-cyan); font-weight:900; font-size:14px;">USDT</span>
        </div>

        <!-- Live Calculation Glowing Card -->
        <div style="background:linear-gradient(135deg, rgba(0,230,118,0.1) 0%, rgba(0,176,255,0.06) 100%); border:1px solid rgba(0,230,118,0.3); border-radius:12px; padding:14px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-size:12px; color:var(--text-secondary);">ডিপোজিট পরিমাণ:</span>
            <span id="calc-deposit-amt" style="font-size:13.5px; font-weight:700; color:#fff;">${parseFloat(prevAmt).toFixed(2)} USDT</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-size:12px; color:var(--text-secondary);">৬% প্রফিট বোনাস:</span>
            <span id="calc-bonus-amt" style="font-size:14.5px; font-weight:900; color:#00e676;">+$${(prevAmt * 0.06).toFixed(2)} USDT (৳${(prevAmt * 0.06 * 130).toFixed(0)} ব্যালেন্সে)</span>
          </div>
          <div style="height:1px; background:rgba(255,255,255,0.1); margin:8px 0;"></div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:13px; font-weight:800; color:#fff;">১০ মিনিটে ওয়ালেটে ফেরত:</span>
            <span id="calc-total-amt" style="font-size:17px; font-weight:900; color:var(--accent-cyan);">${parseFloat(prevAmt).toFixed(2)} USDT</span>
          </div>
        </div>

        <p style="font-size:12px; color:#fff; margin:0 0 10px 0; font-weight:700;">
          ব্লকচেইন নেটওয়ার্ক নির্বাচন করুন (কম ফি সিলেক্ট করুন):
        </p>

        <!-- Network Selector Cards Grid -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          ${netCardsHtml}
        </div>
      </div>

      <!-- Next Step Button -->
      <button type="button" onclick="goToUsdtStep2()"
        style="width:100%; background:linear-gradient(135deg, #00e676 0%, #00b0ff 100%); color:#000; border:none; padding:14px; border-radius:12px; font-size:15px; font-weight:900; cursor:pointer; box-shadow:0 6px 18px rgba(0,230,118,0.35); display:flex; align-items:center; justify-content:center; gap:6px;">
        পরবর্তী ধাপ: ডিপোজিট এড্রেস দেখুন ➡️
      </button>
    `;
  }

  else if (step === 2) {
    // STEP 2 VIEW (Futuristic Radar Scanning Simulation)
    content.innerHTML = headerHtml + `
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(0,230,118,0.25); border-radius:18px; padding:32px 18px; margin-bottom:16px; text-align:center; position:relative; overflow:hidden; box-shadow:0 0 20px rgba(0,230,118,0.1);" id="step2-loading">
        <div style="position:relative; width:64px; height:64px; margin:0 auto 16px auto; display:flex; align-items:center; justify-content:center;">
          <div style="position:absolute; width:64px; height:64px; border-radius:50%; border:2px solid #00e676; animation:pulseGlow 1.2s ease-in-out infinite; box-shadow:0 0 16px #00e676;"></div>
          <div style="position:absolute; width:48px; height:48px; border-radius:50%; border:3px solid transparent; border-top-color:#00b0ff; border-right-color:#00e676; animation:spin 0.9s linear infinite;"></div>
          <span style="font-size:24px; position:relative; z-index:2;">📡</span>
        </div>

        <p id="radar-status-text" style="font-size:15px; font-weight:900; color:var(--accent-cyan); margin:0 0 6px 0; letter-spacing:0.3px;">
          ⚡ ১. ${selectedUsdtNetwork} নোড স্ক্যান করা হচ্ছে...
        </p>
        <p id="radar-sub-text" style="font-size:11.5px; color:rgba(255,255,255,0.7); margin:0;">
          ব্লকচেইন সিকিউরিটি এনক্রিপশন লাইভ কানেক্টিভিটি
        </p>
      </div>

      <div id="step2-content" style="display:none;">
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:16px; margin-bottom:14px;">
          <p style="font-size:11px; color:var(--accent-cyan); margin-bottom:10px; text-transform:uppercase; letter-spacing:1px; font-weight:800;">ধাপ ২ — ডিপোজিট এড্রেস ও নির্দেশিকা</p>

          <div style="background:rgba(0,0,0,0.5); border:1.5px solid rgba(0,229,255,0.4); border-radius:12px; padding:14px; margin-bottom:12px; box-shadow:0 0 14px rgba(0,229,255,0.15);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:12.5px; color:#fff; display:flex; align-items:center; gap:6px; font-weight:800;">
                ${cryptoSvgIcons[selectedUsdtNetwork]} <strong style="color:var(--accent-cyan);">${selectedUsdtNetwork}</strong> ওয়ালেট এড্রেস:
              </span>
            </div>

            <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 10px;">
              <input type="text" id="usdt-deposit-addr" readonly value="${currAddr}" style="flex:1; background:none; border:none; color:var(--accent-cyan); font-family:monospace; font-size:12px; font-weight:800; outline:none; word-break:break-all;">
              <button type="button" onclick="copyToClipboard(document.getElementById('usdt-deposit-addr').value, this)"
                style="background:linear-gradient(135deg, #00e676, #00b0ff); color:#000; border:none; padding:8px 14px; border-radius:6px; font-size:11.5px; font-weight:900; cursor:pointer; white-space:nowrap; box-shadow:0 3px 10px rgba(0,230,118,0.35);">📋 কপি এড্রেস</button>
            </div>
          </div>

          <!-- Warning Card in Bangla -->
          <div style="background:rgba(255,145,0,0.08); border:1px solid rgba(255,145,0,0.35); border-radius:12px; padding:12px 14px; margin-bottom:4px; display:flex; gap:10px; align-items:flex-start;">
            <span style="font-size:20px; line-height:1;">⚠️</span>
            <div style="flex:1;">
              <h5 style="margin:0 0 3px 0; font-size:12.5px; color:#ff9100; font-weight:900;">জরুরি সতর্কবার্তা:</h5>
              <p style="margin:0; font-size:11px; color:#e0e0e0; line-height:1.4;">
                শুধুমাত্র সিলেক্ট করা <strong style="color:#00e676;">${selectedUsdtNetwork}</strong> নেটওয়ার্কে USDT ট্রান্সফার করুন। অন্য কোনো নেটওয়ার্ক ব্যবহার করলে আপনার ফান্ড স্থায়ীভাবে হারিয়ে যেতে পারে।
              </p>
            </div>
          </div>
        </div>

        <div style="display:flex; gap:10px;">
          <button type="button" onclick="renderUsdtWizardStep(1)"
            style="flex:1; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:12px; border-radius:10px; font-size:13px; font-weight:800; cursor:pointer;">
            ⬅️ পেছনে যান
          </button>
          <button type="button" onclick="renderUsdtWizardStep(3)"
            style="flex:2; background:linear-gradient(135deg, #00e676 0%, #00b0ff 100%); color:#000; border:none; padding:12px; border-radius:10px; font-size:14px; font-weight:900; cursor:pointer; box-shadow:0 4px 16px rgba(0,230,118,0.35);">
            পেমেন্ট করেছি, ভেরিফিকেশন দিন ➡️
          </button>
        </div>
      </div>
    `;

    // Stage 1 -> Stage 2 -> Address Revealed (2.2 seconds total delay)
    setTimeout(() => {
      const statusEl = document.getElementById('radar-status-text');
      const subEl = document.getElementById('radar-sub-text');
      if (statusEl) statusEl.innerHTML = `🔐 ২. ${selectedUsdtNetwork} ডিপোজিট এড্রেস ভেরিফাই হচ্ছে...`;
      if (subEl) subEl.innerText = 'অন-চেইন এনক্রিপ্টেড ভ্যালিডেশন সম্পন্ন হচ্ছে';
    }, 1000);

    setTimeout(() => {
      const loader  = document.getElementById('step2-loading');
      const content = document.getElementById('step2-content');
      if (loader) loader.style.display = 'none';
      if (content) content.style.display = 'block';
    }, 2200);
  }

  else if (step === 3) {
    // STEP 3 VIEW (Verification submission with Mobile File Upload & Dark Inputs)
    content.innerHTML = headerHtml + `
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:16px; margin-bottom:14px;">
        <p style="font-size:11px; color:var(--accent-cyan); margin-bottom:10px; text-transform:uppercase; letter-spacing:1px; font-weight:800;">ধাপ ৩ — পেমেন্ট ভেরিফিকেশন তথ্য দিন</p>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
          <button type="button" class="sub-type-btn" id="type-btn-trx" onclick="setUsdtSubmitType('trx')"
            style="background:${selectedUsdtSubmitType === 'trx' ? 'rgba(0,229,255,0.18)' : 'rgba(255,255,255,0.05)'}; border:${selectedUsdtSubmitType === 'trx' ? '1.5px solid var(--accent-cyan)' : '1px solid rgba(255,255,255,0.1)'}; color:${selectedUsdtSubmitType === 'trx' ? '#fff' : 'var(--text-secondary)'}; padding:11px 8px; border-radius:8px; font-weight:800; font-size:12px; cursor:pointer;">⚡ TrxID / Hash</button>
          <button type="button" class="sub-type-btn" id="type-btn-ss" onclick="setUsdtSubmitType('screenshot')"
            style="background:${selectedUsdtSubmitType === 'screenshot' ? 'rgba(0,229,255,0.18)' : 'rgba(255,255,255,0.05)'}; border:${selectedUsdtSubmitType === 'screenshot' ? '1.5px solid var(--accent-cyan)' : '1px solid rgba(255,255,255,0.1)'}; color:${selectedUsdtSubmitType === 'screenshot' ? '#fff' : 'var(--text-secondary)'}; padding:11px 8px; border-radius:8px; font-weight:800; font-size:12px; cursor:pointer;">📸 স্ক্রিনশট আপলোড</button>
        </div>

        <!-- Notice Banner -->
        <div id="sub-type-notice" style="background:rgba(0,229,255,0.06); border:1px solid rgba(0,229,255,0.25); border-radius:8px; padding:10px; margin-bottom:12px; font-size:11.5px; color:#e0e0e0; line-height:1.4;">
          ${selectedUsdtSubmitType === 'trx'
            ? '⚡ <strong>TrxID / TxHash দিলে:</strong> ১-১০ মিনিটের মধ্যে অটো ভেরিফাই সম্পন্ন হবে (অত্যন্ত দ্রুত)।'
            : '📸 <strong>ফোন থেকে স্ক্রিনশট আপলোড করলে:</strong> ম্যানুয়াল ভেরিফিকেশনের জন্য কিছুটা সময় লাগতে পারে।'}
        </div>

        <!-- TrxID Input (Dark Glassmorphism) -->
        <div id="usdt-trx-wrap" class="form-group" style="margin-bottom:12px; display:${selectedUsdtSubmitType === 'trx' ? 'block' : 'none'};">
          <label class="form-label" style="font-size:11px; color:var(--text-secondary); margin-bottom:6px; display:block; font-weight:700;">Transaction Hash / TrxID</label>
          <input type="text" id="usdt-txnid" placeholder="যেমন: 0x123... বা TrxHash..."
            style="width:100%; background:rgba(0,0,0,0.5) !important; border:1.5px solid rgba(0,229,255,0.4) !important; color:#ffffff !important; font-family:monospace; font-size:13px !important; font-weight:700 !important; padding:12px 14px !important; border-radius:10px !important; outline:none !important; box-shadow:inset 0 2px 6px rgba(0,0,0,0.5) !important; box-sizing:border-box !important;">
        </div>

        <!-- Screenshot File Upload Input (Mobile Native File Picker) -->
        <div id="usdt-ss-wrap" class="form-group" style="margin-bottom:12px; display:${selectedUsdtSubmitType === 'screenshot' ? 'block' : 'none'};">
          <label class="form-label" style="font-size:11px; color:var(--text-secondary); margin-bottom:6px; display:block; font-weight:700;">পেমেন্ট স্ক্রিনশট ছবি আপলোড করুন</label>
          
          <input type="file" id="usdt-ss-file" accept="image/*" style="display:none;" onchange="handleUsdtScreenshotSelect(this)">
          
          <div onclick="document.getElementById('usdt-ss-file').click()" 
            style="background:rgba(0,0,0,0.4); border:1.5px dashed rgba(0,229,255,0.4); border-radius:12px; padding:16px 12px; text-align:center; cursor:pointer; transition:all 0.2s;">
            <div style="font-size:26px; margin-bottom:4px;">📸</div>
            <div style="font-size:12.5px; font-weight:800; color:var(--accent-cyan);">ফোন থেকে স্ক্রিনশট ছবি সিলেক্ট করুন</div>
            <div style="font-size:10px; color:rgba(255,255,255,0.6); margin-top:2px;">গ্যালারি বা ক্যামেরা উভয়ই সাপোর্ট করবে</div>
            
            <div id="ss-file-preview-wrap" style="display:${usdtScreenshotBase64 ? 'block' : 'none'}; margin-top:10px;">
              <img id="ss-file-preview-img" src="${usdtScreenshotBase64 || ''}" style="max-height:100px; border-radius:8px; border:1px solid #00e676;">
              <div id="ss-file-name" style="font-size:11px; color:#00e676; margin-top:4px; font-weight:800;">✅ ছবি সিলেক্ট করা হয়েছে</div>
            </div>
          </div>

          <div style="margin-top:10px;">
            <label style="font-size:10.5px; color:var(--text-muted); display:block; margin-bottom:4px;">অথবা স্ক্রিনশটের ডাইরেক্ট ইমেজ লিংক দিন:</label>
            <input type="text" id="usdt-ss-url" placeholder="https://..."
              style="width:100%; background:rgba(0,0,0,0.5) !important; border:1px solid rgba(255,255,255,0.15) !important; color:#ffffff !important; font-size:12px !important; padding:8px 12px !important; border-radius:8px !important; outline:none !important; box-sizing:border-box !important;">
          </div>
        </div>
      </div>

      <div style="display:flex; gap:10px;">
        <button type="button" onclick="renderUsdtWizardStep(2)"
          style="flex:1; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:12px; border-radius:10px; font-size:13px; font-weight:800; cursor:pointer;">
          ⬅️ পেছনে যান
        </button>
        <button type="button" onclick="goToUsdtStep4()"
          style="flex:2; background:linear-gradient(135deg, #00e676 0%, #00b0ff 100%); color:#000; border:none; padding:12px; border-radius:10px; font-size:14px; font-weight:900; cursor:pointer; box-shadow:0 4px 16px rgba(0,230,118,0.35);">
          পরবর্তী ধাপ: রিফান্ড এড্রেস দিন ➡️
        </button>
      </div>
    `;
  }

  else if (step === 4) {
    // STEP 4 VIEW (Refund Wallet Address & Network Selector)
    const prevUserAddr = document.getElementById('usdt-user-address')?.value || '';
    const networks = ['BEP20', 'POLYGON', 'SOL', 'ERC20', 'TRC20'];

    const refundNetPills = networks.map(nKey => {
      const isSel = selectedUsdtRefundNetwork === nKey;
      return `
        <button type="button" onclick="selectUsdtRefundNetwork('${nKey}')" id="refund-pill-${nKey.toLowerCase()}"
          style="background:${isSel ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.05)'};
                 border:${isSel ? '1.5px solid #00e676' : '1px solid rgba(255,255,255,0.15)'};
                 color:${isSel ? '#fff' : 'var(--text-secondary)'};
                 padding:8px 12px; border-radius:8px; font-weight:800; font-size:11.5px; cursor:pointer; display:flex; align-items:center; gap:6px;">
          ${cryptoSvgIcons[nKey]} ${nKey}
        </button>
      `;
    }).join('');

    content.innerHTML = headerHtml + `
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:16px; margin-bottom:14px;">
        <p style="font-size:11px; color:var(--accent-cyan); margin-bottom:10px; text-transform:uppercase; letter-spacing:1px; font-weight:800;">ধাপ ৪ — আপনার রিফান্ড ও বোনাস ওয়ালেট এড্রেস</p>

        <!-- Information Card -->
        <div style="background:rgba(0,230,118,0.08); border:1px solid rgba(0,230,118,0.3); border-radius:12px; padding:12px 14px; margin-bottom:14px; display:flex; gap:10px; align-items:flex-start;">
          <span style="font-size:22px; line-height:1;">🎁</span>
          <div style="flex:1;">
            <h5 style="margin:0 0 4px 0; font-size:12.5px; color:#00e676; font-weight:900;">প্রফিট বোনাস ও ১০ মিনিটের ফান্ড রিফান্ড:</h5>
            <p style="margin:0 0 4px 0; font-size:11px; color:#e0e0e0; line-height:1.4;">
              • <strong>৬% প্রফিট বোনাস:</strong> ভেরিফাই হওয়ামাত্র ইনস্ট্যান্ট আপনার <strong>অ্যাকাউন্ট ব্যালেন্সে যোগ হবে</strong>।
            </p>
            <p style="margin:0; font-size:11px; color:#e0e0e0; line-height:1.4;">
              • <strong>মূল ফান্ড রিফান্ড:</strong> আপনার মূল জমা কৃত টাকা <strong>১০ মিনিটের মধ্যে</strong> নিচে দেওয়া এড্রেসে ফেরত পাঠানো হবে।
            </p>
          </div>
        </div>

        <!-- Refund Wallet Input (Dark Glassmorphism) -->
        <div style="margin-bottom:14px;">
          <label style="font-size:11px; color:var(--text-secondary); margin-bottom:6px; display:block; font-weight:700;">আপনার USDT ওয়ালেট এড্রেস (যাতে টাকা ফেরত পাবেন):</label>
          <input type="text" id="usdt-user-address" value="${prevUserAddr}" placeholder="যেমন: 0x155070856B... বা TJTA1X..."
            style="width:100%; background:rgba(0,0,0,0.5) !important; border:1.5px solid var(--accent-cyan) !important; color:#ffffff !important; font-family:monospace; font-size:13px !important; font-weight:700 !important; padding:12px 14px !important; border-radius:10px !important; outline:none !important; box-shadow:inset 0 2px 6px rgba(0,0,0,0.5) !important; box-sizing:border-box !important;">
        </div>

        <!-- Refund Network Selector -->
        <div style="margin-bottom:14px;">
          <label style="font-size:11px; color:var(--text-secondary); margin-bottom:8px; display:block; font-weight:700;">রিফান্ড গ্রহণের জন্য ব্লকচেইন নেটওয়ার্ক নির্বাচন করুন:</label>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${refundNetPills}
          </div>
        </div>

        <!-- Integrated Live Review Summary Card -->
        <div style="background:rgba(0,0,0,0.4); border:1px solid rgba(0,230,118,0.3); border-radius:12px; padding:12px 14px; font-size:11.5px; line-height:1.5;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:var(--text-secondary);">ডিপোজিট পরিমাণ:</span>
            <strong style="color:#fff;">${(usdtDepositAmount || 10).toFixed(2)} USDT</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:var(--text-secondary);">প্রফিট বোনাস (ব্যালেন্সে):</span>
            <strong style="color:#00e676;">+${((usdtDepositAmount || 10) * 0.06).toFixed(2)} USDT</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:var(--text-secondary);">ডিপোজিট নেটওয়ার্ক:</span>
            <strong style="color:var(--accent-cyan);">${selectedUsdtNetwork}</strong>
          </div>
        </div>

        <!-- Warning Alert Banner -->
        <div style="background:rgba(255,145,0,0.1); border:1px solid rgba(255,145,0,0.3); border-radius:10px; padding:10px; margin-top:12px; font-size:10.5px; color:#ff9100; line-height:1.4;">
          ⚠️ <strong>সতর্কতা:</strong> আপনার দেওয়া রিফান্ড এড্রেসটি সঠিকভাবে চেক করুন। ভুল এড্রেস দিলে ফান্ড রিকভার করা সম্ভব নয়।
        </div>
      </div>

      <div style="display:flex; gap:10px;">
        <button type="button" onclick="renderUsdtWizardStep(3)"
          style="flex:1; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:12px; border-radius:10px; font-size:13px; font-weight:800; cursor:pointer;">
          ⬅️ পেছনে যান
        </button>
        <button type="button" id="btn-submit-usdt" onclick="showUsdtConfirmModal()"
          style="flex:2; background:linear-gradient(135deg, #00e676 0%, #00b0ff 100%); color:#000; border:none; padding:12px; border-radius:10px; font-size:14.5px; font-weight:900; cursor:pointer; box-shadow:0 4px 16px rgba(0,230,118,0.35);">
          ✅ USDT টাস্ক কনফার্ম ও সাবমিট করুন
        </button>
      </div>
    `;
  }
}

function updateUsdtProfitCalc() {
  const val = parseFloat(document.getElementById('usdt-amount-input')?.value) || 0;
  const bonusUsdt = val * 0.06;
  const bonusBdt  = bonusUsdt * 130;

  const depEl   = document.getElementById('calc-deposit-amt');
  const bonusEl = document.getElementById('calc-bonus-amt');
  const totalEl = document.getElementById('calc-total-amt');

  if (depEl)   depEl.innerText   = val.toFixed(2) + ' USDT';
  if (bonusEl) bonusEl.innerText = '+$' + bonusUsdt.toFixed(2) + ` USDT (৳${bonusBdt.toFixed(0)} ব্যালেন্সে)`;
  if (totalEl) totalEl.innerText = val.toFixed(2) + ' USDT';
}

function goToUsdtStep2() {
  const amtInput = document.getElementById('usdt-amount-input');
  const amt = parseFloat(amtInput?.value || 0);
  if (isNaN(amt) || amt < 3) {
    showToast('সর্বনিম্ন ৩ USDT (3.00 USDT) ডিপোজিট করতে হবে।', 'error');
    return;
  }
  usdtDepositAmount = amt;
  renderUsdtWizardStep(2);
}

function selectUsdtNetwork(net) {
  selectedUsdtNetwork = net;

  ['BEP20', 'POLYGON', 'SOL', 'ERC20', 'TRC20'].forEach(n => {
    const card = document.getElementById(`net-card-${n.toLowerCase()}`);
    if (card) {
      const radio = card.querySelector('.net-radio-circle');
      if (n === net) {
        card.style.background = 'linear-gradient(135deg, rgba(0,230,118,0.18) 0%, rgba(0,176,255,0.12) 100%)';
        card.style.border = '1.5px solid #00e676';
        card.style.boxShadow = '0 0 16px rgba(0,230,118,0.3)';
        if (radio) {
          radio.style.border = 'none';
          radio.style.background = '#00e676';
          radio.style.color = '#000';
          radio.style.boxShadow = '0 0 10px rgba(0,230,118,0.6)';
          radio.innerHTML = '✓';
        }
      } else {
        card.style.background = 'rgba(255,255,255,0.03)';
        card.style.border = '1px solid rgba(255,255,255,0.08)';
        card.style.boxShadow = 'none';
        if (radio) {
          radio.style.border = '1.5px solid rgba(255,255,255,0.25)';
          radio.style.background = 'rgba(255,255,255,0.05)';
          radio.style.boxShadow = 'none';
          radio.innerHTML = '';
        }
      }
    }
  });
}

function selectUsdtRefundNetwork(net) {
  selectedUsdtRefundNetwork = net;
  ['BEP20', 'POLYGON', 'SOL', 'ERC20', 'TRC20'].forEach(n => {
    const btn = document.getElementById(`refund-pill-${n.toLowerCase()}`);
    if (btn) {
      if (n === net) {
        btn.style.background = 'rgba(0,230,118,0.2)';
        btn.style.border = '1.5px solid #00e676';
        btn.style.color = '#fff';
      } else {
        btn.style.background = 'rgba(255,255,255,0.05)';
        btn.style.border = '1px solid rgba(255,255,255,0.15)';
        btn.style.color = 'var(--text-secondary)';
      }
    }
  });
}

function goToUsdtStep4() {
  if (selectedUsdtSubmitType === 'trx') {
    const inputVal = document.getElementById('usdt-txnid')?.value.trim();
    if (!inputVal) {
      showToast('অনুগ্রহ করে ট্রানজেকশন আইডি (TrxID / TxHash) দিন', 'error');
      return;
    }
    usdtTxnId = inputVal;
  } else {
    const inputUrl = document.getElementById('usdt-ss-url')?.value.trim();
    if (!usdtScreenshotBase64 && !inputUrl) {
      showToast('অনুগ্রহ করে ফোন থেকে পেমেন্ট স্ক্রিনশট বেছে নিন', 'error');
      return;
    }
    usdtTxnId = 'SS-' + Date.now().toString(36).toUpperCase();
  }
  renderUsdtWizardStep(4);
}

function setUsdtSubmitType(type) {
  selectedUsdtSubmitType = type;

  const btnTrx = document.getElementById('type-btn-trx');
  const btnSs  = document.getElementById('type-btn-ss');
  const notice = document.getElementById('sub-type-notice');
  const wrapTrx = document.getElementById('usdt-trx-wrap');
  const wrapSs  = document.getElementById('usdt-ss-wrap');

  if (type === 'trx') {
    if (btnTrx) { btnTrx.style.background = 'rgba(0,229,255,0.15)'; btnTrx.style.border = '1.5px solid var(--accent-cyan)'; btnTrx.style.color = '#fff'; }
    if (btnSs)  { btnSs.style.background  = 'rgba(255,255,255,0.05)'; btnSs.style.border  = '1px solid rgba(255,255,255,0.1)'; btnSs.style.color  = 'var(--text-secondary)'; }
    if (notice) notice.innerHTML = '⚡ <strong>TrxID / TxHash দিলে:</strong> দ্রুততম সময়ে ১-১০ মিনিটের মধ্যে ভেরিফাই সম্পন্ন হবে।';
    if (wrapTrx) wrapTrx.style.display = 'block';
    if (wrapSs)  wrapSs.style.display  = 'none';
  } else {
    if (btnSs)  { btnSs.style.background  = 'rgba(0,229,255,0.15)'; btnSs.style.border  = '1.5px solid var(--accent-cyan)'; btnSs.style.color  = '#fff'; }
    if (btnTrx) { btnTrx.style.background = 'rgba(255,255,255,0.05)'; btnTrx.style.border = '1px solid rgba(255,255,255,0.1)'; btnTrx.style.color = 'var(--text-secondary)'; }
    if (notice) notice.innerHTML = '⏳ <strong>স্ক্রিনশট জমা দিলে:</strong> ম্যানুয়াল ভেরিফিকেশনের কারণে কিছুটা সময় লাগতে পারে।';
    if (wrapTrx) wrapTrx.style.display = 'none';
    if (wrapSs)  wrapSs.style.display  = 'block';
  }
}

function showUsdtConfirmModal() {
  const userAddress = document.getElementById('usdt-user-address')?.value.trim();
  if (!userAddress) {
    showToast('আপনার USDT ওয়ালেট এড্রেস বা নম্বর দিন', 'error');
    return;
  }
  usdtUserRefundAddress = userAddress;

  const existing = document.getElementById('usdt-confirm-overlay');
  if (existing) existing.remove();

  const confirmModalHtml = `
    <div id="usdt-confirm-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(6px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px; box-sizing:border-box;">
      <div style="background:linear-gradient(135deg, #022c22 0%, #001510 100%); border:1.5px solid #00e676; border-radius:18px; padding:20px; max-width:380px; width:100%; box-shadow:0 0 30px rgba(0,230,118,0.35); text-align:center; box-sizing:border-box;">
        <div style="font-size:36px; margin-bottom:8px;">⚠️</div>
        <h4 style="margin:0 0 6px 0; font-size:16px; color:#fff; font-weight:900;">ওয়ালেট এড্রেস নিশ্চিতকরণ</h4>
        <p style="font-size:11.5px; color:rgba(255,255,255,0.75); margin:0 0 14px 0;">অনুগ্রহ করে নিচে দেওয়া আপনার ডিপোজিট ও রিফান্ড তথ্য ভালো করে মিলিয়ে নিন:</p>

        <div style="background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:14px; text-align:left; margin-bottom:14px; font-size:12px; line-height:1.6;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:var(--text-secondary);">ডিপোজিট পরিমাণ:</span>
            <strong style="color:#fff;">${(usdtDepositAmount || 10).toFixed(2)} USDT</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:var(--text-secondary);">প্রফিট বোনাস (ব্যালেন্সে):</span>
            <strong style="color:#00e676;">+${((usdtDepositAmount || 10) * 0.06).toFixed(2)} USDT</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="color:var(--text-secondary);">ডিপোজিট নেটওয়ার্ক:</span>
            <strong style="color:var(--accent-cyan);">${selectedUsdtNetwork}</strong>
          </div>
          <div style="height:1px; background:rgba(255,255,255,0.1); margin:8px 0;"></div>
          <div style="margin-bottom:4px;">
            <span style="color:var(--text-secondary); display:block;">১০ মিনিটে রিফান্ড ওয়ালেট (${selectedUsdtRefundNetwork}):</span>
            <div style="font-family:monospace; font-size:12px; color:#00e676; font-weight:800; word-break:break-all; background:rgba(0,230,118,0.1); padding:6px 8px; border-radius:6px; margin-top:4px; border:1px solid rgba(0,230,118,0.3);">${usdtUserRefundAddress}</div>
          </div>
        </div>

        <div style="background:rgba(255,145,0,0.1); border:1px solid rgba(255,145,0,0.3); border-radius:10px; padding:10px; margin-bottom:16px; font-size:11px; color:#ff9100; text-align:left; line-height:1.4;">
          ⚠️ <strong>সতর্কতা:</strong> আপনার দেওয়া রিফান্ড এড্রেস কি নিশ্চিত সঠিক? ভুল এড্রেস দিলে ফান্ড ফেরত রিকভার করা সম্ভব নয়।
        </div>

        <div style="display:flex; gap:10px;">
          <button type="button" onclick="closeUsdtConfirmModal()" style="flex:1; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:12px; border-radius:10px; font-size:12px; font-weight:800; cursor:pointer;">
            ✏️ পরিবর্তন করুন
          </button>
          <button type="button" onclick="executeFinalUsdtSubmit('${usdtTaskId}')" style="flex:1.4; background:linear-gradient(135deg, #00e676, #00b0ff); color:#000; border:none; padding:12px; border-radius:10px; font-size:13px; font-weight:900; cursor:pointer; box-shadow:0 4px 14px rgba(0,230,118,0.4);">
            ✅ হ্যাঁ, এড্রেস সঠিক
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', confirmModalHtml);
}

function closeUsdtConfirmModal() {
  const overlay = document.getElementById('usdt-confirm-overlay');
  if (overlay) overlay.remove();
}

async function executeFinalUsdtSubmit(taskId) {
  closeUsdtConfirmModal();
  await submitUsdtTask(taskId);
}

async function submitUsdtTask(taskId) {
  if (!supabaseClient) return;

  const amount = usdtDepositAmount || 10;
  const userAddress = usdtUserRefundAddress || document.getElementById('usdt-user-address')?.value.trim();

  if (!userAddress) {
    showToast('আপনার USDT ওয়ালেট এড্রেস বা নম্বর দিন', 'error');
    return;
  }

  const txnId = usdtTxnId || ('TX-' + Date.now().toString(36).toUpperCase());
  const screenshotUrl = (selectedUsdtSubmitType === 'screenshot') ? (usdtScreenshotBase64 || document.getElementById('usdt-ss-url')?.value.trim() || null) : null;

  showSpinner(true);
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('লগইন করা নেই');

    const settings = window.globalAppSettings || {};
    const defaultAddrs = {
      TRC20:   settings.usdt_trc20_address   || 'TJTA1XHohsyPFmNW1uJRRMWpLq8MiLiKCz',
      BEP20:   settings.usdt_bep20_address   || '0x155070856B0dcfC2e20B9284a54eecedeE7Bc14D',
      ERC20:   settings.usdt_erc20_address   || '0x155070856B0dcfC2e20B9284a54eecedeE7Bc14D',
      SOL:     settings.usdt_sol_address     || 'DDLQPfummxbKVpa3wjgNsHcxRBSZUahoe7yZRur5oBoc',
      POLYGON: settings.usdt_polygon_address || '0x155070856B0dcfC2e20B9284a54eecedeE7Bc14D'
    };
    const depositAddress = defaultAddrs[selectedUsdtNetwork] || defaultAddrs.BEP20;
    const noteText = `USDT DepNet: ${selectedUsdtNetwork} | RefundNet: ${selectedUsdtRefundNetwork} | Mode: ${selectedUsdtSubmitType}`;

    // 1. Create task_submissions entry
    const { data: submission, error: subErr } = await supabaseClient
      .from('task_submissions')
      .insert({
        user_id: user.id,
        task_id: taskId,
        sender_number: userAddress,
        transaction_id: txnId,
        amount: amount,
        screenshot_url: screenshotUrl || null,
        status: 'pending',
        admin_note: noteText
      })
      .select()
      .single();

    if (subErr) {
      if (subErr.code === '23505') throw new Error('এই TrxID আগেই জমা দেওয়া হয়েছে।');
      throw subErr;
    }

    // 2. Create payments entry
    await supabaseClient.from('payments').insert({
      user_id: user.id,
      task_id: taskId,
      submission_id: submission.id,
      sender_number: userAddress,
      receiver_number: depositAddress,
      amount: amount,
      transaction_id: txnId,
      payment_method: 'USDT',
      status: 'pending'
    });

    showToast('✅ USDT টাস্ক সফলভাবে জমা দেওয়া হয়েছে! ভেরিফিকেশনের জন্য অপেক্ষা করুন।', 'success');
    const modalEl = document.getElementById('modal-overlay-task');
    if (modalEl) modalEl.classList.remove('active');

    if (typeof loadHomeData === 'function') {
      await loadHomeData();
    } else if (typeof loadTaskHistory === 'function') {
      await loadTaskHistory(user.id);
    }

    if (typeof switchTab === 'function') switchTab('home');

    // Smooth scroll to task history section
    setTimeout(() => {
      const historyList = document.getElementById('home-task-history-list');
      if (historyList) {
        historyList.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 200);

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// Expose functions globally for dynamic inline onclick handlers
window.renderUsdtTaskModal = renderUsdtTaskModal;
window.renderUsdtWizardStep = renderUsdtWizardStep;
window.goToUsdtStep2 = goToUsdtStep2;
window.goToUsdtStep4 = goToUsdtStep4;
window.selectUsdtNetwork = selectUsdtNetwork;
window.selectUsdtRefundNetwork = selectUsdtRefundNetwork;
window.setUsdtSubmitType = setUsdtSubmitType;
window.handleUsdtScreenshotSelect = handleUsdtScreenshotSelect;
window.submitUsdtTask = submitUsdtTask;
window.closeTaskModal = closeTaskModal;
window.updateUsdtProfitCalc = updateUsdtProfitCalc;
window.showUsdtConfirmModal = showUsdtConfirmModal;
window.closeUsdtConfirmModal = closeUsdtConfirmModal;
window.executeFinalUsdtSubmit = executeFinalUsdtSubmit;
