// ====================================================
// WALLET LEDGER & AUTOMATED WITHDRAWAL CONTROLLER
// PURE USDT WEB3 ARCHITECTURE ($3.00 AUTO-PAYOUT THRESHOLD)
// ====================================================

var cachedUserBalanceUsdt = 0;
var cachedMinUsdtWithdrawal = 3.00;

// Main wallet loader
async function loadWalletData() {
  if (!supabaseClient) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // 1. Fetch dynamic settings from app_settings
    try {
      const { data: settings } = await supabaseClient
        .from('app_settings')
        .select('min_usdt_withdrawal, min_withdrawal')
        .single();
      if (settings) {
        cachedMinUsdtWithdrawal = parseFloat(settings.min_usdt_withdrawal || settings.min_withdrawal || 3.00);
      }
    } catch (e) {}

    // 2. Fetch user's connected BEP20 refund wallet from profiles
    let userRefundWallet = '';
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('wallet_address, usdt_address')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && profile.wallet_address) {
      userRefundWallet = profile.wallet_address;
      localStorage.setItem('user_refund_payout_address', userRefundWallet);
    } else {
      userRefundWallet = localStorage.getItem('user_refund_payout_address') || '';
    }

    const walletBscEl = document.getElementById('wallet-tab-bsc-address');
    if (walletBscEl) {
      if (userRefundWallet && userRefundWallet.startsWith('0x')) {
        walletBscEl.innerText = userRefundWallet;
        walletBscEl.style.color = '#00e5ff';
      } else {
        walletBscEl.innerText = 'Not Configured (Set up in Tasks page)';
        walletBscEl.style.color = '#ff9100';
      }
    }

    // 3. Automated Withdrawal Evaluation Check
    // If balance >= threshold and wallet is connected, the RPC triggers auto-withdrawal
    try {
      await supabaseClient.rpc('check_and_trigger_auto_withdrawal', { p_user_id: user.id });
    } catch (e) {}

    // 4. Fetch real-time balance via get_user_balance RPC
    try {
      const { data: rpcBal, error: rpcErr } = await supabaseClient.rpc('get_user_balance', { user_id: user.id });
      if (!rpcErr && rpcBal !== null) {
        cachedUserBalanceUsdt = parseFloat(rpcBal || 0);
      } else {
        const { data: txList } = await supabaseClient
          .from('wallet_transactions')
          .select('amount')
          .eq('user_id', user.id);
        if (txList) {
          cachedUserBalanceUsdt = txList.reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);
        }
      }
    } catch (e) {
      console.warn('Balance fetch notice:', e);
    }

    const balEl = document.getElementById('wallet-balance');
    if (balEl) balEl.innerText = `$${cachedUserBalanceUsdt.toFixed(2)}`;

    // 5. Update Auto-Withdrawal Progress Bar & Status
    const progressBar = document.getElementById('auto-withdraw-progress-bar');
    const progressText = document.getElementById('auto-withdraw-progress-text');
    const threshold = cachedMinUsdtWithdrawal || 3.00;

    const progressPct = Math.min(100, Math.max(0, (cachedUserBalanceUsdt / threshold) * 100));
    if (progressBar) progressBar.style.width = `${progressPct.toFixed(1)}%`;
    if (progressText) {
      progressText.innerText = `$${cachedUserBalanceUsdt.toFixed(2)} / $${threshold.toFixed(2)} USDT`;
    }

    // 6. Check for active/pending automated withdrawal requests
    const { data: activeWdrs } = await supabaseClient
      .from('withdrawals')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1);

    const pendingBanner = document.getElementById('wallet-pending-payout-banner');
    const pendingTitle = document.getElementById('pending-payout-title');
    const pendingDesc = document.getElementById('pending-payout-desc');

    if (activeWdrs && activeWdrs.length > 0) {
      const activeW = activeWdrs[0];
      if (pendingBanner) pendingBanner.style.display = 'block';
      if (pendingTitle) pendingTitle.innerText = `⚡ Automated Payout Queued ($${parseFloat(activeW.amount).toFixed(2)} USDT)`;
      if (pendingDesc) {
        pendingDesc.innerText = `Queued for admin on-chain transfer to your BEP20 wallet (${activeW.account_number ? activeW.account_number.substring(0, 8) + '...' : ''}). Status: ${activeW.status.toUpperCase()}.`;
      }
    } else {
      if (pendingBanner) pendingBanner.style.display = 'none';
    }

    // 7. Unified Ledger: Fetch transactions & withdrawals
    const { data: transactions } = await supabaseClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const listContainer = document.getElementById('wallet-transactions-list');
    if (!listContainer) return;

    if (!transactions || transactions.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state" style="padding:40px 20px; text-align:center; background:#121622; border:1px solid rgba(255,255,255,0.08); border-radius:16px;">
          <p class="empty-state-text" style="color:#94a3b8; font-size:13px; margin:0;">No payout records found yet. Bonus credits and auto-withdrawals will appear here.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = '';
    transactions.forEach(tx => {
      let rawAmt = parseFloat(tx.amount || 0);
      const isPositive = rawAmt >= 0;
      let absAmt = Math.abs(rawAmt);

      const row = document.createElement('div');
      row.className = 'timeline-item';
      row.style.background = '#121622';
      row.style.border = '1px solid rgba(255,255,255,0.08)';
      row.style.borderRadius = '14px';
      row.style.padding = '12px 14px';
      row.style.marginBottom = '10px';
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';

      row.innerHTML = `
        <div class="timeline-info" style="max-width:70%;">
          <span class="timeline-title" style="font-weight:800; color:#ffffff; font-size:13px; display:block; margin-bottom:2px; word-break:break-word;">
            ${tx.description || 'Auto Refund & Bonus'}
          </span>
          <span class="timeline-date" style="font-size:10.5px; color:#94a3b8;">${new Date(tx.created_at).toLocaleString('en-US')}</span>
        </div>
        <div style="text-align:right;">
          <span class="timeline-amount" style="font-weight:900; font-size:14px; color:${isPositive ? '#00e676' : '#00e5ff'}; display:block;">
            ${isPositive ? '+' : '-'}$${absAmt.toFixed(2)} USDT
          </span>
          <span style="font-size:10px; font-weight:800; color:${isPositive ? '#00e676' : '#f0b90b'}; text-transform:uppercase;">
            ${tx.type === 'withdrawal' ? 'Auto Payout' : 'Credit'}
          </span>
        </div>
      `;
      listContainer.appendChild(row);
    });

  } catch (err) {
    console.error("Wallet loader notice:", err);
  }
}

// Global Window Exports
window.loadWalletData = loadWalletData;
