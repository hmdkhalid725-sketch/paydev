// ====================================================
// PROFILE TAB & HISTORY/LEGAL MODAL CONTROLLER
// ====================================================

document.addEventListener('DOMContentLoaded', () => {
  setupProfileMenuActions();
});

function setupProfileMenuActions() {
  const btnHistory = document.getElementById('menu-task-history');
  const btnReferred = document.getElementById('menu-referred-users');
  const btnHelp = document.getElementById('menu-help');
  const btnTerms = document.getElementById('menu-terms');

  if (btnHistory) btnHistory.addEventListener('click', openSubmissionsHistoryModal);
  if (btnReferred) btnReferred.addEventListener('click', () => {
    if (typeof switchTab === 'function') switchTab('referral');
  });
  if (btnHelp) btnHelp.addEventListener('click', () => {
    if (typeof switchTab === 'function') switchTab('support');
  });
  if (btnTerms) btnTerms.addEventListener('click', openTermsSubView);
}

function backToProfileMainView() {
  const mainView = document.getElementById('profile-main-view');
  const historyView = document.getElementById('profile-history-full-view');
  const termsView = document.getElementById('profile-terms-full-view');

  if (mainView) mainView.style.display = 'block';
  if (historyView) historyView.style.display = 'none';
  if (termsView) termsView.style.display = 'none';

  window.scrollTo(0, 0);
  const mainApp = document.querySelector('.app-main');
  if (mainApp) mainApp.scrollTop = 0;
}

function openTermsSubView() {
  const mainView = document.getElementById('profile-main-view');
  const historyView = document.getElementById('profile-history-full-view');
  const termsView = document.getElementById('profile-terms-full-view');

  if (mainView) mainView.style.display = 'none';
  if (historyView) historyView.style.display = 'none';
  if (termsView) termsView.style.display = 'block';

  window.scrollTo(0, 0);
  const mainApp = document.querySelector('.app-main');
  if (mainApp) mainApp.scrollTop = 0;
}

async function loadProfileData() {
  const historyView = document.getElementById('profile-history-full-view');
  const termsView = document.getElementById('profile-terms-full-view');

  // Only reset view if user is not currently viewing history or terms subview
  if (historyView && historyView.style.display !== 'block' && termsView && termsView.style.display !== 'block') {
    const mainView = document.getElementById('profile-main-view');
    if (mainView) mainView.style.display = 'block';
  }

  if (!supabaseClient) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;

    document.getElementById('profile-fullname').innerText = profile.full_name || 'User';
    document.getElementById('profile-phone').innerText = profile.phone || 'No phone set';
    
    const initial = profile.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U';
    document.getElementById('profile-avatar').innerText = initial;

    // Load referral details
    const refCode = profile.referral_code || 'XXXXXX';
    const refCodeEl = document.getElementById('profile-ref-code');
    if (refCodeEl) refCodeEl.innerText = refCode;

    const btnRefCopy = document.getElementById('profile-ref-copy');
    if (btnRefCopy) {
      const newBtn = btnRefCopy.cloneNode(true);
      btnRefCopy.parentNode.replaceChild(newBtn, btnRefCopy);
      newBtn.addEventListener('click', (e) => copyToClipboard(refCode, e.target));
    }

    const btnLinkCopy = document.getElementById('profile-ref-link-copy');
    if (btnLinkCopy) {
      const newBtn = btnLinkCopy.cloneNode(true);
      btnLinkCopy.parentNode.replaceChild(newBtn, btnLinkCopy);
      
      const path = window.location.pathname;
      const baseDir = path.substring(0, path.lastIndexOf('/'));
      const inviteLink = `${window.location.origin}${baseDir}/index.html?ref=${refCode}`;
      newBtn.addEventListener('click', (e) => copyToClipboard(inviteLink, e.target));
    }

    // Load and display Connected BEP20 Receiving / Refund Wallet
    const walletEl = document.getElementById('profile-wallet-address');
    if (walletEl) {
      const savedWallet = profile.wallet_address || localStorage.getItem('user_refund_payout_address');
      if (savedWallet && savedWallet.startsWith('0x') && savedWallet.length >= 40) {
        walletEl.innerText = savedWallet;
        walletEl.style.color = '#00e676';
        localStorage.setItem('user_refund_payout_address', savedWallet);
      } else {
        walletEl.innerText = '⚠️ No receiving wallet connected';
        walletEl.style.color = '#eab308';
      }
    }

  } catch (err) {
    console.error("Profile load error:", err);
    showToast("Failed to fetch profile.", "error");
  }
}

