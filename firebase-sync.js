/**
 * Fish Farm Pro - Firebase Sync Module
 * เพิ่มไฟล์นี้ก่อน </body> ในไฟล์ index.html หลังจาก Firebase SDK
 */

// ===== Firebase Configuration =====
const FIREBASE_CONFIG_KEY = 'ff_firebase_config';
const LOCAL_ONLY_KEY = 'ff_local_only';

let firebaseApp = null;
let firebaseDb = null;
let isOnline = false;
let isSyncing = false;
let syncListeners = [];

// Data keys to sync
const SYNC_KEYS = [
  'ff_ponds',
  'ff_cycles', 
  'ff_feeds',
  'ff_feed_stock',
  'ff_supplements',
  'ff_medicines',
  'ff_feeding_logs',
  'ff_water_quality',
  'ff_expenses',
  'ff_harvests',
  'ff_mortalities',
  'ff_fish_types'
];

// ===== Firebase Helpers =====
const getFirebaseConfig = () => {
  try {
    const config = localStorage.getItem(FIREBASE_CONFIG_KEY);
    return config ? JSON.parse(config) : null;
  } catch (e) {
    return null;
  }
};

const isLocalOnly = () => localStorage.getItem(LOCAL_ONLY_KEY) === 'true';

const initFirebase = (config) => {
  try {
    if (firebaseApp) return true;
    
    // Validate config
    if (!config.databaseURL) {
      console.error('Firebase config missing databaseURL');
      return false;
    }

    firebaseApp = firebase.initializeApp(config);
    firebaseDb = firebase.database();
    
    // Monitor connection state
    firebaseDb.ref('.info/connected').on('value', (snap) => {
      const wasOnline = isOnline;
      isOnline = snap.val() === true;
      updateSyncStatus();
      
      if (isOnline && !wasOnline) {
        showToast('เชื่อมต่อ Cloud สำเร็จ', 'success');
        // Sync local data to cloud on reconnect
        syncLocalToCloud();
      }
    });

    return true;
  } catch (e) {
    console.error('Firebase init error:', e);
    return false;
  }
};

// ===== Sync Status UI =====
const createSyncStatusUI = () => {
  const existing = document.getElementById('sync-status');
  if (existing) return;

  const indicator = document.createElement('div');
  indicator.id = 'sync-status';
  indicator.className = 'sync-indicator sync-offline';
  indicator.innerHTML = `
    <span id="sync-icon">●</span>
    <span id="sync-text">Offline</span>
  `;
  document.body.appendChild(indicator);

  // Add styles if not exists
  if (!document.getElementById('sync-styles')) {
    const style = document.createElement('style');
    style.id = 'sync-styles';
    style.textContent = `
      .sync-indicator {
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 50;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 9999px;
        font-size: 12px;
        backdrop-filter: blur(8px);
        transition: all 0.3s ease;
      }
      .sync-online { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
      .sync-offline { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
      .sync-syncing { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
      .sync-local { background: rgba(100, 116, 139, 0.2); color: #94a3b8; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .animate-spin { animation: spin 1s linear infinite; display: inline-block; }
    `;
    document.head.appendChild(style);
  }
};

const updateSyncStatus = () => {
  const indicator = document.getElementById('sync-status');
  if (!indicator) return;

  const icon = document.getElementById('sync-icon');
  const text = document.getElementById('sync-text');

  if (isLocalOnly()) {
    indicator.className = 'sync-indicator sync-local';
    icon.textContent = '○';
    text.textContent = 'Local Only';
  } else if (isSyncing) {
    indicator.className = 'sync-indicator sync-syncing';
    icon.innerHTML = '↻';
    icon.className = 'animate-spin';
    text.textContent = 'Syncing...';
  } else if (isOnline) {
    indicator.className = 'sync-indicator sync-online';
    icon.textContent = '●';
    icon.className = '';
    text.textContent = 'Online';
  } else {
    indicator.className = 'sync-indicator sync-offline';
    icon.textContent = '●';
    icon.className = '';
    text.textContent = 'Offline';
  }
};

