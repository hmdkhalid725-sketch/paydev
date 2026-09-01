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
  const modal = document.getElementById('modal-live-support');
  if (!modal) return;

  if (modal.classList.contains('active')) {
    modal.classList.remove('active');
  } else {
    modal.classList.add('active');
    loadSupportMessages();
  }
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

function renderUserSupportChat(msgs) {
  const container = document.getElementById('support-chat-messages');
  if (!container) return;

  if (msgs.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); font-size: 11.5px; margin: 30px 0;">
        <div style="font-size: 32px; margin-bottom: 8px;">🎧</div>
        <p style="color: #fff; font-weight: 700; margin: 0 0 4px 0;">আপনার যেকোনো প্রশ্ন বা সমস্যা লিখুন!</p>
        <p style="margin: 0; color: var(--text-secondary);">আমাদের কাস্টমার সাপোর্ট টিম সরাসরি আপনাকে সাহায্য করবে।</p>
      </div>`;
    return;
  }

  let html = `
    <div style="text-align: center; color: var(--text-muted); font-size: 10.5px; margin: 4px 0 10px 0;">
      🔒 চ্যাট সিকিউর ও এনক্রিপ্টেড
    </div>
  `;

  msgs.forEach(m => {
    const isUser = m.sender_type === 'user';
    const timeStr = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const imgMarkup = m.image_url ? `<div style="margin-top:6px;"><img src="${m.image_url}" onclick="openSupportLightbox('${m.image_url}')" style="max-width:100%; max-height:180px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); cursor:pointer; display:block;"></div>` : '';

    if (isUser) {
      html += `
        <div style="align-self: flex-end; max-width: 82%; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #fff; padding: 10px 14px; border-radius: 16px 16px 2px 16px; font-size: 13px; line-height: 1.45; box-shadow: 0 2px 8px rgba(16,185,129,0.25); position: relative;">
          ${m.message ? `<div>${escapeHtml(m.message)}</div>` : ''}
          ${imgMarkup}
          <div style="font-size: 9.5px; color: rgba(255,255,255,0.7); text-align: right; margin-top: 3px;">${timeStr} ✓</div>
        </div>
      `;
    } else {
      html += `
        <div style="align-self: flex-start; max-width: 85%; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1.5px solid rgba(0, 229, 255, 0.3); color: #fff; padding: 10px 14px; border-radius: 16px 16px 16px 2px; font-size: 13px; line-height: 1.45; box-shadow: 0 3px 12px rgba(0,0,0,0.3); position: relative;">
          <div style="font-size: 10px; font-weight: 800; color: var(--accent-cyan); margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">
            <span>👨‍💼 এডমিন হেল্পডেস্ক</span>
          </div>
          ${m.message ? `<div>${escapeHtml(m.message)}</div>` : ''}
          ${imgMarkup}
          <div style="font-size: 9.5px; color: var(--text-muted); text-align: right; margin-top: 3px;">${timeStr}</div>
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
      showToast("দয়া করে লগইন করে সাপোর্ট মেসেজ পাঠান।", "error");
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
        message: text || '📸 ফটো',
        image_url: imgUrlToSend
      });

    if (error) throw error;

    loadSupportMessages();

  } catch (err) {
    console.error("Error sending support message:", err);
    showToast("মেসেজ পাঠানো ব্যর্থ হয়েছে।", "error");
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
window.sendSupportMessage = sendSupportMessage;
window.loadSupportMessages = loadSupportMessages;
window.handleSupportImageSelect = handleSupportImageSelect;
window.removeSupportImageAttachment = removeSupportImageAttachment;
window.openSupportLightbox = openSupportLightbox;