// ── Wallet Management in Profile ──
function copyProfileWallet() {
  const el = document.getElementById('profile-wallet-address');
  if (el && el.innerText && el.innerText.startsWith('0x')) {
    navigator.clipboard.writeText(el.innerText);
    showToast('Receiving Wallet Address copied! ✓', 'success');
  } else {
    openEditWalletModal();
  }
}

async function openEditWalletModal() {
  const current = localStorage.getItem('user_refund_payout_address') || '';
  const newAddr = prompt('Enter your 42-character BEP20 (BSC) USDT receiving wallet address (starts with 0x):', current);
  if (newAddr === null) return;
  const clean = newAddr.trim();
  const isEvm = /^0x[a-fA-F0-9]{40}$/.test(clean);
  if (!isEvm) {
    alert('Invalid BEP20 address! It must start with 0x and be 42 characters long.');
    return;
  }
  
  localStorage.setItem('user_refund_payout_address', clean);
  const el = document.getElementById('profile-wallet-address');
  if (el) {
    el.innerText = clean;
    el.style.color = '#00e676';
  }
  if (typeof userBscAddress !== 'undefined') userBscAddress = clean;
  if (typeof setBscAddressUI === 'function') setBscAddressUI(clean);

  if (supabaseClient) {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (user) {
        await supabaseClient.from('profiles').update({ wallet_address: clean }).eq('id', user.id);
        showToast('BEP20 Receiving Wallet updated & saved to database! ✓', 'success');
      }
    } catch (e) {
      console.error('Save wallet error:', e);
    }
  }
}

function backToProfileMainView() {
  const mainView = document.getElementById('profile-main-view');
  const historyView = document.getElementById('profile-history-full-view');
  const termsView = document.getElementById('profile-terms-full-view');

  if (mainView) mainView.style.display = 'block';
  if (historyView) historyView.style.display = 'none';
  if (termsView) termsView.style.display = 'none';
}

// Submissions History global handler proxy
function openSubmissionsHistoryModal() {
  if (typeof window.openSubmissionsHistoryModal === 'function') {
    window.openSubmissionsHistoryModal();
  }
}

// Dynamic Modal Overlay opening
function openLegalModal(title, html) {
  const modal = document.getElementById('modal-overlay-legal');
  const titleEl = document.getElementById('legal-title');
  const contentEl = document.getElementById('legal-content');

  if (!modal || !titleEl || !contentEl) return;

  titleEl.innerText = title;
  contentEl.innerHTML = html;

  document.getElementById('btn-close-legal').onclick = () => {
    modal.classList.remove('active');
  };

  modal.classList.add('active');
}

// Help content generator
function getHelpContent() {
  return `
    <p><strong>Need Immediate Assistance?</strong></p>
    <p>For deposit verification, pending orders, refund inquiries, or questions about the terminal, please reach out directly through our 24/7 Support Tab or official Telegram channel.</p>
    
    <a href="https://t.me/uslinksupport" target="_blank" 
      style="display: block; text-align: center; background: linear-gradient(135deg, #0088cc 0%, #00a2ed 100%); color: #fff; font-size: 15px; font-weight: 800; border: none; border-radius: 12px; padding: 14px; margin: 18px 0; text-decoration: none; box-shadow: 0 4px 12px rgba(0,136,204,0.3);">
        Telegram Support Channel
    </a>

    <p style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">Note: Please have your Transaction Hash (TxID) and deposit details ready when contacting support.</p>
  `;
}

