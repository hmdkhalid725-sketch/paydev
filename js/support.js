// ====================================================
// LIVE SUPPORT CHAT MODULE (USER SIDE)
// ====================================================

let supportPollingInterval = null;
let currentChatUserId = null;

document.addEventListener('DOMContentLoaded', () => {
  // Start background polling for unread support messages after delay
  setTimeout(initSupportChat, 1500);
});

async function initSupportChat() {
  if (!supabaseClient) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
      currentChatUserId = user.id;
      checkUnreadSupportMessages();
      // Poll every 4 seconds for new replies
      if (!supportPollingInterval) {
        supportPollingInterval = setInterval(checkUnreadSupportMessages, 4000);
      }
    }
  } catch (err) {
    console.error("Support chat init error:", err);
  }
}

function toggleSupportChatModal() {
  if (typeof switchTab === 'function') switchTab('support');
  loadSupportMessages();
}

function openSupportChatModal() {
  if (typeof switchTab === 'function') switchTab('support');
  loadSupportMessages();
}

function closeSupportChatModal() {
  if (typeof switchTab === 'function') switchTab('home');
}

async function loadSupportMessages() {
  if (!supabaseClient || !currentChatUserId) return;

  const container = document.getElementById('support-chat-messages');
  if (!container) return;

  try {
    const { data: msgs, error } = await supabaseClient
      .from('support_messages')
      .select('*')
      .eq('user_id', currentChatUserId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    renderUserSupportChat(msgs || []);

    // Mark admin messages as read
    await supabaseClient
      .from('support_messages')
      .update({ is_read: true })
      .eq('user_id', currentChatUserId)
      .eq('sender_type', 'admin')
      .eq('is_read', false);

    const badge = document.getElementById('support-unread-badge');
    if (badge) badge.style.display = 'none';

  } catch (err) {
    console.error("Error loading support messages:", err);
  }
}

let pendingSupportImageBase64 = null;

function handleSupportImageSelect(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const maxDim = 1000;
      
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      pendingSupportImageBase64 = canvas.toDataURL('image/jpeg', 0.75);
      
      const wrap = document.getElementById('support-image-preview-wrap');
      const previewImg = document.getElementById('support-image-preview-img');
      if (wrap && previewImg) {
        previewImg.src = pendingSupportImageBase64;
        wrap.style.display = 'flex';
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeSupportImageAttachment() {
  pendingSupportImageBase64 = null;
  const wrap = document.getElementById('support-image-preview-wrap');
  const fileInput = document.getElementById('support-file-input');
  if (wrap) wrap.style.display = 'none';
  if (fileInput) fileInput.value = '';
}

function openSupportLightbox(src) {
  let lightbox = document.getElementById('support-lightbox-overlay');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'support-lightbox-overlay';
    lightbox.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.92); z-index:99999; display:flex; align-items:center; justify-content:center; padding:16px; cursor:zoom-out;';
    lightbox.onclick = function() { lightbox.style.display = 'none'; };
    lightbox.innerHTML = `<img id="support-lightbox-img" src="" style="max-width:95%; max-height:90vh; border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,0.8); object-fit:contain;">`;
    document.body.appendChild(lightbox);
  }
  document.getElementById('support-lightbox-img').src = src;
  lightbox.style.display = 'flex';
}

function insertSupportInquiry(text) {
  const input = document.getElementById('support-msg-input');
  if (input) {
    input.value = text;
    input.focus();
  }
}
window.insertSupportInquiry = insertSupportInquiry;

function renderUserSupportChat(msgs) {
  const container = document.getElementById('support-chat-messages');
  if (!container) return;

  let sessionBanner = `
    <div style="background:rgba(0, 229, 255, 0.05); border:1px solid rgba(0,229,255,0.18); border-radius:14px; padding:10px 12px; margin-bottom:12px; text-align:center;">
      <div style="font-size:11px; font-weight:800; color:#00e5ff; display:flex; align-items:center; justify-content:center; gap:6px; margin-bottom:2px;">
        <span style="width:6px; height:6px; border-radius:50%; background:#00e676; box-shadow:0 0 6px #00e676;"></span>
        <span>US Link VIP Concierge Channel Active</span>
      </div>
      <p style="font-size:10.5px; color:#64748b; margin:0; line-height:1.4;">
        256-bit encrypted direct communication with senior verification desk.
      </p>
    </div>
  `;

  if (msgs.length === 0) {
    container.innerHTML = `
      ${sessionBanner}
      <!-- Automated Senior Concierge Welcome Greeting -->
      <div style="align-self: flex-start; max-width: 88%; background: #131724; border: 1px solid rgba(0, 229, 255, 0.25); color: #fff; padding: 13px 15px; border-radius: 18px 18px 18px 2px; font-size: 12.5px; line-height: 1.5; box-shadow: 0 4px 16px rgba(0,0,0,0.5);">
        <div style="font-size: 10.5px; font-weight: 800; color: #00e5ff; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#00e5ff"><circle cx="12" cy="12" r="10"/></svg>
          <span>Senior Helpdesk Concierge #104</span>
        </div>
        <div style="color: #e2e8f0;">
          Welcome to <strong>US Link Priority Support</strong>! If you have submitted a BEP20 deposit, need faster verification, or have questions regarding cashback payouts, please share your details or screenshot below.
        </div>
        <div style="font-size: 9.5px; color: #64748b; text-align: right; margin-top: 6px;">Just now</div>
      </div>
    `;
    return;
  }

  let html = sessionBanner;

  msgs.forEach(m => {
    const isUser = m.sender_type === 'user';
    const timeStr = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const imgMarkup = m.image_url ? `<div style="margin-top:8px;"><img src="${m.image_url}" onclick="openSupportLightbox('${m.image_url}')" style="max-width:100%; max-height:190px; border-radius:10px; border:1px solid rgba(255,255,255,0.2); cursor:pointer; display:block; box-shadow:0 4px 12px rgba(0,0,0,0.4);"></div>` : '';

    if (isUser) {
      html += `
        <div style="align-self: flex-end; max-width: 84%; background: linear-gradient(135deg, #00c853 0%, #00e676 100%); color: #000000; font-weight: 700; padding: 11px 15px; border-radius: 18px 18px 2px 18px; font-size: 13px; line-height: 1.45; box-shadow: 0 4px 14px rgba(0,230,118,0.3); position: relative;">
          ${m.message ? `<div>${escapeHtml(m.message)}</div>` : ''}
          ${imgMarkup}
          <div style="font-size: 9.5px; color: rgba(0,0,0,0.65); text-align: right; margin-top: 4px; font-weight: 800;">${timeStr} ✓✓</div>
        </div>
      `;
    } else {
      html += `
        <div style="align-self: flex-start; max-width: 86%; background: #131724; border: 1px solid rgba(0, 229, 255, 0.28); color: #fff; padding: 12px 15px; border-radius: 18px 18px 18px 2px; font-size: 13px; line-height: 1.45; box-shadow: 0 4px 16px rgba(0,0,0,0.45); position: relative;">
          <div style="font-size: 10px; font-weight: 800; color: #00e5ff; margin-bottom: 5px; display: flex; align-items: center; gap: 5px;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#00e5ff"><circle cx="12" cy="12" r="10"/></svg>
            <span>Senior Helpdesk Agent</span>
          </div>
          ${m.message ? `<div style="color:#e2e8f0;">${escapeHtml(m.message)}</div>` : ''}
          ${imgMarkup}
          <div style="font-size: 9.5px; color: #64748b; text-align: right; margin-top: 5px;">${timeStr}</div>
        </div>
      `;
    }
  });

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

async function sendSupportMessage() {
  if (!supabaseClient) return;

  const input = document.getElementById('support-msg-input');
  if (!input) return;

  const text = input.value.trim();
  const imgUrlToSend = pendingSupportImageBase64;

  if (!text && !imgUrlToSend) return;

  if (!currentChatUserId) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) currentChatUserId = user.id;
    else {
      showToast("Please sign in to send a support message.", "error");
      return;
    }
  }

  input.value = '';
  removeSupportImageAttachment();

  try {
    const { error } = await supabaseClient
      .from('support_messages')
      .insert({
        user_id: currentChatUserId,
        sender_type: 'user',
        message: text || 'Photo Attachment',
        image_url: imgUrlToSend
      });

    if (error) throw error;

    loadSupportMessages();

  } catch (err) {
    console.error("Error sending support message:", err);
    showToast("Failed to send message.", "error");
  }
}

async function checkUnreadSupportMessages() {
  if (!supabaseClient || !currentChatUserId) return;

  try {
    const { data: msgs, error } = await supabaseClient
      .from('support_messages')
      .select('id, is_read, sender_type')
      .eq('user_id', currentChatUserId)
      .eq('sender_type', 'admin')
      .eq('is_read', false);

    if (error) return;

    const unreadCount = msgs ? msgs.length : 0;
    const badge = document.getElementById('support-unread-badge');
    if (badge) {
      if (unreadCount > 0) {
        badge.innerText = unreadCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }

    const modal = document.getElementById('modal-live-support');
    if (modal && modal.classList.contains('active')) {
      loadSupportMessages();
    }
  } catch (err) {
    // silent catch
  }
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.toggleSupportChatModal = toggleSupportChatModal;
window.openSupportChatModal = openSupportChatModal;
window.closeSupportChatModal = closeSupportChatModal;
window.sendSupportMessage = sendSupportMessage;
window.loadSupportMessages = loadSupportMessages;
window.handleSupportImageSelect = handleSupportImageSelect;
window.removeSupportImageAttachment = removeSupportImageAttachment;
window.openSupportLightbox = openSupportLightbox;
