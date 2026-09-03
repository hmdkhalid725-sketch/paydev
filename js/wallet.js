// ====================================================
// WALLET LEDGER & WITHDRAWAL SYSTEM CONTROLLER
// ====================================================

var selectedWithdrawMethod = 'USDT';
var cachedUserBalanceBdt = 0;
var cachedMinBdtWithdrawal = 100;
var cachedMinUsdtWithdrawal = 3.00;

function selectWithdrawMethod(method) {
  selectedWithdrawMethod = 'USDT';

  const usdtBtn = document.getElementById('method-usdt-btn');
  if (usdtBtn) {
    usdtBtn.classList.add('selected');
    usdtBtn.style.border = '2px solid #00e676';
    usdtBtn.style.background = 'rgba(0,230,118,0.12)';
  }

  updateWithdrawalFormUi();
}

window.selectWithdrawMethod = selectWithdrawMethod;

// Set active withdrawal method option
document.addEventListener('DOMContentLoaded', () => {
  setupWithdrawalMethodSwitch();

  const form = document.getElementById('withdrawal-form');
  if (form) {
    form.addEventListener('submit', handleWithdrawalRequest);
  }

  const amtInput = document.getElementById('withdraw-amount');
  if (amtInput) {
    amtInput.addEventListener('input', updateWithdrawConversionHint);
  }
});

function setupWithdrawalMethodSwitch() {
  const methodOptions = document.querySelectorAll('.method-option');
  methodOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      const method = opt.getAttribute('data-method');
      if (typeof window.selectWithdrawMethod === 'function') {
        window.selectWithdrawMethod(method);
      }
    });
  });
}

function updateWithdrawalFormUi() {
  const usdtBtn = document.getElementById('method-usdt-btn');
  if (usdtBtn) {
    usdtBtn.style.border = '2px solid #00e676';
    usdtBtn.style.background = 'rgba(0,230,118,0.12)';
  }

  const accLabel = document.getElementById('withdraw-account-label');
  const accInput = document.getElementById('withdraw-number');
  const amtLabel = document.getElementById('withdraw-amount-label');
  const curPrefix = document.getElementById('withdraw-currency-prefix');
  const minLabel = document.getElementById('min-withdraw-label');
  const amtInput = document.getElementById('withdraw-amount');
  const convHint = document.getElementById('withdraw-conversion-hint');
  const balDisplay = document.getElementById('wallet-balance');

  if (accLabel)  accLabel.innerText = 'USDT Wallet Address (BEP20 BSC)';
  if (accInput)  accInput.placeholder = '0x... (BEP20 Address)';
  if (amtLabel)  amtLabel.innerText = 'Withdraw Amount ($ USDT)';
  if (curPrefix) curPrefix.innerText = '$';
  if (minLabel)  minLabel.innerText = `$${cachedMinUsdtWithdrawal.toFixed(2)} USDT`;
  if (amtInput)  { amtInput.min = cachedMinUsdtWithdrawal; amtInput.placeholder = cachedMinUsdtWithdrawal.toString(); }
  if (convHint)  convHint.style.display = 'block';

  const balUsdt = cachedUserBalanceBdt / 127;
  if (balDisplay) balDisplay.innerText = `$${balUsdt.toFixed(2)} USDT`;

  updateWithdrawConversionHint();
}

function updateWithdrawConversionHint() {
  const convHint = document.getElementById('withdraw-conversion-hint');
  const amtInput = document.getElementById('withdraw-amount');
  if (!convHint || !amtInput) return;

  if (selectedWithdrawMethod === 'USDT') {
    const valUsdt = parseFloat(amtInput.value) || 0;
    convHint.style.display = 'block';
    convHint.innerHTML = `
      <div style="background:rgba(0,230,118,0.08); border:1px solid rgba(0,230,118,0.3); border-radius:8px; padding:8px 10px; margin-top:8px; line-height:1.4;">
        <span style="color:#00e676; font-weight:800; font-size:11.5px; display:block; margin-bottom:2px;">Network: BEP20 (Binance Smart Chain)</span>
        <span style="color:var(--accent-cyan); font-weight:700; font-size:11px;">Automatic payout processed within minutes upon admin approval.</span>
      </div>
    `;
  } else {
    convHint.style.display = 'none';
  }
}

