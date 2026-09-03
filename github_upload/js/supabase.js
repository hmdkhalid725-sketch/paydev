// ====================================================
// SUPABASE CLIENT INITIALIZATION & HELPER METHODS
// ====================================================

// Default placeholders - User can edit these directly or supply via setup overlay
const DEFAULT_SUPABASE_URL = "https://zfngidcsyvrtkfwyench.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmbmdpZGNzeXZydGtmd3llbmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MzY2NTgsImV4cCI6MjEwMzUxMjY1OH0.SwoA8AuBLro63ditNmGYTSTXFX7C0Q-xGQY5Syb1yxo";

let supabaseUrl = DEFAULT_SUPABASE_URL;
let supabaseAnonKey = DEFAULT_SUPABASE_ANON_KEY;

// Fallback to localStorage if placeholders are not replaced
if (supabaseUrl === "YOUR_SUPABASE_PROJECT_URL" || supabaseAnonKey === "YOUR_SUPABASE_ANON_KEY") {
  supabaseUrl = localStorage.getItem('SUPABASE_URL') || DEFAULT_SUPABASE_URL;
  supabaseAnonKey = localStorage.getItem('SUPABASE_ANON_KEY') || DEFAULT_SUPABASE_ANON_KEY;
}

let supabaseClient = null;

// Initialize Supabase client
try {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);
  } else if (window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  }
} catch (err) {
  console.error("Failed to initialize Supabase client:", err);
}

// Ensure global exposure across all scopes & scripts
if (typeof window !== 'undefined') {
  window.supabaseClient = supabaseClient;
  window.supabase_client = supabaseClient;
}

function injectCredentialModal() {
  // Prevent duplicate modals
  if (document.getElementById('supabase-setup-modal')) return;

  const style = document.createElement('style');
  style.id = 'supabase-setup-style';
  style.innerHTML = `
    .setup-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(8, 9, 13, 0.95);
      z-index: 99999;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
      font-family: sans-serif;
    }
    .setup-modal {
      background: #11141b;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 24px;
      width: 100%;
      max-width: 440px;
      color: #fff;
    }
    .setup-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #00e676 0%, #00e5ff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .setup-desc {
      font-size: 13px;
      color: #a0a5b5;
      margin-bottom: 20px;
      line-height: 1.4;
    }
    .setup-form-group {
      margin-bottom: 16px;
    }
    .setup-label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      color: #a0a5b5;
      margin-bottom: 6px;
      font-weight: 600;
    }
    .setup-input {
      width: 100%;
      background: #08090d;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 12px 14px;
      color: #fff;
      font-size: 14px;
    }
    .setup-input:focus {
      outline: none;
      border-color: #00e5ff;
    }
    .setup-btn {
      width: 100%;
      background: linear-gradient(135deg, #00e676 0%, #00b0ff 100%);
      color: #000;
      font-weight: 700;
      border: none;
      padding: 14px;
      border-radius: 8px;
      cursor: pointer;
      margin-top: 8px;
      font-size: 15px;
    }
  `;
  document.head.appendChild(style);

  const modalHtml = `
    <div class="setup-modal-overlay" id="supabase-setup-modal">
      <div class="setup-modal">
        <h3 class="setup-title">Supabase Credentials Needed</h3>
        <p class="setup-desc">Provide your Supabase URL & Anon Key to connect the frontend web app to your database instance securely.</p>
        <div class="setup-form-group">
          <label class="setup-label">Supabase URL</label>
          <input type="text" id="setup-url" class="setup-input" placeholder="https://xxxxxx.supabase.co">
        </div>
        <div class="setup-form-group">
          <label class="setup-label">Supabase Anon Key</label>
          <input type="text" id="setup-key" class="setup-input" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...">
        </div>
        <button id="setup-submit-btn" class="setup-btn">Connect Project</button>
      </div>
    </div>
  `;

  const div = document.createElement('div');
  div.innerHTML = modalHtml;
  document.body.appendChild(div.firstElementChild);

  document.getElementById('setup-submit-btn').addEventListener('click', () => {
    const url = document.getElementById('setup-url').value.trim();
    const key = document.getElementById('setup-key').value.trim();

    if (!url || !key) {
      alert("Both URL and Key are required.");
      return;
    }

    localStorage.setItem('SUPABASE_URL', url);
    localStorage.setItem('SUPABASE_ANON_KEY', key);
    alert("Credentials saved! Reloading application...");
    window.location.reload();
  });
}
