// ====================================================
// TASKS PAGE — BSC USDT WALLET CONNECT & CONVERTER SYSTEM
// ====================================================

const USDT_TO_BDT_RATE = 127.00;
let userBscAddress = '';
let invoiceTimerInterval = null;
let currentTaskUsdtAmount = 10.0;

window.currentCashbackRate = 4.1;
window.currentMinDeposit = 5.00;
window.currentMaxDeposit = 100000.00;

document.addEventListener('DOMContentLoaded', () => {
  initTasksPage();
});

function initTasksPage() {
  loadUserBscAddress();
  selectPresetAmount(10);
  loadDynamicPlatformSettings();
}

async function loadDynamicPlatformSettings() {
  if (!window.supabaseClient) return;
  try {
    const { data } = await window.supabaseClient
      .from('app_settings')
      .select('cashback_rate, min_deposit, max_deposit')
      .limit(1)
      .single();

    if (data) {
      if (data.cashback_rate) window.currentCashbackRate = parseFloat(data.cashback_rate);
      if (data.min_deposit) window.currentMinDeposit = parseFloat(data.min_deposit);
      if (data.max_deposit) window.currentMaxDeposit = parseFloat(data.max_deposit);

      const limitBadge = document.getElementById('task-deposit-limits-badge');
      if (limitBadge) {
        limitBadge.innerText = `Min $${window.currentMinDeposit} • Max $${window.currentMaxDeposit.toLocaleString()}`;
      }

      const inputEl = document.getElementById('task-usdt-input');
      if (inputEl) {
        inputEl.min = window.currentMinDeposit;
        inputEl.max = window.currentMaxDeposit;
      }

      const bonusRateLabel = document.getElementById('task-bonus-rate-label');
      if (bonusRateLabel) {
        bonusRateLabel.innerText = `+${window.currentCashbackRate}% Cashback Bonus Included`;
      }

      const summaryBonusRateLabel = document.getElementById('summary-bonus-rate-label');
      if (summaryBonusRateLabel) {
        summaryBonusRateLabel.innerText = `Cashback Bonus (+${window.currentCashbackRate}%):`;
      }

      document.querySelectorAll('.dynamic-cashback-rate').forEach(el => {
        el.innerText = `${window.currentCashbackRate}%`;
      });

      const currentVal = parseFloat(inputEl?.value || 10);
      updateTaskSummary(currentVal);
    }
  } catch(e) {
    console.error('Settings load notice:', e);
  }
}

// ── ADMIN BEP20 DEPOSIT RECEIVING WALLET RESOLVER ────────────────────────────
window.getAdminBscDepositAddress = async function() {
  if (window.supabaseClient) {
    try {
      const { data } = await window.supabaseClient
        .from('app_settings')
        .select('usdt_bep20_address')
        .limit(1)
        .single();
      if (data && data.usdt_bep20_address && data.usdt_bep20_address.startsWith('0x')) {
        return data.usdt_bep20_address.trim();
      }
    } catch (e) {}
  }
  return '0xFE3B557E8Fb62b89F4916B721be55cEb828dBd73';
};

// ── 1. WALLET CONNECT & REFUND ADDRESS CONTROLLER ────────────────────────────
async function loadUserBscAddress() {
  if (!supabaseClient) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      setBscAddressUI('');
      return;
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('wallet_address, usdt_address')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && profile.wallet_address && profile.wallet_address.trim().length > 5) {
      const cleanAddr = profile.wallet_address.trim();
      userBscAddress = cleanAddr;
      localStorage.setItem('user_refund_payout_address', cleanAddr);
      setBscAddressUI(cleanAddr);
    } else {
      // User has NOT set up their payout wallet yet! Reset and show setup card
      userBscAddress = '';
      localStorage.removeItem('user_refund_payout_address');
      setBscAddressUI('');
    }

    if (profile && profile.usdt_address) {
      localStorage.setItem('user_deposit_sub_address', profile.usdt_address);
    }
  } catch (err) {
    console.error('Error loading BSC USDT address:', err);
  }
}