// Terms content generator
function getTermsContent() {
  return `
    <p><strong>Platform Guidelines & Service Terms:</strong></p>
    <ul style="padding-left: 18px; display: flex; flex-direction: column; gap: 8px;">
      <li>Deposits must be transferred via BEP20 (Binance Smart Chain) to the generated address.</li>
      <li>Each deposit order is verified on-chain. Please ensure exact amounts and correct transaction hashes.</li>
      <li>Principal deposits and 4.1% cashback bonuses are automatically transferred to your connected BEP20 wallet.</li>
      <li>Verifications and automated payouts are processed swiftly upon on-chain blockchain confirmation.</li>
      <li>Minimum automated withdrawal threshold is $3.00 USDT.</li>
      <li>Any fraudulent activity or fake transaction IDs will result in permanent account suspension.</li>
    </ul>
  `;
}

// Open Referred Users Modal
async function openReferredUsersModal() {
  if (!supabaseClient) return;
  showSpinner(true);

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('User not logged in');

    // Fetch referred profiles along with their submissions count
    const { data: referredUsers, error: refErr } = await supabaseClient
      .from('profiles')
      .select(`
        id,
        full_name,
        phone,
        created_at,
        task_submissions(id, status)
      `)
      .eq('referred_by', user.id)
      .order('created_at', { ascending: false });

    if (refErr) throw refErr;

    // Fetch referral bonus transactions
    const { data: bonusTx, error: txErr } = await supabaseClient
      .from('wallet_transactions')
      .select('amount')
      .eq('user_id', user.id)
      .like('description', 'Referral commission milestone%');

    if (txErr) throw txErr;

    const totalReferrals = referredUsers ? referredUsers.length : 0;
    const totalReferralBonus = bonusTx ? bonusTx.reduce((sum, t) => sum + parseFloat(t.amount), 0) : 0;
    const totalTeamTasks = referredUsers ? referredUsers.reduce((sum, u) => {
      const completed = (u.task_submissions || []).filter(s => s.status === 'refunded').length;
      return sum + completed;
    }, 0) : 0;

    // Get current profile invite details to generate link inside modal
    const { data: profile } = await supabaseClient.from('profiles').select('referral_code').eq('id', user.id).single();
    const refCode = profile ? profile.referral_code : 'XXXXXX';
    const path = window.location.pathname;
    const baseDir = path.substring(0, path.lastIndexOf('/'));
    const inviteLink = `${window.location.origin}${baseDir}/index.html?ref=${refCode}`;

    const modalTitle = 'Affiliate & Team Center';
    
    let htmlContent = `
      <!-- Stats Dashboard Grid -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 18px;">
        <div style="background: rgba(0,230,118,0.04); border: 1px solid rgba(0,230,118,0.15); border-radius: 12px; padding: 14px 8px; text-align: center;">
          <p style="font-size: 22px; font-weight: 800; color: var(--accent-green); margin: 0; line-height: 1;">${totalReferrals}</p>
          <p style="font-size: 10px; color: var(--text-secondary); margin: 6px 0 0 0; font-weight: 600;">Total Partners</p>
        </div>
        <div style="background: rgba(0,229,255,0.04); border: 1px solid rgba(0,229,255,0.15); border-radius: 12px; padding: 14px 8px; text-align: center;">
          <p style="font-size: 22px; font-weight: 800; color: var(--accent-cyan); margin: 0; line-height: 1;">$${totalReferralBonus.toFixed(2)}</p>
          <p style="font-size: 10px; color: var(--text-secondary); margin: 6px 0 0 0; font-weight: 600;">Total Bonus</p>
        </div>
        <div style="background: rgba(255,171,0,0.04); border: 1px solid rgba(255,171,0,0.15); border-radius: 12px; padding: 14px 8px; text-align: center;">
          <p style="font-size: 22px; font-weight: 800; color: var(--accent-orange); margin: 0; line-height: 1;">${totalTeamTasks}</p>
          <p style="font-size: 10px; color: var(--text-secondary); margin: 6px 0 0 0; font-weight: 600;">Team Tasks</p>
        </div>
      </div>

      <!-- Commission Rules -->
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; margin-bottom: 18px; font-size: 12.5px; line-height: 1.5; color: var(--text-secondary);">
        <strong>Affiliate Policy:</strong> Earn 1% instant commission on every completed deposit by your invitees, plus a $1.00 reward upon completing 10 tasks!
      </div>

      <!-- Referral Link Sharing Card -->
      <div style="background: #121622; border: 1px solid var(--border-color); border-radius: 16px; padding: 14px; margin-bottom: 18px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; letter-spacing: 0.5px;">Share Referral Link</span>
          <button onclick="copyToClipboard('${inviteLink}', this)" 
            style="background: var(--accent-green)18; color: var(--accent-green); border: 1px solid var(--accent-green)30; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer;">
            Copy Link
          </button>
        </div>
        <p style="font-family: monospace; font-size: 12.5px; color: var(--text-secondary); margin: 0; word-break: break-all; background: rgba(0,0,0,0.25); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">${inviteLink}</p>
      </div>

      <!-- Team list -->
      <p style="font-size: 13.5px; font-weight: 800; color: #fff; margin: 0 0 10px 0;">My Team Members</p>
      <div class="timeline-list" style="display: flex; flex-direction: column; gap: 10px; max-height: 200px; overflow-y: auto; padding-right: 4px;">
    `;

    if (!referredUsers || referredUsers.length === 0) {
      htmlContent += `
        <div class="empty-state" style="padding: 30px 0;">
          <p class="empty-state-text" style="font-size: 13px; color: var(--text-muted); margin: 0;">No partners have joined via your link yet.</p>
        </div>
      `;
    } else {
      referredUsers.forEach(ref => {
        const dateStr = new Date(ref.created_at).toLocaleDateString('en-US');
        const completedTasks = (ref.task_submissions || []).filter(sub => sub.status === 'refunded').length;
        
        // Mask phone number for privacy
        const rawNum = ref.phone || '01XXXXXXXXX';
        const maskedNum = rawNum.length >= 11 
          ? `${rawNum.substring(0, 3)}***${rawNum.substring(7)}` 
          : '017***XXXXX';

        // Calculate next milestone progress (20 tasks = $1.00 USDT)
        const nextMilestone = Math.ceil((completedTasks + 1) / 20) * 20;
        const tasksNeeded = nextMilestone - completedTasks;

        htmlContent += `
          <div style="background: #121622; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 700; color: #fff; font-size: 14px;">${ref.full_name || 'Team Partner'}</span>
              <span style="font-size: 11px; color: var(--text-muted);">Joined: ${dateStr}</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--text-secondary);">
              <div>Account: <span style="font-family: monospace; color: #fff;">${maskedNum}</span></div>
              <div style="background: rgba(0,230,118,0.1); border: 1px solid rgba(0,230,118,0.25); border-radius: 6px; padding: 2px 8px; color: var(--accent-green); font-weight: 700; font-size: 11.5px;">
                Completed Tasks: ${completedTasks} / 20
              </div>
            </div>

            <div style="height: 1px; background: rgba(255,255,255,0.05); margin: 4px 0;"></div>
            <p style="font-size: 11.5px; color: var(--text-muted); margin: 0; line-height: 1.4;">
              ${tasksNeeded} more tasks needed for next $1.00 USDT milestone reward!
            </p>
          </div>
        `;
      });
    }

    htmlContent += `</div>`;
    openLegalModal(modalTitle, htmlContent);

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showSpinner(false);
  }
}