async function loadWalletData() {
  // Sync connected BSC wallet address display
  const savedBsc = localStorage.getItem('user_bsc_usdt_address');
  const walletBscEl = document.getElementById('wallet-tab-bsc-address');
  if (walletBscEl && savedBsc && savedBsc.length >= 10) {
    walletBscEl.innerText = savedBsc;
  }

  if (!supabaseClient) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // 1. Fetch user profile and USDT wallet address
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('usdt_address, total_earned_bonus, balance')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) {
      if (profile.usdt_address && walletBscEl) {
        walletBscEl.innerText = profile.usdt_address;
        localStorage.setItem('user_bsc_usdt_address', profile.usdt_address);
      }

      const balEl = document.getElementById('wallet-balance');
      let currentBal = parseFloat(profile.balance || 0);
      if (currentBal > 0 && currentBal > 100) {
        currentBal = currentBal / 127.0; // convert legacy BDT balance to USDT
      }
      if (balEl) balEl.innerText = `$${currentBal.toFixed(2)}`;
    }

    // 2. Fetch transaction ledger logs
    const { data: transactions, error: ledgerErr } = await supabaseClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const listContainer = document.getElementById('wallet-transactions-list');
    if (!listContainer) return;

    if (!transactions || transactions.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state" style="padding:40px 20px; text-align:center;">
          <p class="empty-state-text" style="color:#94a3b8; font-size:13px;">No payout records found yet. Completed tasks are credited automatically.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = '';
    transactions.forEach(tx => {
      let rawAmt = parseFloat(tx.amount || 0);
      const isPositive = rawAmt >= 0;
      let absAmt = Math.abs(rawAmt);

      let displayAmtStr = `$${absAmt.toFixed(2)} USDT`;

      const row = document.createElement('div');
      row.className = 'timeline-item';
      row.style.background = '#121622';
      row.style.border = '1px solid rgba(255,255,255,0.08)';
      row.style.borderRadius = '12px';
      row.style.padding = '12px 14px';
      row.style.marginBottom = '8px';
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';

      row.innerHTML = `
        <div class="timeline-info">
          <span class="timeline-title" style="font-weight:800; color:#ffffff; font-size:13px; display:block;">${tx.description || 'Auto Refund & Bonus'}</span>
          <span class="timeline-date" style="font-size:10.5px; color:#94a3b8;">${new Date(tx.created_at).toLocaleString('en-US')}</span>
        </div>
        <span class="timeline-amount" style="font-weight:900; font-size:14px; color:${isPositive ? '#00e676' : '#ff3d00'};">
          ${isPositive ? '+' : '-'}${displayAmtStr}
        </span>
      `;
      listContainer.appendChild(row);
    });

  } catch (err) {
    console.error("Wallet loader notice:", err);
  }
}

// Request withdrawal submission
async function handleWithdrawalRequest(e) {
  e.preventDefault();
  if (!supabaseClient) return;

  const withdrawNum = document.getElementById('withdraw-number').value.trim();
  const inputAmt = parseFloat(document.getElementById('withdraw-amount').value);

  if (!withdrawNum || isNaN(inputAmt) || inputAmt <= 0) {
    showToast('Please enter a valid wallet address and amount', 'error');
    return;
  }

  // Calculate actual BDT amount for request_withdrawal RPC
  let withdrawAmtBdt = inputAmt * 127;
  let successMsg = `$${inputAmt.toFixed(2)} USDT withdrawal request submitted successfully!`;

  if (selectedWithdrawMethod === 'USDT') {
    if (inputAmt < cachedMinUsdtWithdrawal) {
      showToast(`Minimum withdrawal is $${cachedMinUsdtWithdrawal.toFixed(2)} USDT`, 'error');
      return;
    }
  } else {
    if (inputAmt < cachedMinBdtWithdrawal) {
      showToast(`Minimum withdrawal is $${cachedMinUsdtWithdrawal.toFixed(2)} USDT`, 'error');
      return;
    }
  }

  if (withdrawAmtBdt > cachedUserBalanceBdt) {
    showToast('Insufficient balance.', 'error');
    return;
  }

  showSpinner(true);
  try {
    // Call secure Postgres RPC function request_withdrawal
    const { data: withdrawalId, error } = await supabaseClient
      .rpc('request_withdrawal', {
        p_amount: withdrawAmtBdt,
        p_method: selectedWithdrawMethod,
        p_account_number: withdrawNum
      });

    if (error) throw error;

    showToast(successMsg, 'success');
    document.getElementById('withdrawal-form').reset();
    
    // Refresh ledger data
    await loadWalletData();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// Global Window Exports
window.loadWalletData = loadWalletData;
window.handleWithdrawalRequest = handleWithdrawalRequest;
window.updateWithdrawalFormUi = updateWithdrawalFormUi;
window.updateWithdrawConversionHint = updateWithdrawConversionHint;
window.selectWithdrawMethod = selectWithdrawMethod;