function setBscAddressUI(addr) {
  const fullCard = document.getElementById('wallet-setup-full-card');
  const savedWrap = document.getElementById('bsc-address-saved-wrap');
  const savedText = document.getElementById('saved-bsc-address-text');
  const proceedBtn = document.getElementById('btn-proceed-to-deposit');

  if (addr && addr.length > 5) {
    if (fullCard) fullCard.style.display = 'none';
    if (savedWrap) savedWrap.style.display = 'flex';
    if (savedText) savedText.innerText = addr;
    if (proceedBtn) {
      proceedBtn.innerHTML = `
        <span>Proceed to Deposit</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
      `;
    }
  } else {
    if (fullCard) fullCard.style.display = 'block';
    if (savedWrap) savedWrap.style.display = 'none';
    if (proceedBtn) {
      proceedBtn.innerHTML = `
        <span>Connect Refund Wallet to Deposit</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
      `;
    }
  }
}

async function saveUserBscAddress() {
  const input = document.getElementById('bsc-usdt-address-input');
  if (!input) return;
  const addr = input.value.trim();

  const isEvmRegex = /^0x[a-fA-F0-9]{40}$/;
  if (!addr || !isEvmRegex.test(addr)) {
    showToast('Please enter a valid 42-character BSC BEP20 (0x...) wallet address.', 'error');
    return;
  }

  userBscAddress = addr;
  localStorage.setItem('user_refund_payout_address', addr);
  setBscAddressUI(addr);
  showToast('BSC USDT refund wallet saved successfully!', 'success');

  if (supabaseClient) {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (user) {
        await supabaseClient
          .from('profiles')
          .update({ wallet_address: addr })
          .eq('id', user.id);

        // If balance is already >= $3.00, immediately trigger automated withdrawal to newly saved wallet!
        try {
          await supabaseClient.rpc('check_and_trigger_auto_withdrawal', { p_user_id: user.id });
        } catch (e) {}
      }
    } catch (e) {
      console.log('Profile update notice:', e);
    }
  }
}

function editUserBscAddress() {
  const fullCard = document.getElementById('wallet-setup-full-card');
  const savedWrap = document.getElementById('bsc-address-saved-wrap');
  const input = document.getElementById('bsc-usdt-address-input');

  if (fullCard) fullCard.style.display = 'block';
  if (savedWrap) savedWrap.style.display = 'none';

  if (input) {
    input.value = userBscAddress || '';
    input.focus();
  }
}

// ── 2. DUAL CURRENCY CONVERTER (USDT <-> BDT) ──────────────────────────────────
function onUsdtInputChanged(val) {
  const usdtVal = parseFloat(val) || 0;
  currentTaskUsdtAmount = usdtVal;
  
  const bdtInput = document.getElementById('task-bdt-input');
  if (bdtInput) {
    bdtInput.value = usdtVal > 0 ? (usdtVal * USDT_TO_BDT_RATE).toFixed(0) : '';
  }

  updatePresetActiveButton(usdtVal);
  updateTaskSummary(usdtVal);
}

function onBdtInputChanged(val) {
  const bdtVal = parseFloat(val) || 0;
  const usdtVal = bdtVal > 0 ? (bdtVal / USDT_TO_BDT_RATE) : 0;
  currentTaskUsdtAmount = usdtVal;

  const usdtInput = document.getElementById('task-usdt-input');
  if (usdtInput) {
    usdtInput.value = usdtVal > 0 ? usdtVal.toFixed(2) : '';
  }

  updatePresetActiveButton(usdtVal);
  updateTaskSummary(usdtVal);
}

function selectPresetAmount(amt) {
  currentTaskUsdtAmount = amt;
  
  const usdtInput = document.getElementById('task-usdt-input');
  const bdtInput = document.getElementById('task-bdt-input');

  if (usdtInput) usdtInput.value = amt;
  if (bdtInput) bdtInput.value = (amt * USDT_TO_BDT_RATE).toFixed(0);

  updatePresetActiveButton(amt);
  updateTaskSummary(amt);
}