// Full page Referral Tab renderer
async function loadReferralTabData() {
  if (!supabaseClient) return;
  
  const codeEl = document.getElementById('tab-ref-code-text');
  const linkEl = document.getElementById('tab-ref-link-text');
  const countEl = document.getElementById('tab-ref-total-users');
  const bonusEl = document.getElementById('tab-ref-total-bonus');
  const tasksEl = document.getElementById('tab-ref-total-tasks');
  const listEl = document.getElementById('tab-referral-team-list');

  if (!codeEl || !listEl) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // Trigger automated withdrawal evaluation if balance >= $3.00
    try {
      await supabaseClient.rpc('check_and_trigger_auto_withdrawal', { p_user_id: user.id });
    } catch (e) {}

    // Fetch user profile for ref code
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('referral_code')
      .eq('id', user.id)
      .single();

    const refCode = profile ? profile.referral_code || 'XXXXXX' : 'XXXXXX';
    codeEl.innerText = refCode;

    const path = window.location.pathname;
    const baseDir = path.substring(0, path.lastIndexOf('/'));
    const inviteLink = `${window.location.origin}${baseDir}/index.html?ref=${refCode}`;
    linkEl.innerText = inviteLink;

    // Setup copy buttons
    const btnCode = document.getElementById('btn-copy-tab-code');
    if (btnCode) {
      btnCode.onclick = (e) => copyToClipboard(refCode, e.target);
    }
    const btnLink = document.getElementById('btn-copy-tab-link');
    if (btnLink) {
      btnLink.onclick = (e) => copyToClipboard(inviteLink, e.target);
    }

    // Fetch referred profiles
    const { data: referredUsers, error: refErr } = await supabaseClient
      .from('profiles')
      .select(`
        id,
        full_name,
        phone,
        created_at,
        task_submissions(id, status)
      `)
      .eq('referred_by', user.id)
      .order('created_at', { ascending: false });

    if (refErr) throw refErr;

    // Fetch referral bonus transactions
    const { data: bonusTx } = await supabaseClient
      .from('wallet_transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('type', 'bonus');

    const totalCount = referredUsers ? referredUsers.length : 0;
    const totalBonus = bonusTx ? bonusTx.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0) : 0;
    const totalTeamTasks = referredUsers ? referredUsers.reduce((sum, u) => {
      const completed = (u.task_submissions || []).filter(s => s.status === 'refunded').length;
      return sum + completed;
    }, 0) : 0;

    if (countEl) countEl.innerText = `${totalCount}`;
    if (bonusEl) bonusEl.innerText = `$${totalBonus.toFixed(2)}`;
    if (tasksEl) tasksEl.innerText = `${totalTeamTasks}`;

    // Render team list
    if (!referredUsers || referredUsers.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="padding: 40px 20px; text-align: center; background: #121622; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px;">
          <div style="width:48px; height:48px; border-radius:50%; background:rgba(0,229,255,0.08); border:1px solid rgba(0,229,255,0.2); display:flex; align-items:center; justify-content:center; margin:0 auto 12px auto; color:#00e5ff;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <p style="font-size: 13.5px; color: #ffffff; font-weight: 700; margin: 0;">No partners have joined via your link yet.</p>
          <p style="font-size: 11.5px; color: #94a3b8; margin: 6px 0 0 0;">Share your invite link above to start earning lifetime USDT commissions!</p>
        </div>
      `;
    } else {
      let html = '';
      referredUsers.forEach(ref => {
        const dateStr = new Date(ref.created_at).toLocaleDateString('en-US');
        const completedTasks = (ref.task_submissions || []).filter(sub => sub.status === 'refunded').length;
        
        const rawNum = ref.phone || '01XXXXXXXXX';
        const maskedNum = rawNum.length >= 11 
          ? `${rawNum.substring(0, 3)}***${rawNum.substring(7)}` 
          : '017***XXXXX';

        html += `
          <div class="ref-user-card" style="background:#121622; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:38px; height:38px; border-radius:50%; background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border:1.5px solid #00e676; color:#fff; font-weight:900; display:flex; align-items:center; justify-content:center; font-size:15px;">
                  ${(ref.full_name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 style="font-size:14px; font-weight:800; color:#fff; margin:0;">${ref.full_name || 'Team Partner'}</h4>
                  <p style="font-size:11px; color:#94a3b8; margin:2px 0 0 0; font-family:monospace;">${maskedNum}</p>
                </div>
              </div>
              <span style="background:rgba(0, 230, 118, 0.12); color:#00e676; border:1px solid rgba(0, 230, 118, 0.3); font-size:11px; font-weight:800; padding:4px 10px; border-radius:10px;">⚡ ${completedTasks} Tasks</span>
            </div>
            <div style="font-size:11px; color:#94a3b8; border-top:1px solid rgba(255,255,255,0.06); padding-top:8px; display:flex; justify-content:space-between;">
              <span>Joined: ${dateStr}</span>
              <span style="color:#00e5ff; font-weight:700;">Active Partner</span>
            </div>
          </div>
        `;
      });
      listEl.innerHTML = html;
    }

  } catch (err) {
    console.error("Referral tab load error:", err);
  }
}
window.loadReferralTabData = loadReferralTabData;