// ===== Data Sync Functions =====
const syncLocalToCloud = async () => {
  if (!firebaseDb || !isOnline || isLocalOnly()) return;

  isSyncing = true;
  updateSyncStatus();

  try {
    const updates = {};
    
    SYNC_KEYS.forEach(key => {
      const localData = localStorage.getItem(key);
      if (localData) {
        const dbKey = key.replace('ff_', '');
        updates[dbKey] = JSON.parse(localData);
      }
    });

    await firebaseDb.ref().update(updates);
    console.log('Local data synced to cloud');
  } catch (e) {
    console.error('Sync to cloud error:', e);
  }

  isSyncing = false;
  updateSyncStatus();
};

const syncCloudToLocal = async () => {
  if (!firebaseDb || isLocalOnly()) return;

  isSyncing = true;
  updateSyncStatus();

  try {
    const snapshot = await firebaseDb.ref().once('value');
    const cloudData = snapshot.val();

    if (cloudData) {
      SYNC_KEYS.forEach(key => {
        const dbKey = key.replace('ff_', '');
        if (cloudData[dbKey]) {
          localStorage.setItem(key, JSON.stringify(cloudData[dbKey]));
        }
      });
      console.log('Cloud data synced to local');
    }
  } catch (e) {
    console.error('Sync from cloud error:', e);
  }

  isSyncing = false;
  updateSyncStatus();
};

const setupFirebaseListeners = () => {
  if (!firebaseDb || isLocalOnly()) return;

  // Clear existing listeners
  syncListeners.forEach(unsub => unsub());
  syncListeners = [];

  SYNC_KEYS.forEach(key => {
    const dbKey = key.replace('ff_', '');
    const ref = firebaseDb.ref(dbKey);
    
    const listener = ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data !== null) {
        // Compare with local data to avoid unnecessary updates
        const localData = localStorage.getItem(key);
        const cloudDataStr = JSON.stringify(data);
        
        if (localData !== cloudDataStr) {
          localStorage.setItem(key, cloudDataStr);
          // Re-render if app is ready
          if (window.render && window.appReady) {
            window.render();
          }
        }
      }
    });

    syncListeners.push(() => ref.off('value', listener));
  });
};

// ===== Enhanced Storage with Sync =====
const originalStorageSet = window.storage?.set;

const enhanceStorageWithSync = () => {
  if (!window.storage) return;

  const originalSet = window.storage.set;
  
  window.storage.set = (key, data) => {
    // Call original localStorage set
    const result = originalSet.call(window.storage, key, data);
    
    // Sync to Firebase if connected and not local-only
    if (firebaseDb && isOnline && !isLocalOnly() && SYNC_KEYS.includes(key)) {
      const dbKey = key.replace('ff_', '');
      firebaseDb.ref(dbKey).set(data).catch(err => {
        console.error('Firebase sync error:', err);
      });
    }
    
    return result;
  };
};

