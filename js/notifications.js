// ====================================================
// NOTIFICATION & TOAST CONTROLLER
// ====================================================

// In-app toast popups
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  
  container.appendChild(toast);

  // Auto remove after 3.5s
  setTimeout(() => {
    toast.style.animation = 'none';
    toast.offsetHeight; // trigger reflow
    toast.style.animation = 'toast-in 0.2s reverse forwards';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

function createToastContainer() {
  const div = document.createElement('div');
  div.id = 'toast-container';
  document.getElementById('app-container').appendChild(div);
  return div;
}

// Database In-App Notifications Drawer Manager
async function loadNotifications() {
  if (!supabaseClient) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // Fetch notifications
    const { data: notifications, error } = await supabaseClient
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    const listContainer = document.getElementById('notifications-list');
    const badgeDot = document.getElementById('notification-badge-dot');
    
    if (!listContainer) return;
    listContainer.innerHTML = '';

    // Count unread
    const unreadCount = notifications.filter(n => !n.is_read).length;
    if (badgeDot) {
      badgeDot.classList.toggle('hidden', unreadCount === 0);
    }

    if (notifications.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <svg class="empty-state-icon" viewBox="0 0 24 24">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
          </svg>
          <p class="empty-state-text">No notifications yet.</p>
        </div>
      `;
      return;
    }

    notifications.forEach((item) => {
      const card = document.createElement('div');
      card.className = `notification-card ${item.is_read ? '' : 'unread'}`;
      card.innerHTML = `
        <h4 class="notification-card-title">${item.title}</h4>
        <p class="notification-card-body">${item.message}</p>
        <span class="notification-card-time">${new Date(item.created_at).toLocaleString()}</span>
      `;
      listContainer.appendChild(card);
    });

  } catch (err) {
    console.error("Failed to load notifications:", err);
  }
}

// Mark all visible notifications as read
async function markAllNotificationsRead() {
  if (!supabaseClient) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { error } = await supabaseClient
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) throw error;
    
    // Refresh count UI
    const badgeDot = document.getElementById('notification-badge-dot');
    if (badgeDot) badgeDot.classList.add('hidden');

  } catch (err) {
    console.error("Failed to mark notifications read:", err);
  }
}

// Setup real-time listeners for notifications
function listenNotifications() {
  if (!supabaseClient) return;

  supabaseClient.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;

    supabaseClient
      .channel('notifications_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log('[Realtime Notification]', payload.new);
          showToast(`${payload.new.title}: ${payload.new.message}`, 'info');
          loadNotifications();
        }
      )
      .subscribe();
  });
}
