// ====================================================
// WALLET LEDGER & WITHDRAWAL SYSTEM CONTROLLER
// ====================================================

var selectedWithdrawMethod = 'bKash';
var cachedUserBalanceBdt = 0;
var cachedMinBdtWithdrawal = 100;
var cachedMinUsdtWithdrawal = 3.00;

function selectWithdrawMethod(method) {
  selectedWithdrawMethod = method;

  const bkashBtn = document.getElementById('method-bkash-btn');
  const nagadBtn = document.getElementById('method-nagad-btn');
  const usdtBtn  = document.getElementById('method-usdt-btn');

  const options = [bkashBtn, nagadBtn, usdtBtn];
  options.forEach(o => {
    if (o) {
      o.classList.remove('selected');
      o.style.border = '2px solid rgba(255,255,255,0.07)';
      o.style.background = 'rgba(255,255,255,0.02)';
    }
  });

  if (method === 'bKash' && bkashBtn) {
    bkashBtn.classList.add('selected');
    bkashBtn.style.border = '2px solid #e2136e';
    bkashBtn.style.background = 'rgba(226,19,110,0.08)';
  } else if (method === 'Nagad' && nagadBtn) {
    nagadBtn.classList.add('selected');
    nagadBtn.style.border = '2px solid #ff6a00';
    nagadBtn.style.background = 'rgba(255,106,0,0.08)';
  } else if (method === 'USDT' && usdtBtn) {
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
  const bkashBtn = document.getElementById('method-bkash-btn');
  const nagadBtn = document.getElementById('method-nagad-btn');
  const usdtBtn  = document.getElementById('method-usdt-btn');

  const accLabel = document.getElementById('withdraw-account-label');
  const accInput = document.getElementById('withdraw-number');
  const amtLabel = document.getElementById('withdraw-amount-label');
  const curPrefix = document.getElementById('withdraw-currency-prefix');
  const minLabel = document.getElementById('min-withdraw-label');
  const amtInput = document.getElementById('withdraw-amount');
  const convHint = document.getElementById('withdraw-conversion-hint');
  const balDisplay = document.getElementById('wallet-balance');

  if (selectedWithdrawMethod === 'bKash') {
    if (bkashBtn) { bkashBtn.style.border = '2px solid #e2136e'; bkashBtn.style.background = 'rgba(226,19,110,0.08)'; }
    if (accLabel)  accLabel.innerText = 'বিকাশ একাউন্ট নম্বর';
    if (accInput)  accInput.placeholder = '01XXXXXXXXX';
    if (amtLabel)  amtLabel.innerText = 'উইথড্র পরিমাণ (৳)';
    if (curPrefix) curPrefix.innerText = '৳';
    if (minLabel)  minLabel.innerText = `৳${cachedMinBdtWithdrawal}`;
    if (amtInput)  { amtInput.min = cachedMinBdtWithdrawal; amtInput.placeholder = '0'; }
    if (convHint)  convHint.style.display = 'none';
    if (balDisplay) balDisplay.innerText = `৳${cachedUserBalanceBdt.toFixed(2)}`;

  } else if (selectedWithdrawMethod === 'Nagad') {
    if (nagadBtn) { nagadBtn.style.border = '2px solid #ff6a00'; nagadBtn.style.background = 'rgba(255,106,0,0.08)'; }
    if (accLabel)  accLabel.innerText = 'নগদ একাউন্ট নম্বর';
    if (accInput)  accInput.placeholder = '01XXXXXXXXX';
    if (amtLabel)  amtLabel.innerText = 'উইথড্র পরিমাণ (৳)';
    if (curPrefix) curPrefix.innerText = '৳';
    if (minLabel)  minLabel.innerText = `৳${cachedMinBdtWithdrawal}`;
    if (amtInput)  { amtInput.min = cachedMinBdtWithdrawal; amtInput.placeholder = '0'; }
    if (convHint)  convHint.style.display = 'none';
    if (balDisplay) balDisplay.innerText = `৳${cachedUserBalanceBdt.toFixed(2)}`;

  } else if (selectedWithdrawMethod === 'USDT') {
    if (usdtBtn) { usdtBtn.style.border = '2px solid #00e676'; usdtBtn.style.background = 'rgba(0,230,118,0.12)'; }
    if (accLabel)  accLabel.innerText = 'আপনার USDT ওয়ালেট এড্রেস (শুধুমাত্র BEP20 BSC)';
    if (accInput)  accInput.placeholder = 'যেমন: 0x155070856B... (BEP20 Address)';
    if (amtLabel)  amtLabel.innerText = 'উইথড্র পরিমাণ ($ USDT)';
    if (curPrefix) curPrefix.innerText = '$';
    if (minLabel)  minLabel.innerText = `$${cachedMinUsdtWithdrawal.toFixed(2)} USDT (৳${(cachedMinUsdtWithdrawal * 130).toFixed(0)})`;
    if (amtInput)  { amtInput.min = cachedMinUsdtWithdrawal; amtInput.placeholder = cachedMinUsdtWithdrawal.toString(); }
    if (convHint)  convHint.style.display = 'block';

    const balUsdt = cachedUserBalanceBdt / 130;
    if (balDisplay) balDisplay.innerText = `$${balUsdt.toFixed(2)} USDT`;
  }

  updateWithdrawConversionHint();
}

function updateWithdrawConversionHint() {
  const convHint = document.getElementById('withdraw-conversion-hint');
  const amtInput = document.getElementById('withdraw-amount');
  if (!convHint || !amtInput) return;

  if (selectedWithdrawMethod === 'USDT') {
    const valUsdt = parseFloat(amtInput.value) || 0;
    const valBdt = valUsdt * 130;
    convHint.style.display = 'block';
    convHint.innerHTML = `
      <div style="background:rgba(0,230,118,0.08); border:1px solid rgba(0,230,118,0.3); border-radius:8px; padding:8px 10px; margin-top:8px; line-height:1.4;">
        <span style="color:#00e676; font-weight:800; font-size:11.5px; display:block; margin-bottom:2px;">⚡ শুধুমাত্র BEP20 (Binance Smart Chain) এড্রেসে উইথড্র নেওয়া যাবে।</span>
        <span style="color:var(--accent-cyan); font-weight:700; font-size:11px;">💡 $${valUsdt.toFixed(2)} USDT = ৳${valBdt.toFixed(0)} BDT কেটে নেওয়া হবে। (রেট: ৳130/USDT)</span>
      </div>
    `;
  } else {
    convHint.style.display = 'none';
  }
}

async function loadWalletData() {
  if (!supabaseClient) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // 1. Fetch current wallet balance
    const { data: balance, error: balErr } = await supabaseClient
      .rpc('get_user_balance', { user_id: user.id });

    if (balErr) throw balErr;

    let bal = parseFloat(balance || 0);
    // If balance is in USDT fraction (< 5), convert at rate 130 BDT
    if (bal > 0 && bal < 5) {
      bal = bal * 130;
    }
    cachedUserBalanceBdt = bal;

    // 2. Fetch withdrawal settings limits dynamically
    const { data: settings } = await supabaseClient
      .from('app_settings')
      .select('min_withdrawal, min_usdt_withdrawal, max_withdrawal')
      .limit(1)
      .maybeSingle();

    if (settings) {
      if (settings.min_withdrawal) cachedMinBdtWithdrawal = parseFloat(settings.min_withdrawal);
      if (settings.min_usdt_withdrawal) cachedMinUsdtWithdrawal = parseFloat(settings.min_usdt_withdrawal);
    }

    updateWithdrawalFormUi();

    // 3. Fetch transaction ledger logs
    const { data: transactions, error: ledgerErr } = await supabaseClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (ledgerErr) throw ledgerErr;

    const listContainer = document.getElementById('wallet-transactions-list');
    if (!listContainer) return;

    if (transactions.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <svg class="empty-state-icon" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
          <p class="empty-state-text">এখনও কোনো ট্রানজেকশন রেকর্ড নেই।</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = '';
    transactions.forEach(tx => {
      let rawAmt = parseFloat(tx.amount || 0);
      const isPositive = rawAmt >= 0;
      let absAmt = Math.abs(rawAmt);

      // If amount is small (< 5), convert at rate 1 USDT = 130 BDT for BDT view
      let displayAmtStr = `৳${absAmt.toFixed(2)}`;
      if (absAmt > 0 && absAmt < 5) {
        const usdtVal = absAmt;
        const bdtVal  = absAmt * 130;
        displayAmtStr = `+$${usdtVal.toFixed(2)} USDT (৳${bdtVal.toFixed(0)})`;
      }

      const row = document.createElement('div');
      row.className = 'timeline-item';
      row.innerHTML = `
        <div class="timeline-info">
          <span class="timeline-title">${tx.description || 'Adjustment'}</span>
          <span class="timeline-date">${new Date(tx.created_at).toLocaleString('bn-BD')}</span>
        </div>
        <span class="timeline-amount ${isPositive ? 'plus' : 'minus'}" style="font-weight:800; font-size:13.5px;">
          ${isPositive ? '+' : '-'}${displayAmtStr}
        </span>
      `;
      listContainer.appendChild(row);
    });

  } catch (err) {
    console.error("Wallet loader error:", err);
    showToast("ওয়ালেট লোড করতে ব্যর্থ হয়েছে।", "error");
  }
}

// Request withdrawal submission
async function handleWithdrawalRequest(e) {
  e.preventDefault();
  if (!supabaseClient) return;

  const withdrawNum = document.getElementById('withdraw-number').value.trim();
  const inputAmt = parseFloat(document.getElementById('withdraw-amount').value);

  if (!withdrawNum || isNaN(inputAmt) || inputAmt <= 0) {
    showToast('অনুগ্রহ করে সঠিক নম্বর ও উইথড্র পরিমাণ দিন', 'error');
    return;
  }

  // Calculate actual BDT amount for request_withdrawal RPC
  let withdrawAmtBdt = inputAmt;
  let successMsg = `৳${inputAmt} টাকা উইথড্র রিকোয়েস্ট সফল হয়েছে!`;

  if (selectedWithdrawMethod === 'USDT') {
    if (inputAmt < cachedMinUsdtWithdrawal) {
      showToast(`USDT উইথড্রর জন্য সর্বনিম্ন $${cachedMinUsdtWithdrawal.toFixed(2)} USDT দিতে হবে`, 'error');
      return;
    }
    withdrawAmtBdt = inputAmt * 130;
    successMsg = `$${inputAmt.toFixed(2)} USDT (৳${withdrawAmtBdt.toFixed(0)} BDT) উইথড্র রিকোয়েস্ট জমা হয়েছে!`;
  } else {
    if (inputAmt < cachedMinBdtWithdrawal) {
      showToast(`বিকাশ/নগদে উইথড্রর জন্য সর্বনিম্ন ৳${cachedMinBdtWithdrawal} টাকা দিতে হবে`, 'error');
      return;
    }
  }

  if (withdrawAmtBdt > cachedUserBalanceBdt) {
    showToast('আপনার একাউন্টে পর্যাপ্ত ব্যালেন্স নেই।', 'error');
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