function updatePresetActiveButton(amt) {
  const buttons = document.querySelectorAll('.preset-amt-btn');
  buttons.forEach(btn => {
    const btnAmt = parseFloat(btn.innerText.replace(/[^\d.]/g, ''));
    if (Math.abs(btnAmt - amt) < 0.1) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function updateTaskSummary(usdtVal) {
  const depositEl = document.getElementById('summary-deposit-amt');
  const bonusEl = document.getElementById('summary-bonus-amt');
  const totalReturnEl = document.getElementById('summary-total-return');

  const rate = (typeof window.currentCashbackRate === 'number') ? window.currentCashbackRate : 4.1;
  const bonusUsdt = usdtVal * (rate / 100.0);
  const totalUsdt = usdtVal + bonusUsdt;

  if (depositEl) depositEl.innerText = `$${usdtVal.toFixed(2)} USDT`;
  if (bonusEl) bonusEl.innerText = `+$${bonusUsdt.toFixed(2)} USDT`;
  if (totalReturnEl) totalReturnEl.innerText = `$${totalUsdt.toFixed(2)} USDT`;
}

// Helper to guarantee payment info element exists & is fully populated regardless of HTML caching
function ensurePaymentInvoiceViewDOM() {
  let fullPayView = document.getElementById('task-payment-full-view');
  if (!fullPayView) {
    const tabTasks = document.getElementById('tab-tasks');
    if (!tabTasks) return null;

    fullPayView = document.createElement('div');
    fullPayView.id = 'task-payment-full-view';
    tabTasks.appendChild(fullPayView);
  }

  // Force innerHTML re-population matching User Screenshot 1
  fullPayView.innerHTML = `
    <!-- Top Back & Header Bar -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
      <button type="button" onclick="backToTaskCalculatorView()" style="background:none; border:none; color:#ffffff; font-size:20px; font-weight:800; cursor:pointer;">
        ←
      </button>
      <h3 style="font-size:17px; font-weight:800; color:#ffffff; margin:0;">Payment Info</h3>
      <button type="button" onclick="location.reload()" style="background:none; border:none; color:#ffffff; font-size:18px; cursor:pointer;">
        🔄
      </button>
    </div>

    <!-- Top Hero Amount Due Card -->
    <div style="background:#141822; border:1px solid rgba(0,230,118,0.25); border-radius:20px; padding:18px 20px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 6px 20px rgba(0,0,0,0.35);">
      <div>
        <p style="font-size:11.5px; color:#94a3b8; margin:0 0 4px 0;">Amount due</p>
        <h2 style="font-size:24px; font-weight:900; color:#ffffff; margin:0;" id="invoice-deposit-amount">${(currentTaskUsdtAmount + 0.01).toFixed(4)} USDT</h2>
      </div>
      <div style="background:rgba(0,229,255,0.12); color:#00e5ff; border:1px solid rgba(0,229,255,0.3); border-radius:20px; padding:6px 14px; font-size:13px; font-weight:800; font-family:monospace; display:flex; align-items:center; gap:6px;">
        <span>⏱️</span>
        <span id="invoice-countdown-timer">24:59</span>
      </div>
    </div>

    <!-- Payment Details List Card -->
    <div style="background:#141822; border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:18px; margin-bottom:18px; display:flex; flex-direction:column; gap:14px; box-shadow:0 6px 20px rgba(0,0,0,0.35);">
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px;">
        <span style="color:#94a3b8;">Network</span>
        <strong style="color:#ffffff; font-weight:800;">USDT-BSC</strong>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px;">
        <span style="color:#94a3b8;">Transaction Number</span>
        <strong style="color:#ffffff; font-family:monospace; font-weight:800;" id="invoice-trx-number">202609022011274174</strong>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px;">
        <span style="color:#94a3b8;">Payment Address</span>
        <div style="display:flex; align-items:center; gap:6px; max-width:60%;">
          <span id="invoice-receiver-address" style="font-family:monospace; color:#00e5ff; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:11.5px;">Generating Unique Address...</span>
          <button type="button" onclick="copyInvoiceText('invoice-receiver-address', 'Address copied to clipboard ✓')" style="background:rgba(0,229,255,0.1); border:1px solid rgba(0,229,255,0.25); color:#00e5ff; font-size:11px; font-weight:700; padding:4px 9px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>Copy</span>
          </button>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px;">
        <div>
          <span style="color:#94a3b8; display:block;">Payment Amount</span>
          <span style="color:#f0b90b; font-size:10px; font-weight:700;">(+0.01 TRX fee included)</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <strong style="color:#00e676; font-weight:900;" id="invoice-exact-amount">${(currentTaskUsdtAmount + 0.01).toFixed(4)} USDT</strong>
          <button type="button" onclick="copyInvoiceText('invoice-exact-amount', 'Amount copied to clipboard ✓')" style="background:rgba(0,230,118,0.1); border:1px solid rgba(0,230,118,0.25); color:#00e676; font-size:11px; font-weight:700; padding:4px 9px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>Copy</span>
          </button>
        </div>
      </div>
    </div>

    <!-- QR Code & Warning Box Container -->
    <div style="background:#141822; border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:18px; margin-bottom:18px; text-align:center; box-shadow:0 6px 20px rgba(0,0,0,0.35);">
      <!-- Clean Warning Box -->
      <div style="background:rgba(234,179,8,0.08); border:1px solid rgba(234,179,8,0.25); border-radius:12px; padding:10px 14px; margin-bottom:16px; text-align:left; display:flex; align-items:center; gap:10px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <p style="font-size:11.5px; color:#fef08a; margin:0; line-height:1.4;">
          Check amount and address before sending. Transfer only via BEP20 BSC.
        </p>
      </div>

      <!-- Dynamic QR Code -->
      <div style="position:relative; background:#ffffff; border-radius:16px; padding:16px; display:inline-block; margin-bottom:12px; box-shadow:0 4px 16px rgba(0,0,0,0.3);">
        <img id="invoice-qr-code-img" src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=USDT-BSC" alt="Payment QR Code" style="width:180px; height:180px; display:block;" />
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:34px; height:34px; border-radius:50%; background:#ffffff; padding:2px; box-shadow:0 2px 8px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center;">
          <img src="./assets/usdt-logo.png" alt="USDT" style="width:28px; height:28px; border-radius:50%; object-fit:contain;" />
        </div>
      </div>

      <p style="font-size:11px; color:#94a3b8; margin:0; line-height:1.4;">
        Scan QR code in Binance, Trust Wallet, MetaMask or OKX to complete transfer.
      </p>
    </div>

    <!-- Submit / Cancel Buttons -->
    <div style="background:#141822; border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:18px; margin-bottom:18px;">
      <div style="display:flex; align-items:center; gap:8px; background:rgba(0,229,255,0.06); border:1px solid rgba(0,229,255,0.2); border-radius:12px; padding:10px 12px; margin-bottom:14px; font-size:11.5px; color:#94a3b8;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00e5ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>Automated BSC node detection active. Tap 'Confirm Paid' after transferring.</span>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1.3fr; gap:10px;">
        <button type="button" onclick="backToTaskCalculatorView()" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#ffffff; font-size:13.5px; font-weight:800; padding:14px; border-radius:14px; cursor:pointer;">
          Cancel
        </button>
        <button type="button" onclick="confirmTaskPaymentSubmission()" style="background:linear-gradient(135deg, #00e676 0%, #00e5ff 100%); color:#000000; border:none; font-size:13.5px; font-weight:900; padding:14px; border-radius:14px; cursor:pointer; box-shadow:0 4px 16px rgba(0,230,118,0.35); display:flex; align-items:center; justify-content:center; gap:6px;" id="btn-submit-invoice-payment">
          <span>Confirm Paid</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>
    </div>
  `;

  return fullPayView;
}

// Helper to guarantee confirmation overlay modal exists & is fully populated
function ensureConfirmBeforePaymentModalDOM() {
  let modal = document.getElementById('modal-confirm-before-payment');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-confirm-before-payment';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); backdrop-filter:blur(6px); z-index:9999; align-items:center; justify-content:center; padding:20px;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:#ffffff; border-radius:24px; max-width:420px; width:100%; padding:24px; box-shadow:0 12px 32px rgba(0,0,0,0.6); color:#1e293b; animation:fade-in 0.25s ease-out; font-family:var(--font-family, sans-serif);">
      
      <!-- Warning Emblem -->
      <div style="width:48px; height:48px; border-radius:50%; background:#fef3c7; border:1px solid #fde68a; color:#d97706; display:flex; align-items:center; justify-content:center; font-size:24px; margin:0 0 14px 0;">
        ⚠️
      </div>

      <h3 style="font-size:18px; font-weight:900; color:#0f172a; margin:0 0 4px 0;">Confirm before payment</h3>
      <p style="font-size:12px; color:#64748b; margin:0 0 16px 0;">Confirm to create the order and continue to payment</p>

      <!-- Red Warning Box -->
      <div style="background:#fef2f2; border:1px solid #fee2e2; border-radius:14px; padding:14px; margin-bottom:12px;">
        <h4 style="font-size:13px; font-weight:900; color:#991b1b; margin:0 0 6px 0;">The amount must match exactly</h4>
        <p style="font-size:11.5px; color:#7f1d1d; margin:0; line-height:1.5;">
          For USDT deposits, please assume the transaction fee yourself and ensure the amount received matches the order amount exactly.<br><br>
          Inconsistent amounts will prevent automatic deposit recognition and require manual processing, which is time-consuming.
        </p>
      </div>

      <!-- Yellow Warning Box -->
      <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:14px; padding:14px; margin-bottom:16px;">
        <h4 style="font-size:13px; font-weight:900; color:#92400e; margin:0 0 6px 0; display:flex; align-items:center; gap:6px;">
          <span>🪟</span> Check the address and network
        </h4>
        <p style="font-size:11.5px; color:#78350f; margin:0; line-height:1.5;">
          Only use the <strong>USDT-BSC</strong> network and receiving address shown on the order page.
        </p>
      </div>

      <!-- Checkmarks -->
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px; font-size:11.5px; color:#475569; font-weight:600;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="color:#0d9488; font-size:14px; font-weight:900;">✓</span>
          <span>Don't scan the same QR code or pay to the same address again.</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="color:#0d9488; font-size:14px; font-weight:900;">✓</span>
          <span>For another recharge, create a new order.</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <button type="button" onclick="closeConfirmBeforePaymentModal()" style="background:#f1f5f9; border:none; color:#475569; font-size:13.5px; font-weight:800; padding:14px; border-radius:14px; cursor:pointer;">
          Cancel
        </button>
        <button type="button" onclick="executeProceedToPaymentInvoice()" style="background:#0d9488; color:#ffffff; border:none; font-size:13.5px; font-weight:900; padding:14px; border-radius:14px; cursor:pointer; box-shadow:0 4px 14px rgba(13,148,136,0.35);">
          Confirm and continue
        </button>
      </div>

    </div>
  `;
  return modal;
}

// ── 3. PAYMENT INVOICE FULL-PAGE VIEW & 30-MIN COUNTDOWN ─────────────────────
async function proceedToPaymentInvoice() {
  const currentWallet = (typeof userBscAddress !== 'undefined' && userBscAddress) ? userBscAddress : localStorage.getItem('user_refund_payout_address');
  if (!currentWallet || currentWallet.trim().length < 10 || !currentWallet.startsWith('0x')) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Please connect & save your BEP20 Refund Wallet first!', 'error');
    } else {
      alert('Please connect your BEP20 Refund Wallet first!');
    }
    return;
  }

  const usdtInput = document.getElementById('task-usdt-input');
  if (usdtInput && parseFloat(usdtInput.value) > 0) {
    currentTaskUsdtAmount = parseFloat(usdtInput.value);
  } else {
    currentTaskUsdtAmount = 10.0;
  }

  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0') +
    String(Math.floor(Math.random() * 1000)).padStart(3, '0');

  // Await user's dedicated unique Sub-Wallet deposit address BEFORE doing any DOM updates
  let userSubAddress = '';
  if (typeof window.getUserUniqueBscDepositAddress === 'function') {
    try {
      userSubAddress = await window.getUserUniqueBscDepositAddress();
    } catch (e) {
      console.log('User Sub-address fetch error:', e);
    }
  }
  if (!userSubAddress || !userSubAddress.startsWith('0x')) {
    userSubAddress = localStorage.getItem('user_bsc_usdt_address') || '0xFE3B557E8Fb62b89F4916B721be55cEb828dBd73';
  }

  // Update modal element texts with user's dedicated Sub-ID deposit address
  const payableWithFee = (currentTaskUsdtAmount + 0.01);
  const depAmt = document.getElementById('modal-invoice-deposit-amount');
  if (depAmt) depAmt.innerText = `${payableWithFee.toFixed(4)} USDT`;

  const exAmt = document.getElementById('modal-invoice-exact-amount');
  if (exAmt) exAmt.innerText = `${payableWithFee.toFixed(4)} USDT`;

  const trxNum = document.getElementById('modal-invoice-trx-number');
  if (trxNum) trxNum.innerText = dateStr;

  const recAddr = document.getElementById('modal-invoice-receiver-address');
  if (recAddr) recAddr.innerText = userSubAddress;

  const qrImg = document.getElementById('modal-invoice-qr-code-img');
  if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(userSubAddress)}`;

  const fullRecAddr = document.getElementById('invoice-receiver-address');
  if (fullRecAddr) fullRecAddr.innerText = userSubAddress;

  const fullQrImg = document.getElementById('invoice-qr-code-img');
  if (fullQrImg) fullQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(userSubAddress)}`;

  const modalScreen = document.getElementById('payment-info-modal-screen');
  if (modalScreen) {
    modalScreen.style.display = 'block';
    modalScreen.scrollTop = 0;
  }

  startInvoice30MinCountdown();
}

function showConfirmBeforePaymentModal() {
  if (typeof window.triggerDepositAttentionFlow === 'function') {
    window.triggerDepositAttentionFlow();
  } else {
    proceedToPaymentInvoice();
  }
}

function closeConfirmBeforePaymentModal() {
  closePaymentInfoModalScreen();
}

function executeProceedToPaymentInvoice() {
  if (typeof window.triggerDepositAttentionFlow === 'function') {
    window.triggerDepositAttentionFlow();
  } else {
    proceedToPaymentInvoice();
  }
}

function closePaymentInfoModalScreen() {
  const modalScreen = document.getElementById('payment-info-modal-screen');
  if (modalScreen) modalScreen.style.display = 'none';
}

function backToTaskCalculatorView() {
  // 1. Hide payment info modal overlay screen
  const paymentModal = document.getElementById('payment-info-modal-screen');
  if (paymentModal) paymentModal.style.display = 'none';

  // 2. Hide standalone task history overlay screen
  const historyScreen = document.getElementById('task-history-standalone-screen');
  if (historyScreen) historyScreen.style.display = 'none';

  // 3. Hide full page history view if present
  const histView = document.getElementById('task-history-full-view');
  if (histView) histView.style.setProperty('display', 'none', 'important');

  // 4. Hide full page payment view if present
  const payView = document.getElementById('task-payment-full-view');
  if (payView) payView.style.setProperty('display', 'none', 'important');

  // 5. Restore main calculator terminal view
  const calcView = document.getElementById('task-calculator-main-view');
  if (calcView) calcView.style.setProperty('display', 'block', 'important');

  // 6. Clear timers
  if (typeof invoiceTimerInterval !== 'undefined' && invoiceTimerInterval) {
    clearInterval(invoiceTimerInterval);
  }
  if (window.globalInvoiceCountdownInterval) {
    clearInterval(window.globalInvoiceCountdownInterval);
  }

  // 7. Reset scroll position to top
  window.scrollTo(0, 0);
  const mainApp = document.querySelector('.app-main');
  if (mainApp) mainApp.scrollTop = 0;
}

function closeSubmissionsHistoryModal() {
  backToTaskCalculatorView();
}

function closePaymentInfoModalScreen() {
  backToTaskCalculatorView();
}

function startInvoice30MinCountdown() {
  if (invoiceTimerInterval) clearInterval(invoiceTimerInterval);

  let secondsLeft = 30 * 60; // 30 minutes
  const timerEl = document.getElementById('invoice-countdown-timer');

  function updateTimerUI() {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
    const secsStr = secs < 10 ? `0${secs}` : `${secs}`;

    if (timerEl) timerEl.innerText = `${minsStr}:${secsStr}`;

    if (secondsLeft <= 0) {
      clearInterval(invoiceTimerInterval);
      if (timerEl) timerEl.innerText = 'Expired';
    } else {
      secondsLeft--;
    }
  }

  updateTimerUI();
  invoiceTimerInterval = setInterval(updateTimerUI, 1000);
}

function copyInvoiceText(elementId, successMsg) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const textToCopy = el.innerText.replace('USDT', '').trim();
  navigator.clipboard.writeText(textToCopy).then(() => {
    showToast(successMsg, 'success');
  }).catch(() => {
    showToast('Copy failed. Please copy manually.', 'error');
  });
}

async function confirmTaskPaymentSubmission() {
  if (typeof window.submitUsdtTaskDepositOrder === 'function') {
    return await window.submitUsdtTaskDepositOrder();
  }
}

// ── UNIQUE BSC (BEP20) DEPOSIT ADDRESS GENERATOR FOR EACH USER (AUTHENTICATED) ─────
window.getUserUniqueBscDepositAddress = async function() {
  if (!window.supabaseClient) {
    return '0xFE3B557E8Fb62b89F4916B721be55cEb828dBd73';
  }

  try {
    let authUser = null;
    try {
      const { data: { user } } = await window.supabaseClient.auth.getUser();
      authUser = user;
    } catch (e) {}

    if (!authUser) {
      try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session && session.user) authUser = session.user;
      } catch (e) {}
    }

    if (authUser && authUser.id) {
      const { data: profile } = await window.supabaseClient
        .from('profiles')
        .select('usdt_address, private_key')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profile && profile.usdt_address && profile.usdt_address.startsWith('0x')) {
        localStorage.setItem('user_deposit_sub_address', profile.usdt_address);
        return profile.usdt_address;
      }

      // If user exists in DB but doesn't have an address yet, generate a cryptographically valid matching keypair
      let addr = null;
      let pKey = null;
      if (typeof ethers !== 'undefined' && ethers.Wallet) {
        const newWallet = ethers.Wallet.createRandom();
        addr = newWallet.address;
        pKey = newWallet.privateKey;
      }

      if (addr && pKey) {
        await window.supabaseClient
          .from('profiles')
          .update({ usdt_address: addr, private_key: pKey })
          .eq('id', authUser.id);
        localStorage.setItem('user_deposit_sub_address', addr);
        return addr;
      }
    }

    // Check phone-based session ONLY if phone is explicitly in localStorage (no hardcoded fallback)
    const savedPhone = localStorage.getItem('user_phone') || localStorage.getItem('phone');
    if (savedPhone) {
      const { data: phoneProfile } = await window.supabaseClient
        .from('profiles')
        .select('usdt_address')
        .eq('phone', savedPhone)
        .maybeSingle();

      if (phoneProfile && phoneProfile.usdt_address && phoneProfile.usdt_address.startsWith('0x')) {
        localStorage.setItem('user_deposit_sub_address', phoneProfile.usdt_address);
        return phoneProfile.usdt_address;
      }
    }

    return localStorage.getItem('user_deposit_sub_address') || '0xFE3B557E8Fb62b89F4916B721be55cEb828dBd73';

  } catch (e) {
    console.log('Unique address generation notice:', e);
    return localStorage.getItem('user_deposit_sub_address') || '0xFE3B557E8Fb62b89F4916B721be55cEb828dBd73';
  }
};

// ── BSC (BEP20) REAL-TIME BLOCKCHAIN AUTO-DETECTOR & VERIFIER ────────────────
window.verifyBscUsdtTransactionOnChain = async function(txHash, userSubmissionId) {
  if (!txHash || !txHash.startsWith('0x') || txHash.length < 50) {
    return { success: false, reason: 'Invalid TxHash format' };
  }

  try {
    const rpcPayload = {
      jsonrpc: "2.0",
      method: "eth_getTransactionReceipt",
      params: [txHash],
      id: 1
    };

    const response = await fetch("https://bsc-dataseed.binance.org/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcPayload)
    });

    const resData = await response.json();

    if (resData && resData.result && resData.result.status === "0x1") {
      // Transaction is 100% Confirmed on BSC Blockchain!
      if (window.supabaseClient && userSubmissionId) {
        await window.supabaseClient
          .from('task_submissions')
          .update({ status: 'approved' })
          .eq('id', userSubmissionId);
        
        if (typeof showToast === 'function') {
          showToast('Blockchain transaction confirmed! Deposit approved.', 'success');
        }
      }
      return { success: true, status: 'approved' };
    }
  } catch (e) {
    console.log('BSC RPC query notice:', e);
  }

  return { success: false, reason: 'Pending blockchain confirmation' };
};
