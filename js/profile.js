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
  if (btnReferred) btnReferred.addEventListener('click', openReferredUsersModal);
  if (btnHelp) btnHelp.addEventListener('click', () => {
    if (typeof toggleSupportChatModal === 'function') {
      toggleSupportChatModal();
    } else {
      openLegalModal('হেল্প ও সাপোর্ট চ্যানেল', getHelpContent());
    }
  });
  if (btnTerms) btnTerms.addEventListener('click', () => openLegalModal('নিয়মাবলী ও নির্দেশিকা', getTermsContent()));
}

async function loadProfileData() {
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
      const inviteLink = `${window.location.origin}${baseDir}/register.html?ref=${refCode}`;
      newBtn.addEventListener('click', (e) => copyToClipboard(inviteLink, e.target));
    }

  } catch (err) {
    console.error("Profile load error:", err);
    showToast("Failed to fetch profile.", "error");
  }
}

// Submissions History dialog drawer
async function openSubmissionsHistoryModal() {
  if (!supabaseClient) return;
  showSpinner(true);

  try {
    const { data: submissions, error } = await supabaseClient
      .from('task_submissions')
      .select('*, tasks(title)')
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    const modalTitle = 'আমার সাবমিশন হিস্ট্রি';
    let htmlContent = `<div class="timeline-list">`;

    if (submissions.length === 0) {
      htmlContent += `
        <div class="empty-state" style="padding: 30px 0;">
          <p class="empty-state-text" style="font-size: 13px; color: var(--text-muted);">আপনি এখনও কোনো টাস্ক সাবমিট করেননি।</p>
        </div>
      `;
    } else {
      submissions.forEach(sub => {
        const dateStr = new Date(sub.submitted_at).toLocaleDateString('bn-BD');
        
        let statusBadge = '';
        if (sub.status === 'pending') {
          statusBadge = `<span class="badge pending">ভেরিফাই চলছে</span>`;
        } else if (sub.status === 'refund_pending') {
          statusBadge = `<span class="badge processing">রিফান্ড পেন্ডিং</span>`;
        } else if (sub.status === 'refunded') {
          statusBadge = `<span class="badge active">সম্পন্ন হয়েছে ✓</span>`;
        } else if (sub.status === 'rejected') {
          statusBadge = `<span class="badge rejected">রিজেক্ট হয়েছে ✕</span>`;
        }

        htmlContent += `
          <div class="admin-list-item" style="margin-bottom:12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px;">
            <div class="admin-list-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span class="admin-list-title" style="font-weight:700; color:#fff;">${sub.tasks?.title || 'ক্যাশব্যাক টাস্ক'}</span>
              ${statusBadge}
            </div>
            <div class="admin-list-details" style="display:grid; gap:4px; font-size:12.5px; color:var(--text-secondary);">
              <div><strong>ট্রানজেকশন আইডি (TrxID):</strong> <span style="font-family:monospace; color:#fff;">${sub.transaction_id}</span></div>
              <div><strong>পাঠানো পরিমাণ:</strong> ৳${parseFloat(sub.amount).toFixed(0)}</div>
              <div><strong>জমা দেওয়ার তারিখ:</strong> ${dateStr}</div>
              ${sub.admin_note ? `<div style="color: var(--accent-red)"><strong>কারণ:</strong> ${sub.admin_note}</div>` : ''}
            </div>
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
    <p><strong>যেকোনো সাহায্যের জন্য:</strong></p>
    <p>টাস্ক ভেরিফিকেশন, পেন্ডিং পেমেন্ট, রিফান্ড পেতে দেরি হওয়া অথবা উইথড্র সংক্রান্ত যেকোনো সমস্যার জন্য সরাসরি আমাদের অফিসিয়াল টেলিগ্রাম সাপোর্ট চ্যানেলে যোগাযোগ করুন।</p>
    
    <a href="https://t.me/devpaysupport" target="_blank" 
      style="display: block; text-align: center; background: linear-gradient(135deg, #0088cc 0%, #00a2ed 100%); color: #fff; font-size: 15px; font-weight: 800; border: none; border-radius: 12px; padding: 14px; margin: 18px 0; text-decoration: none; box-shadow: 0 4px 12px rgba(0,136,204,0.3);">
      💬 @devpaysupport — টেলিগ্রাম সাপোর্ট
    </a>

    <p style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">দ্রষ্টব্য: কথা বলার সময় আপনার ট্রানজেকশন আইডি (TrxID) এবং পেমেন্ট করার তথ্য সাথে রাখুন।</p>
  `;
}

// Terms content generator
function getTermsContent() {
  return `
    <p><strong>অ্যাপ ব্যবহারের নিয়ম ও নির্দেশিকা:</strong></p>
    <ul style="padding-left: 18px; display: flex; flex-direction: column; gap: 8px;">
      <li>প্রতিটি পেমেন্ট ম্যানুয়ালি চেক করা হয়। কোনো অটোমেটিক স্ক্যান হয় না, তাই সঠিক ট্রানজেকশন আইডি (TrxID) প্রদান করুন।</li>
      <li>পেমেন্ট ভেরিফিকেশন সম্পন্ন হতে সাধারণত ১০ থেকে ৩০ মিনিট সময় লাগতে পারে।</li>
      <li>রিফান্ড সরাসরি আপনার পাঠানো বিকাশ বা নগদ মোবাইল নম্বরে ফেরত পাঠানো হবে।</li>
      <li>এডমিন রিফান্ড সম্পন্ন করার পর বোনাসের টাকা সরাসরি আপনার ওয়ালেটে যোগ হবে।</li>
      <li>ওয়ালেট থেকে সর্বনিম্ন ১০০ টাকা উইথড্র করতে পারবেন।</li>
      <li>যেকোনো ফেক TrxID বা প্রতারণার চেষ্টা করা হলে আপনার অ্যাকাউন্টটি চিরদিনের জন্য সাসপেন্ড করা হবে।</li>
    </ul>
  `;
}

// Open Referred Users Modal
async function openReferredUsersModal() {
  if (!supabaseClient) return;
  showSpinner(true);

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('লগইন করা নেই');

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
    const inviteLink = `${window.location.origin}${baseDir}/register.html?ref=${refCode}`;

    const modalTitle = '👥 রেফারেল ও টিম সেন্টার';
    
    let htmlContent = `
      <!-- Stats Dashboard Grid -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 18px;">
        <div style="background: rgba(0,230,118,0.04); border: 1px solid rgba(0,230,118,0.15); border-radius: 12px; padding: 14px 8px; text-align: center;">
          <p style="font-size: 22px; font-weight: 800; color: var(--accent-green); margin: 0; line-height: 1;">${totalReferrals}</p>
          <p style="font-size: 10px; color: var(--text-secondary); margin: 6px 0 0 0; font-weight: 600;">মোট রেফার</p>
        </div>
        <div style="background: rgba(0,229,255,0.04); border: 1px solid rgba(0,229,255,0.15); border-radius: 12px; padding: 14px 8px; text-align: center;">
          <p style="font-size: 22px; font-weight: 800; color: var(--accent-cyan); margin: 0; line-height: 1;">৳${totalReferralBonus.toFixed(0)}</p>
          <p style="font-size: 10px; color: var(--text-secondary); margin: 6px 0 0 0; font-weight: 600;">মোট কমিশন</p>
        </div>
        <div style="background: rgba(255,171,0,0.04); border: 1px solid rgba(255,171,0,0.15); border-radius: 12px; padding: 14px 8px; text-align: center;">
          <p style="font-size: 22px; font-weight: 800; color: var(--accent-orange); margin: 0; line-height: 1;">${totalTeamTasks}</p>
          <p style="font-size: 10px; color: var(--text-secondary); margin: 6px 0 0 0; font-weight: 600;">মোট টিম টাস্ক</p>
        </div>
      </div>

      <!-- Commission Rules -->
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; margin-bottom: 18px; font-size: 12.5px; line-height: 1.5; color: var(--text-secondary);">
        📢 <strong>কমিশন নিয়ম:</strong> আপনার রেফারেলে কেউ জয়েন করে প্রতি ১০টি টাস্ক সফলভাবে সম্পন্ন করলে আপনি পাবেন <strong>৳১০০ বোনাস</strong> (সর্বোচ্চ বোনাস সীমা: ৳২০,০০০)।
      </div>

      <!-- Referral Link Sharing Card -->
      <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 16px; padding: 14px; margin-bottom: 18px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; letter-spacing: 0.5px;">রেফারেল লিংক শেয়ার করুন</span>
          <button onclick="copyToClipboard('${inviteLink}', this)" 
            style="background: var(--accent-green)18; color: var(--accent-green); border: 1px solid var(--accent-green)30; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer;">
            কপি লিংক
          </button>
        </div>
        <p style="font-family: monospace; font-size: 12.5px; color: var(--text-secondary); margin: 0; word-break: break-all; background: rgba(0,0,0,0.25); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">${inviteLink}</p>
      </div>

      <!-- Team list -->
      <p style="font-size: 13.5px; font-weight: 800; color: #fff; margin: 0 0 10px 0;">👥 আমার টিম মেম্বারদের তালিকা</p>
      <div class="timeline-list" style="display: flex; flex-direction: column; gap: 10px; max-height: 200px; overflow-y: auto; padding-right: 4px;">
    `;

    if (!referredUsers || referredUsers.length === 0) {
      htmlContent += `
        <div class="empty-state" style="padding: 30px 0;">
          <p class="empty-state-text" style="font-size: 13px; color: var(--text-muted); margin: 0;">আপনার রেফারেলে এখনও কেউ জয়েন করেনি।</p>
        </div>
      `;
    } else {
      referredUsers.forEach(ref => {
        const dateStr = new Date(ref.created_at).toLocaleDateString('bn-BD');
        const completedTasks = (ref.task_submissions || []).filter(sub => sub.status === 'refunded').length;
        
        // Mask phone number for privacy
        const rawNum = ref.phone || '01XXXXXXXXX';
        const maskedNum = rawNum.length >= 11 
          ? `${rawNum.substring(0, 3)}***${rawNum.substring(7)}` 
          : '017***XXXXX';

        // Calculate next milestone progress
        const nextMilestone = Math.ceil((completedTasks + 1) / 10) * 10;
        const tasksNeeded = nextMilestone - completedTasks;

        htmlContent += `
          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 700; color: #fff; font-size: 14px;">${ref.full_name || 'টিম মেম্বার'}</span>
              <span style="font-size: 11px; color: var(--text-muted);">${dateStr} এ জয়েন করেছেন</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--text-secondary);">
              <div>মোবাইল: <span style="font-family: monospace; color: #fff;">${maskedNum}</span></div>
              <div style="background: rgba(0,230,118,0.1); border: 1px solid rgba(0,230,118,0.25); border-radius: 6px; padding: 2px 8px; color: var(--accent-green); font-weight: 700; font-size: 11.5px;">
                টাস্ক সম্পন্ন: ${completedTasks}টি
              </div>
            </div>

            <div style="height: 1px; background: rgba(255,255,255,0.05); margin: 4px 0;"></div>
            <p style="font-size: 11.5px; color: var(--text-muted); margin: 0; line-height: 1.4;">
              💡 পরবর্তী ৳১০০ বোনাস পেতে এই ইউজারের আর <span style="color: var(--accent-cyan); font-weight: 700;">${tasksNeeded}টি</span> টাস্ক সম্পন্ন হতে হবে।
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