// ===== Firebase Setup Modal =====
const showFirebaseSetupModal = () => {
  const existingModal = document.getElementById('firebase-setup-modal');
  if (existingModal) {
    existingModal.style.display = 'flex';
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'firebase-setup-modal';
  modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-slate-800 rounded-2xl w-full max-w-md p-6 fade-in max-h-[90vh] overflow-y-auto">
      <div class="text-center mb-6">
        <div class="text-5xl mb-3">🐟☁️</div>
        <h2 class="text-xl font-bold text-cyan-400">ตั้งค่า Firebase</h2>
        <p class="text-slate-400 text-sm mt-2">เพื่อ sync ข้อมูลข้ามอุปกรณ์</p>
      </div>

      <div class="space-y-4">
        <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm">
          <div class="font-semibold text-amber-400 mb-2">📋 วิธีสร้าง Firebase (ฟรี)</div>
          <ol class="text-slate-300 space-y-1 list-decimal list-inside text-xs">
            <li>ไปที่ <a href="https://console.firebase.google.com" target="_blank" class="text-cyan-400 underline">console.firebase.google.com</a></li>
            <li>สร้างโปรเจคใหม่</li>
            <li>ไปที่ Build → Realtime Database → Create Database</li>
            <li>เลือก Start in <strong>test mode</strong></li>
            <li>ไปที่ Project Settings ⚙️ → Your apps → Web</li>
            <li>ลงทะเบียนแอพ แล้ว copy firebaseConfig</li>
          </ol>
        </div>

        <div>
          <label class="block text-sm text-slate-300 mb-2">Firebase Config (JSON)</label>
          <textarea id="firebase-config-input" rows="6" 
            class="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-sm font-mono text-slate-100"
            placeholder='{
  "apiKey": "xxx",
  "databaseURL": "https://xxx.firebaseio.com",
  "projectId": "xxx"
}'></textarea>
        </div>

        <div class="bg-slate-700/50 rounded-xl p-4">
          <label class="block text-sm text-slate-300 mb-2">หรือกรอกแยกทีละช่อง:</label>
          <div class="space-y-2">
            <input type="text" id="fb-apiKey" placeholder="API Key" class="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-sm text-slate-100">
            <input type="text" id="fb-databaseURL" placeholder="Database URL (https://xxx.firebaseio.com)" class="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-sm text-slate-100">
            <input type="text" id="fb-projectId" placeholder="Project ID" class="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-sm text-slate-100">
          </div>
        </div>

        <button onclick="saveFirebaseConfig()" class="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-semibold transition-colors">
          💾 บันทึกและเชื่อมต่อ
        </button>

        <button onclick="useLocalOnly()" class="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl transition-colors text-sm">
          ใช้งานแบบ Offline เท่านั้น (ไม่ sync)
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

const hideFirebaseSetupModal = () => {
  const modal = document.getElementById('firebase-setup-modal');
  if (modal) {
    modal.style.display = 'none';
  }
};

// ===== Global Functions =====
window.saveFirebaseConfig = () => {
  let config = null;

  // Try JSON input first
  const jsonInput = document.getElementById('firebase-config-input')?.value?.trim();
  if (jsonInput) {
    try {
      config = JSON.parse(jsonInput);
    } catch (e) {
      showToast('รูปแบบ JSON ไม่ถูกต้อง', 'error');
      return;
    }
  } else {
    // Try individual fields
    const apiKey = document.getElementById('fb-apiKey')?.value?.trim();
    const databaseURL = document.getElementById('fb-databaseURL')?.value?.trim();
    const projectId = document.getElementById('fb-projectId')?.value?.trim();

    if (!databaseURL) {
      showToast('กรุณากรอก Database URL', 'error');
      return;
    }

    config = { apiKey, databaseURL, projectId };
  }

  // Validate required fields
  if (!config.databaseURL) {
    showToast('ต้องระบุ Database URL', 'error');
    return;
  }

  // Save config
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
  localStorage.removeItem(LOCAL_ONLY_KEY);

  // Initialize
  if (initFirebase(config)) {
    hideFirebaseSetupModal();
    setupFirebaseListeners();
    syncCloudToLocal().then(() => {
      if (window.render) window.render();
    });
  } else {
    showToast('เชื่อมต่อ Firebase ไม่สำเร็จ', 'error');
  }
};

window.useLocalOnly = () => {
  localStorage.setItem(LOCAL_ONLY_KEY, 'true');
  hideFirebaseSetupModal();
  updateSyncStatus();
  if (window.render) window.render();
};

window.showFirebaseSetup = () => {
  showFirebaseSetupModal();
};

window.resetFirebaseConfig = () => {
  if (confirm('ต้องการรีเซ็ตการตั้งค่า Firebase?')) {
    // Clear listeners
    syncListeners.forEach(unsub => unsub());
    syncListeners = [];
    
    // Clear config
    localStorage.removeItem(FIREBASE_CONFIG_KEY);
    localStorage.removeItem(LOCAL_ONLY_KEY);
    
    // Reset state
    firebaseApp = null;
    firebaseDb = null;
    isOnline = false;
    
    showToast('รีเซ็ตการตั้งค่าแล้ว', 'success');
    showFirebaseSetupModal();
  }
};

// ===== Initialization =====
const initFirebaseSync = () => {
  createSyncStatusUI();
  
  const config = getFirebaseConfig();
  
  if (isLocalOnly()) {
    updateSyncStatus();
  } else if (config) {
    if (initFirebase(config)) {
      setupFirebaseListeners();
      enhanceStorageWithSync();
    }
  } else {
    // Show setup modal for first time
    showFirebaseSetupModal();
  }
};

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFirebaseSync);
} else {
  initFirebaseSync();
}

// Export for external use
window.firebaseSync = {
  isOnline: () => isOnline,
  isLocalOnly,
  syncLocalToCloud,
  syncCloudToLocal,
  showSetup: showFirebaseSetupModal,
  reset: window.resetFirebaseConfig
};
