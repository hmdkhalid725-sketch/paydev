// ====================================================
// WALLET LEDGER & WITHDRAWAL SYSTEM CONTROLLER
// ====================================================

let selectedWithdrawMethod = 'bKash';

// Set active withdrawal method option
document.addEventListener('DOMContentLoaded', () => {
  const methodOptions = document.querySelectorAll('.method-option');
  methodOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      selectedWithdrawMethod = opt.getAttribute('data-method');

      // Reset all to unselected style
      methodOptions.forEach(o => {
        o.classList.remove('selected');
        o.style.border = '2px solid rgba(255,255,255,0.07)';
        o.style.background = 'rgba(255,255,255,0.02)';
      });

      // Apply selected brand color
      opt.classList.add('selected');
      if (selectedWithdrawMethod === 'bKash') {
        opt.style.border = '2px solid #e2136e';
        opt.style.background = 'rgba(226,19,110,0.08)';
      } else if (selectedWithdrawMethod === 'Nagad') {
        opt.style.border = '2px solid #ff6a00';
        opt.style.background = 'rgba(255,106,0,0.08)';
      }
    });
  });

  const form = document.getElementById('withdrawal-form');
  if (form) {
    form.addEventListener('submit', handleWithdrawalRequest);
  }
});

async function loadWalletData() {
  if (!supabaseClient) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // 1. Fetch current wallet balance
    const { data: balance, error: balErr } = await supabaseClient
      .rpc('get_user_balance', { user_id: user.id });

    if (balErr) throw balErr;

    // Display balance
    document.getElementById('wallet-balance').innerText = `৳${parseFloat(balance || 0).toFixed(2)}`;

    // 2. Fetch withdrawal settings limits dynamically
    const { data: settings } = await supabaseClient
      .from('app_settings')
      .select('min_withdrawal, max_withdrawal')
      .single();

    if (settings) {
      const inputAmt = document.getElementById('withdraw-amount');
      if (inputAmt) {
        inputAmt.min = settings.min_withdrawal;
        inputAmt.placeholder = `Min: ৳${settings.min_withdrawal}`;
      }
    }

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
          <p class="empty-state-text">No transaction logs recorded yet.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = '';
    transactions.forEach(tx => {
      const isPositive = parseFloat(tx.amount) >= 0;
      const row = document.createElement('div');
      row.className = 'timeline-item';
      row.innerHTML = `
        <div class="timeline-info">
          <span class="timeline-title">${tx.description || 'Adjustment'}</span>
          <span class="timeline-date">${new Date(tx.created_at).toLocaleString()}</span>
        </div>
        <span class="timeline-amount ${isPositive ? 'plus' : 'minus'}">
          ${isPositive ? '+' : ''}৳${Math.abs(tx.amount).toFixed(2)}
        </span>
      `;
      listContainer.appendChild(row);
    });

  } catch (err) {
    console.error("Wallet loader error:", err);
    showToast("Failed to fetch wallet info.", "error");
  }
}

// Request withdrawal submission
async function handleWithdrawalRequest(e) {
  e.preventDefault();
  if (!supabaseClient) return;

  const withdrawNum = document.getElementById('withdraw-number').value.trim();
  const withdrawAmt = parseFloat(document.getElementById('withdraw-amount').value);

  if (!withdrawNum || isNaN(withdrawAmt)) {
    showToast('Please fill in all withdrawal details', 'error');
    return;
  }

  showSpinner(true);
  try {
    // Call secure Postgres RPC function request_withdrawal
    const { data: withdrawalId, error } = await supabaseClient
      .rpc('request_withdrawal', {
        p_amount: withdrawAmt,
        p_method: selectedWithdrawMethod,
        p_account_number: withdrawNum
      });

    if (error) throw error;

    showToast(`Withdrawal request of ৳${withdrawAmt} submitted!`, 'success');
    document.getElementById('withdrawal-form').reset();
    
    // Refresh ledger data
    await loadWalletData();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}
