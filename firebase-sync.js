/**
 * Fish Farm Pro - Multi-Provider Cloud Sync Module
 * รองรับหลาย Database Providers
 */

// ===== Configuration =====
const SYNC_CONFIG_KEY = 'ff_sync_config';
const LOCAL_ONLY_KEY = 'ff_local_only';

// Data keys to sync
const SYNC_KEYS = [
  'ff_ponds', 'ff_cycles', 'ff_feeds', 'ff_feed_stock',
  'ff_supplements', 'ff_medicines', 'ff_feeding_logs',
  'ff_water_quality', 'ff_expenses', 'ff_harvests',
  'ff_mortalities', 'ff_fish_types'
];

// ===== Provider Definitions =====
const PROVIDERS = {
  firebase: {
    id: 'firebase',
    name: 'Firebase Realtime Database',
    icon: '🔥',
    description: 'Google Firebase - ฟรี 1GB',
    fields: [
      { key: 'apiKey', label: 'API Key', required: false },
      { key: 'databaseURL', label: 'Database URL', required: true, placeholder: 'https://xxx.firebaseio.com' },
      { key: 'projectId', label: 'Project ID', required: false }
    ],
    defaultConfig: {
      apiKey: "AIzaSyBgdiGlQwcbgmu4An-xSNpdlg9gr8G_XlM",
      databaseURL: "https://nat0112-7b220-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId: "nat0112-7b220"
    }
  },
  firestore: {
    id: 'firestore',
    name: 'Firestore',
    icon: '🗄️',
    description: 'Firebase Firestore - NoSQL Document DB',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'projectId', label: 'Project ID', required: true },
      { key: 'authDomain', label: 'Auth Domain', required: false }
    ],
    defaultConfig: null
  },
  supabase: {
    id: 'supabase',
    name: 'Supabase',
    icon: '⚡',
    description: 'Supabase - PostgreSQL + Realtime',
    fields: [
      { key: 'url', label: 'Project URL', required: true, placeholder: 'https://xxx.supabase.co' },
      { key: 'anonKey', label: 'Anon Key', required: true }
    ],
    defaultConfig: null
  },
  pocketbase: {
    id: 'pocketbase',
    name: 'PocketBase',
    icon: '📦',
    description: 'PocketBase - Self-hosted Backend',
    fields: [
      { key: 'url', label: 'PocketBase URL', required: true, placeholder: 'https://your-pb.com' },
      { key: 'collection', label: 'Collection Name', required: false, placeholder: 'fish_farm_data' }
    ],
    defaultConfig: null
  },
  mongodb: {
    id: 'mongodb',
    name: 'MongoDB Atlas',
    icon: '🍃',
    description: 'MongoDB Atlas Data API',
    fields: [
      { key: 'endpoint', label: 'Data API Endpoint', required: true },
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'database', label: 'Database Name', required: true },
      { key: 'dataSource', label: 'Data Source', required: true }
    ],
    defaultConfig: null
  },
  googlesheets: {
    id: 'googlesheets',
    name: 'Google Sheets',
    icon: '📊',
    description: 'Google Sheets API - Spreadsheet Storage',
    fields: [
      { key: 'sheetId', label: 'Spreadsheet ID', required: true },
      { key: 'apiKey', label: 'API Key', required: true }
    ],
    defaultConfig: null
  },
  restapi: {
    id: 'restapi',
    name: 'Custom REST API',
    icon: '🔌',
    description: 'สำหรับ PlanetScale, DynamoDB, D1, etc.',
    fields: [
      { key: 'baseUrl', label: 'API Base URL', required: true, placeholder: 'https://your-api.com' },
      { key: 'apiKey', label: 'API Key/Token', required: false },
      { key: 'headers', label: 'Custom Headers (JSON)', required: false, type: 'textarea' }
    ],
    defaultConfig: null
  }
};

// ===== State =====
let currentProvider = null;
let providerInstance = null;
let isOnline = false;
let isSyncing = false;
let syncListeners = [];

// ===== Provider Adapters =====
const adapters = {
  // Firebase Realtime Database Adapter
  firebase: {
    app: null,
    db: null,

    async init(config) {
      if (typeof firebase === 'undefined') {
        console.error('Firebase SDK not loaded');
        return false;
      }

      if (!config.databaseURL) {
        console.error('Firebase config missing databaseURL');
        return false;
      }

      try {
        if (!this.app) {
          this.app = firebase.initializeApp(config);
          this.db = firebase.database();
        }

        // Monitor connection
        this.db.ref('.info/connected').on('value', (snap) => {
          const wasOnline = isOnline;
          isOnline = snap.val() === true;
          updateSyncStatus();

          if (isOnline && !wasOnline) {
            showToast('เชื่อมต่อ Cloud สำเร็จ', 'success');
            this.syncToCloud();
          }
        });

        return true;
      } catch (e) {
        console.error('Firebase init error:', e);
        return false;
      }
    },

    async syncToCloud() {
      if (!this.db || !isOnline) return;

      try {
        const updates = {};
        SYNC_KEYS.forEach(key => {
          const data = localStorage.getItem(key);
          if (data) {
            updates[key.replace('ff_', '')] = JSON.parse(data);
          }
        });
        await this.db.ref().update(updates);
        console.log('Firebase: synced to cloud');
      } catch (e) {
        console.error('Firebase sync error:', e);
      }
    },

    async syncFromCloud() {
      if (!this.db) return;

      try {
        const snapshot = await this.db.ref().once('value');
        const data = snapshot.val();
        if (data) {
          SYNC_KEYS.forEach(key => {
            const dbKey = key.replace('ff_', '');
            if (data[dbKey]) {
              localStorage.setItem(key, JSON.stringify(data[dbKey]));
            }
          });
        }
        console.log('Firebase: synced from cloud');
      } catch (e) {
        console.error('Firebase sync error:', e);
      }
    },

    setupListeners(onChange) {
      if (!this.db) return;

      SYNC_KEYS.forEach(key => {
        const dbKey = key.replace('ff_', '');
        const ref = this.db.ref(dbKey);

        const listener = ref.on('value', (snapshot) => {
          const data = snapshot.val();
          if (data !== null) {
            const local = localStorage.getItem(key);
            const cloud = JSON.stringify(data);
            if (local !== cloud) {
              localStorage.setItem(key, cloud);
              onChange?.();
            }
          }
        });

        syncListeners.push(() => ref.off('value', listener));
      });
    },

    async set(key, data) {
      if (!this.db || !isOnline) return;
      const dbKey = key.replace('ff_', '');
      await this.db.ref(dbKey).set(data);
    },

    destroy() {
      syncListeners.forEach(unsub => unsub());
      syncListeners = [];
      this.app = null;
      this.db = null;
    }
  },

  // Firestore Adapter
  firestore: {
    app: null,
    db: null,

    async init(config) {
      if (typeof firebase === 'undefined') {
        console.error('Firebase SDK not loaded');
        return false;
      }

      try {
        if (!this.app) {
          this.app = firebase.initializeApp(config);
          this.db = firebase.firestore();
        }
        isOnline = true;
        updateSyncStatus();
        return true;
      } catch (e) {
        console.error('Firestore init error:', e);
        return false;
      }
    },

    async syncToCloud() {
      if (!this.db) return;

      try {
        const batch = this.db.batch();
        SYNC_KEYS.forEach(key => {
          const data = localStorage.getItem(key);
          if (data) {
            const docRef = this.db.collection('fish_farm').doc(key);
            batch.set(docRef, { data: JSON.parse(data), updatedAt: new Date() });
          }
        });
        await batch.commit();
        console.log('Firestore: synced to cloud');
      } catch (e) {
        console.error('Firestore sync error:', e);
      }
    },

    async syncFromCloud() {
      if (!this.db) return;

      try {
        const snapshot = await this.db.collection('fish_farm').get();
        snapshot.forEach(doc => {
          const key = doc.id;
          if (SYNC_KEYS.includes(key) && doc.data().data) {
            localStorage.setItem(key, JSON.stringify(doc.data().data));
          }
        });
        console.log('Firestore: synced from cloud');
      } catch (e) {
        console.error('Firestore sync error:', e);
      }
    },

    setupListeners(onChange) {
      if (!this.db) return;

      const unsubscribe = this.db.collection('fish_farm').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'modified' || change.type === 'added') {
            const key = change.doc.id;
            if (SYNC_KEYS.includes(key) && change.doc.data().data) {
              localStorage.setItem(key, JSON.stringify(change.doc.data().data));
              onChange?.();
            }
          }
        });
      });

      syncListeners.push(unsubscribe);
    },

    async set(key, data) {
      if (!this.db) return;
      await this.db.collection('fish_farm').doc(key).set({
        data,
        updatedAt: new Date()
      });
    },

    destroy() {
      syncListeners.forEach(unsub => unsub());
      syncListeners = [];
      this.app = null;
      this.db = null;
    }
  },

  // Supabase Adapter
  supabase: {
    client: null,

    async init(config) {
      if (typeof supabase === 'undefined') {
        console.error('Supabase SDK not loaded. Add: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
        return false;
      }

      try {
        this.client = supabase.createClient(config.url, config.anonKey);
        isOnline = true;
        updateSyncStatus();
        showToast('เชื่อมต่อ Supabase สำเร็จ', 'success');
        return true;
      } catch (e) {
        console.error('Supabase init error:', e);
        return false;
      }
    },

    async syncToCloud() {
      if (!this.client) return;

      try {
        for (const key of SYNC_KEYS) {
          const data = localStorage.getItem(key);
          if (data) {
            await this.client
              .from('fish_farm_sync')
              .upsert({
                key,
                data: JSON.parse(data),
                updated_at: new Date().toISOString()
              }, { onConflict: 'key' });
          }
        }
        console.log('Supabase: synced to cloud');
      } catch (e) {
        console.error('Supabase sync error:', e);
      }
    },

    async syncFromCloud() {
      if (!this.client) return;

      try {
        const { data, error } = await this.client
          .from('fish_farm_sync')
          .select('*');

        if (error) throw error;

        data?.forEach(row => {
          if (SYNC_KEYS.includes(row.key)) {
            localStorage.setItem(row.key, JSON.stringify(row.data));
          }
        });
        console.log('Supabase: synced from cloud');
      } catch (e) {
        console.error('Supabase sync error:', e);
      }
    },

    setupListeners(onChange) {
      if (!this.client) return;

      const channel = this.client
        .channel('fish_farm_changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'fish_farm_sync' },
          (payload) => {
            if (payload.new && SYNC_KEYS.includes(payload.new.key)) {
              localStorage.setItem(payload.new.key, JSON.stringify(payload.new.data));
              onChange?.();
            }
          }
        )
        .subscribe();

      syncListeners.push(() => channel.unsubscribe());
    },

    async set(key, data) {
      if (!this.client) return;
      await this.client
        .from('fish_farm_sync')
        .upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    },

    destroy() {
      syncListeners.forEach(unsub => unsub());
      syncListeners = [];
      this.client = null;
    }
  },

  // PocketBase Adapter
  pocketbase: {
    client: null,
    collection: 'fish_farm_data',

    async init(config) {
      if (typeof PocketBase === 'undefined') {
        console.error('PocketBase SDK not loaded. Add: <script src="https://cdn.jsdelivr.net/npm/pocketbase@0.21.1/dist/pocketbase.umd.js"></script>');
        return false;
      }

      try {
        this.client = new PocketBase(config.url);
        this.collection = config.collection || 'fish_farm_data';
        isOnline = true;
        updateSyncStatus();
        showToast('เชื่อมต่อ PocketBase สำเร็จ', 'success');
        return true;
      } catch (e) {
        console.error('PocketBase init error:', e);
        return false;
      }
    },

    async syncToCloud() {
      if (!this.client) return;

      try {
        for (const key of SYNC_KEYS) {
          const data = localStorage.getItem(key);
          if (data) {
            try {
              const existing = await this.client.collection(this.collection).getFirstListItem(`key="${key}"`);
              await this.client.collection(this.collection).update(existing.id, { key, data: JSON.parse(data) });
            } catch {
              await this.client.collection(this.collection).create({ key, data: JSON.parse(data) });
            }
          }
        }
        console.log('PocketBase: synced to cloud');
      } catch (e) {
        console.error('PocketBase sync error:', e);
      }
    },

    async syncFromCloud() {
      if (!this.client) return;

      try {
        const records = await this.client.collection(this.collection).getFullList();
        records.forEach(record => {
          if (SYNC_KEYS.includes(record.key)) {
            localStorage.setItem(record.key, JSON.stringify(record.data));
          }
        });
        console.log('PocketBase: synced from cloud');
      } catch (e) {
        console.error('PocketBase sync error:', e);
      }
    },

    setupListeners(onChange) {
      if (!this.client) return;

      this.client.collection(this.collection).subscribe('*', (e) => {
        if (e.record && SYNC_KEYS.includes(e.record.key)) {
          localStorage.setItem(e.record.key, JSON.stringify(e.record.data));
          onChange?.();
        }
      });

      syncListeners.push(() => this.client.collection(this.collection).unsubscribe());
    },

    async set(key, data) {
      if (!this.client) return;
      try {
        const existing = await this.client.collection(this.collection).getFirstListItem(`key="${key}"`);
        await this.client.collection(this.collection).update(existing.id, { key, data });
      } catch {
        await this.client.collection(this.collection).create({ key, data });
      }
    },

    destroy() {
      syncListeners.forEach(unsub => unsub());
      syncListeners = [];
      this.client = null;
    }
  },

  // MongoDB Atlas Data API Adapter
  mongodb: {
    config: null,

    async init(config) {
      this.config = config;
      try {
        // Test connection
        const response = await fetch(`${config.endpoint}/action/findOne`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': config.apiKey
          },
          body: JSON.stringify({
            dataSource: config.dataSource,
            database: config.database,
            collection: 'fish_farm_sync',
            filter: { _id: 'test' }
          })
        });

        if (response.ok) {
          isOnline = true;
          updateSyncStatus();
          showToast('เชื่อมต่อ MongoDB Atlas สำเร็จ', 'success');
          return true;
        }
        return false;
      } catch (e) {
        console.error('MongoDB init error:', e);
        return false;
      }
    },

    async syncToCloud() {
      if (!this.config) return;

      try {
        for (const key of SYNC_KEYS) {
          const data = localStorage.getItem(key);
          if (data) {
            await fetch(`${this.config.endpoint}/action/updateOne`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'api-key': this.config.apiKey
              },
              body: JSON.stringify({
                dataSource: this.config.dataSource,
                database: this.config.database,
                collection: 'fish_farm_sync',
                filter: { key },
                update: { $set: { key, data: JSON.parse(data), updatedAt: new Date() } },
                upsert: true
              })
            });
          }
        }
        console.log('MongoDB: synced to cloud');
      } catch (e) {
        console.error('MongoDB sync error:', e);
      }
    },

    async syncFromCloud() {
      if (!this.config) return;

      try {
        const response = await fetch(`${this.config.endpoint}/action/find`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.config.apiKey
          },
          body: JSON.stringify({
            dataSource: this.config.dataSource,
            database: this.config.database,
            collection: 'fish_farm_sync',
            filter: {}
          })
        });

        const result = await response.json();
        result.documents?.forEach(doc => {
          if (SYNC_KEYS.includes(doc.key)) {
            localStorage.setItem(doc.key, JSON.stringify(doc.data));
          }
        });
        console.log('MongoDB: synced from cloud');
      } catch (e) {
        console.error('MongoDB sync error:', e);
      }
    },

    setupListeners(onChange) {
      // MongoDB Data API doesn't support realtime - poll every 30s
      const interval = setInterval(async () => {
        await this.syncFromCloud();
        onChange?.();
      }, 30000);

      syncListeners.push(() => clearInterval(interval));
    },

    async set(key, data) {
      if (!this.config) return;
      await fetch(`${this.config.endpoint}/action/updateOne`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.config.apiKey
        },
        body: JSON.stringify({
          dataSource: this.config.dataSource,
          database: this.config.database,
          collection: 'fish_farm_sync',
          filter: { key },
          update: { $set: { key, data, updatedAt: new Date() } },
          upsert: true
        })
      });
    },

    destroy() {
      syncListeners.forEach(unsub => unsub());
      syncListeners = [];
      this.config = null;
    }
  },

  // Google Sheets Adapter
  googlesheets: {
    config: null,

    async init(config) {
      this.config = config;
      try {
        const response = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}?key=${config.apiKey}`
        );

        if (response.ok) {
          isOnline = true;
          updateSyncStatus();
          showToast('เชื่อมต่อ Google Sheets สำเร็จ', 'success');
          return true;
        }
        return false;
      } catch (e) {
        console.error('Google Sheets init error:', e);
        return false;
      }
    },

    async syncToCloud() {
      // Note: Writing requires OAuth, not just API key
      console.warn('Google Sheets write requires OAuth authentication');
    },

    async syncFromCloud() {
      if (!this.config) return;

      try {
        const response = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${this.config.sheetId}/values/A:B?key=${this.config.apiKey}`
        );

        const result = await response.json();
        result.values?.forEach(([key, data]) => {
          if (SYNC_KEYS.includes(key) && data) {
            try {
              localStorage.setItem(key, data);
            } catch (e) {}
          }
        });
        console.log('Google Sheets: synced from cloud');
      } catch (e) {
        console.error('Google Sheets sync error:', e);
      }
    },

    setupListeners(onChange) {
      // Poll every 60s
      const interval = setInterval(async () => {
        await this.syncFromCloud();
        onChange?.();
      }, 60000);

      syncListeners.push(() => clearInterval(interval));
    },

    async set(key, data) {
      console.warn('Google Sheets write requires OAuth');
    },

    destroy() {
      syncListeners.forEach(unsub => unsub());
      syncListeners = [];
      this.config = null;
    }
  },

  // Generic REST API Adapter
  restapi: {
    config: null,

    async init(config) {
      this.config = config;
      try {
        let headers = { 'Content-Type': 'application/json' };
        if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
        if (config.headers) {
          try {
            Object.assign(headers, JSON.parse(config.headers));
          } catch {}
        }
        this.headers = headers;

        const response = await fetch(`${config.baseUrl}/health`, { headers });
        isOnline = response.ok;
        updateSyncStatus();
        if (isOnline) showToast('เชื่อมต่อ API สำเร็จ', 'success');
        return isOnline;
      } catch (e) {
        // Assume online if no health endpoint
        isOnline = true;
        updateSyncStatus();
        return true;
      }
    },

    async syncToCloud() {
      if (!this.config) return;

      try {
        const allData = {};
        SYNC_KEYS.forEach(key => {
          const data = localStorage.getItem(key);
          if (data) allData[key] = JSON.parse(data);
        });

        await fetch(`${this.config.baseUrl}/sync`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(allData)
        });
        console.log('REST API: synced to cloud');
      } catch (e) {
        console.error('REST API sync error:', e);
      }
    },

    async syncFromCloud() {
      if (!this.config) return;

      try {
        const response = await fetch(`${this.config.baseUrl}/sync`, {
          headers: this.headers
        });

        const data = await response.json();
        Object.entries(data).forEach(([key, value]) => {
          if (SYNC_KEYS.includes(key)) {
            localStorage.setItem(key, JSON.stringify(value));
          }
        });
        console.log('REST API: synced from cloud');
      } catch (e) {
        console.error('REST API sync error:', e);
      }
    },

    setupListeners(onChange) {
      // Poll every 30s
      const interval = setInterval(async () => {
        await this.syncFromCloud();
        onChange?.();
      }, 30000);

      syncListeners.push(() => clearInterval(interval));
    },

    async set(key, data) {
      if (!this.config) return;
      await fetch(`${this.config.baseUrl}/sync/${key}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data)
      });
    },

    destroy() {
      syncListeners.forEach(unsub => unsub());
      syncListeners = [];
      this.config = null;
    }
  }
};

// ===== Config Management =====
const getSyncConfig = () => {
  try {
    const config = localStorage.getItem(SYNC_CONFIG_KEY);
    if (config) return JSON.parse(config);

    // ค่าเริ่มต้น: Firebase
    return {
      provider: 'firebase',
      config: PROVIDERS.firebase.defaultConfig
    };
  } catch (e) {
    return null;
  }
};

const saveSyncConfig = (provider, config) => {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify({ provider, config }));
  localStorage.removeItem(LOCAL_ONLY_KEY);
};

const isLocalOnly = () => localStorage.getItem(LOCAL_ONLY_KEY) === 'true';
const isOfflineLocked = () => isLocalOnly();

// ===== Password System =====
const APP_PASSWORD_KEY = 'ff_app_password';
const DEFAULT_PASSWORD = '5280';
const MASTER_KEY = '011262';

// Simple hash function
const hashPassword = (password) => {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'pwd_' + Math.abs(hash).toString(36);
};

// ตรวจสอบรหัสผ่าน
const verifyPassword = (password) => {
  // มาสเตอร์คีย์ใช้ได้เสมอ
  if (password === MASTER_KEY) return true;

  const stored = localStorage.getItem(APP_PASSWORD_KEY);
  // ถ้ายังไม่มี custom password ให้ใช้รหัสเริ่มต้น
  if (!stored) {
    return password === DEFAULT_PASSWORD;
  }
  return stored === hashPassword(password);
};

// เปลี่ยนรหัสผ่าน
const changePassword = (newPassword) => {
  localStorage.setItem(APP_PASSWORD_KEY, hashPassword(newPassword));
};

// รีเซ็ตรหัสผ่านกลับเป็นค่าเริ่มต้น
const resetPassword = () => {
  localStorage.removeItem(APP_PASSWORD_KEY);
};

// Alias สำหรับ offline lock (ใช้รหัสเดียวกัน)
const verifyOfflineLock = verifyPassword;

// ===== Sync Status UI =====
const createSyncStatusUI = () => {
  const existing = document.getElementById('sync-status');
  if (existing) return;

  const indicator = document.createElement('div');
  indicator.id = 'sync-status';
  indicator.className = 'sync-indicator sync-offline';
  indicator.innerHTML = `<span id="sync-icon">●</span>`;
  indicator.title = 'Cloud Sync Status - คลิกเพื่อตั้งค่า';
  indicator.onclick = () => showSyncSetupModal();
  indicator.style.cursor = 'pointer';
  document.body.appendChild(indicator);

  if (!document.getElementById('sync-styles')) {
    const style = document.createElement('style');
    style.id = 'sync-styles';
    style.textContent = `
      .sync-indicator {
        position: fixed;
        top: 8px;
        right: 8px;
        z-index: 50;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        opacity: 0.8;
      }
      .sync-indicator:hover {
        opacity: 1;
        transform: scale(1.5);
      }
      .sync-online { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
      .sync-online span { display: none; }
      .sync-offline { background: #ef4444; box-shadow: 0 0 6px #ef4444; }
      .sync-offline span { display: none; }
      .sync-syncing { background: #3b82f6; box-shadow: 0 0 8px #3b82f6; animation: pulse 1s infinite; }
      .sync-syncing span { display: none; }
      .sync-local { background: #94a3b8; box-shadow: 0 0 4px #94a3b8; }
      .sync-local span { display: none; }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    `;
    document.head.appendChild(style);
  }
};

const updateSyncStatus = () => {
  const indicator = document.getElementById('sync-status');
  if (!indicator) return;

  // อัพเดท tooltip
  const provider = PROVIDERS[currentProvider];

  if (isLocalOnly()) {
    indicator.className = 'sync-indicator sync-local';
    indicator.title = '🔒 Offline Mode - คลิกเพื่อเปลี่ยน';
  } else if (isSyncing) {
    indicator.className = 'sync-indicator sync-syncing';
    indicator.title = '🔄 กำลัง Sync...';
  } else if (isOnline) {
    indicator.className = 'sync-indicator sync-online';
    indicator.title = `✓ ${provider?.name || 'Cloud'} - เชื่อมต่อแล้ว`;
  } else {
    indicator.className = 'sync-indicator sync-offline';
    indicator.title = '✕ ไม่ได้เชื่อมต่อ Cloud - คลิกเพื่อตั้งค่า';
  }
};

// ===== Setup Modal =====
const showSyncSetupModal = () => {
  // ถ้าล็อค offline อยู่ ต้องใส่รหัสผ่านก่อน
  if (isOfflineLocked() && isLocalOnly()) {
    showUnlockModal();
    return;
  }

  const existingModal = document.getElementById('sync-setup-modal');
  if (existingModal) existingModal.remove();

  const savedConfig = getSyncConfig();
  const currentProviderId = savedConfig?.provider || 'firebase';

  const modal = document.createElement('div');
  modal.id = 'sync-setup-modal';
  modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-slate-800 rounded-2xl w-full max-w-lg p-6 fade-in max-h-[90vh] overflow-y-auto">
      <div class="text-center mb-6">
        <div class="text-4xl mb-2">☁️</div>
        <h2 class="text-xl font-bold text-cyan-400">ตั้งค่า Cloud Sync</h2>
        <p class="text-slate-400 text-sm mt-1">เลือก Database Provider</p>
      </div>

      <!-- Provider Selection -->
      <div class="grid grid-cols-2 gap-2 mb-4" id="provider-grid">
        ${Object.values(PROVIDERS).map(p => `
          <button onclick="selectProvider('${p.id}')"
            class="provider-btn p-3 rounded-xl border-2 transition-all text-left ${p.id === currentProviderId ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-600 hover:border-slate-500'}"
            data-provider="${p.id}">
            <div class="text-2xl mb-1">${p.icon}</div>
            <div class="text-sm font-medium text-slate-200">${p.name}</div>
            <div class="text-xs text-slate-400">${p.description}</div>
          </button>
        `).join('')}
      </div>

      <!-- Config Fields -->
      <div id="provider-config" class="space-y-3 mb-4">
        <!-- Fields will be injected here -->
      </div>

      <!-- Actions -->
      <div class="space-y-2">
        <button onclick="saveAndConnect()" class="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-semibold transition-colors">
          💾 บันทึกและเชื่อมต่อ
        </button>
        <button onclick="useLocalOnly()" class="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl transition-colors text-sm">
          📴 ใช้งานแบบ Offline
        </button>
        <div class="flex gap-2">
          <button onclick="showChangePasswordModal()" class="flex-1 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-xl transition-colors text-sm">
            🔑 เปลี่ยนรหัสผ่าน
          </button>
          <button onclick="closeSyncModal()" class="flex-1 py-2 text-slate-400 hover:text-slate-300 text-sm">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Initialize with current provider
  selectProvider(currentProviderId);
};

window.selectProvider = (providerId) => {
  const provider = PROVIDERS[providerId];
  if (!provider) return;

  // Update selection UI
  document.querySelectorAll('.provider-btn').forEach(btn => {
    if (btn.dataset.provider === providerId) {
      btn.classList.add('border-cyan-500', 'bg-cyan-500/10');
      btn.classList.remove('border-slate-600');
    } else {
      btn.classList.remove('border-cyan-500', 'bg-cyan-500/10');
      btn.classList.add('border-slate-600');
    }
  });

  // Get saved config for this provider
  const savedConfig = getSyncConfig();
  const config = savedConfig?.provider === providerId ? savedConfig.config : (provider.defaultConfig || {});

  // Render config fields
  const configDiv = document.getElementById('provider-config');
  configDiv.innerHTML = `
    <input type="hidden" id="selected-provider" value="${providerId}">
    ${provider.fields.map(field => `
      <div>
        <label class="block text-sm text-slate-300 mb-1">
          ${field.label} ${field.required ? '<span class="text-red-400">*</span>' : ''}
        </label>
        ${field.type === 'textarea'
          ? `<textarea id="field-${field.key}" rows="3"
              class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
              placeholder="${field.placeholder || ''}">${config[field.key] || ''}</textarea>`
          : `<input type="text" id="field-${field.key}"
              class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
              placeholder="${field.placeholder || ''}"
              value="${config[field.key] || ''}">`
        }
      </div>
    `).join('')}
  `;
};

window.saveAndConnect = async () => {
  const providerId = document.getElementById('selected-provider')?.value;
  const provider = PROVIDERS[providerId];
  if (!provider) return;

  // Collect config
  const config = {};
  for (const field of provider.fields) {
    const el = document.getElementById(`field-${field.key}`);
    const value = el?.value?.trim();
    if (field.required && !value) {
      showToast(`กรุณากรอก ${field.label}`, 'error');
      return;
    }
    if (value) config[field.key] = value;
  }

  // Save config
  saveSyncConfig(providerId, config);

  // Initialize provider
  const adapter = adapters[providerId];
  if (adapter) {
    // Destroy previous
    if (providerInstance) {
      providerInstance.destroy?.();
    }

    currentProvider = providerId;
    providerInstance = adapter;

    if (await adapter.init(config)) {
      adapter.setupListeners?.(() => {
        if (window.render) window.render();
      });
      await adapter.syncFromCloud();
      closeSyncModal();
      if (window.render) window.render();
    } else {
      showToast('เชื่อมต่อไม่สำเร็จ', 'error');
    }
  }
};

window.useLocalOnly = () => {
  localStorage.setItem(LOCAL_ONLY_KEY, 'true');
  closeSyncModal();
  updateSyncStatus();
  showToast('เปิด Offline Mode', 'success');
  if (window.render) window.render();
};

// ===== Unlock Modal =====
const showUnlockModal = () => {
  const existingModal = document.getElementById('unlock-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'unlock-modal';
  modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-slate-800 rounded-2xl w-full max-w-sm p-6 fade-in">
      <div class="text-center mb-6">
        <div class="text-5xl mb-3">🔐</div>
        <h2 class="text-xl font-bold text-cyan-400">ใส่รหัสผ่าน</h2>
        <p class="text-slate-400 text-sm mt-2">ยืนยันตัวตนเพื่อเข้าถึงการตั้งค่า</p>
      </div>

      <div class="space-y-4">
        <div>
          <input type="password" id="unlock-password"
            class="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 text-center text-lg tracking-widest"
            placeholder="รหัสผ่าน"
            onkeypress="if(event.key==='Enter')unlockOffline()">
        </div>

        <button onclick="unlockOffline()" class="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-semibold transition-colors">
          🔓 ยืนยัน
        </button>

        <button onclick="showForgotPasswordModal()" class="w-full py-2 text-amber-400 hover:text-amber-300 text-sm">
          ลืมรหัสผ่าน?
        </button>

        <button onclick="closeUnlockModal()" class="w-full py-2 text-slate-400 hover:text-slate-300 text-sm">
          ยกเลิก
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('unlock-password')?.focus();
};

// ===== Forgot Password Modal =====
window.showForgotPasswordModal = () => {
  closeUnlockModal();

  const modal = document.createElement('div');
  modal.id = 'forgot-password-modal';
  modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-slate-800 rounded-2xl w-full max-w-sm p-6 fade-in">
      <div class="text-center mb-6">
        <div class="text-5xl mb-3">🔑</div>
        <h2 class="text-xl font-bold text-amber-400">ลืมรหัสผ่าน</h2>
        <p class="text-slate-400 text-sm mt-2">ใส่มาสเตอร์คีย์เพื่อรีเซ็ตรหัสผ่าน</p>
      </div>

      <div class="space-y-4">
        <div>
          <input type="password" id="master-key-input"
            class="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 text-center text-lg tracking-widest"
            placeholder="มาสเตอร์คีย์"
            onkeypress="if(event.key==='Enter')verifyMasterKey()">
        </div>

        <button onclick="verifyMasterKey()" class="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-colors">
          🔓 รีเซ็ตรหัสผ่าน
        </button>

        <button onclick="closeForgotPasswordModal()" class="w-full py-2 text-slate-400 hover:text-slate-300 text-sm">
          ยกเลิก
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('master-key-input')?.focus();
};

window.verifyMasterKey = () => {
  const masterKey = document.getElementById('master-key-input')?.value;

  if (masterKey === MASTER_KEY) {
    resetPassword();
    localStorage.removeItem(LOCAL_ONLY_KEY);
    closeForgotPasswordModal();
    showToast('รีเซ็ตรหัสผ่านสำเร็จ (รหัสใหม่: ' + DEFAULT_PASSWORD + ')', 'success');
    updateSyncStatus();
    setTimeout(() => showSyncSetupModal(), 300);
  } else {
    showToast('มาสเตอร์คีย์ไม่ถูกต้อง', 'error');
    document.getElementById('master-key-input').value = '';
  }
};

window.closeForgotPasswordModal = () => {
  const modal = document.getElementById('forgot-password-modal');
  if (modal) modal.remove();
};

// ===== Change Password Modal =====
window.showChangePasswordModal = () => {
  closeSyncModal();

  const modal = document.createElement('div');
  modal.id = 'change-password-modal';
  modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-slate-800 rounded-2xl w-full max-w-sm p-6 fade-in">
      <div class="text-center mb-6">
        <div class="text-5xl mb-3">🔑</div>
        <h2 class="text-xl font-bold text-amber-400">เปลี่ยนรหัสผ่าน</h2>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-sm text-slate-300 mb-2">รหัสผ่านเดิม</label>
          <input type="password" id="old-password"
            class="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-slate-100"
            placeholder="รหัสผ่านเดิม">
        </div>

        <div>
          <label class="block text-sm text-slate-300 mb-2">รหัสผ่านใหม่</label>
          <input type="password" id="new-password"
            class="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-slate-100"
            placeholder="รหัสผ่านใหม่ (4+ ตัวอักษร)">
        </div>

        <div>
          <label class="block text-sm text-slate-300 mb-2">ยืนยันรหัสผ่านใหม่</label>
          <input type="password" id="confirm-new-password"
            class="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-slate-100"
            placeholder="ยืนยันรหัสผ่านใหม่"
            onkeypress="if(event.key==='Enter')submitChangePassword()">
        </div>

        <button onclick="submitChangePassword()" class="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-colors">
          ✓ เปลี่ยนรหัสผ่าน
        </button>

        <button onclick="closeChangePasswordModal()" class="w-full py-2 text-slate-400 hover:text-slate-300 text-sm">
          ยกเลิก
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('old-password')?.focus();
};

window.submitChangePassword = () => {
  const oldPwd = document.getElementById('old-password')?.value;
  const newPwd = document.getElementById('new-password')?.value;
  const confirmPwd = document.getElementById('confirm-new-password')?.value;

  if (!verifyPassword(oldPwd)) {
    showToast('รหัสผ่านเดิมไม่ถูกต้อง', 'error');
    return;
  }

  if (!newPwd || newPwd.length < 4) {
    showToast('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร', 'error');
    return;
  }

  if (newPwd !== confirmPwd) {
    showToast('รหัสผ่านใหม่ไม่ตรงกัน', 'error');
    return;
  }

  changePassword(newPwd);
  closeChangePasswordModal();
  showToast('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
};

window.closeChangePasswordModal = () => {
  const modal = document.getElementById('change-password-modal');
  if (modal) modal.remove();
};

window.unlockOffline = () => {
  const password = document.getElementById('unlock-password')?.value;

  if (!password) {
    showToast('กรุณาใส่รหัสผ่าน', 'error');
    return;
  }

  if (verifyPassword(password)) {
    // Unlock successful
    localStorage.removeItem(LOCAL_ONLY_KEY);

    closeUnlockModal();
    showToast('ยืนยันสำเร็จ', 'success');
    updateSyncStatus();

    // Show setup modal
    setTimeout(() => {
      showSyncSetupModal();
    }, 300);
  } else {
    showToast('รหัสผ่านไม่ถูกต้อง', 'error');
    document.getElementById('unlock-password').value = '';
    document.getElementById('unlock-password')?.focus();
  }
};

window.closeUnlockModal = () => {
  const modal = document.getElementById('unlock-modal');
  if (modal) modal.remove();
};

window.closeSyncModal = () => {
  const modal = document.getElementById('sync-setup-modal');
  if (modal) modal.remove();
};

window.showSyncSetup = showSyncSetupModal;

window.resetSyncConfig = () => {
  if (confirm('ต้องการรีเซ็ตการตั้งค่า Cloud Sync?')) {
    if (providerInstance) {
      providerInstance.destroy?.();
      providerInstance = null;
    }
    localStorage.removeItem(SYNC_CONFIG_KEY);
    localStorage.removeItem(LOCAL_ONLY_KEY);
    currentProvider = null;
    isOnline = false;
    showToast('รีเซ็ตการตั้งค่าแล้ว', 'success');
    showSyncSetupModal();
  }
};

// ===== Enhanced Storage =====
let syncDebounceTimer = null;
let pendingSyncKeys = new Set();

const debouncedSyncToCloud = () => {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);

  syncDebounceTimer = setTimeout(async () => {
    if (!providerInstance || !isOnline || isLocalOnly()) return;

    isSyncing = true;
    updateSyncStatus();

    try {
      await providerInstance.syncToCloud?.();
      pendingSyncKeys.clear();
    } catch (err) {
      console.error('Debounced sync error:', err);
    }

    isSyncing = false;
    updateSyncStatus();
  }, 2000); // Sync หลังจากไม่มีการเปลี่ยนแปลง 2 วินาที
};

const enhanceStorageWithSync = () => {
  if (!window.storage) return;

  const originalSet = window.storage.set;

  window.storage.set = (key, data) => {
    const result = originalSet.call(window.storage, key, data);

    if (providerInstance && !isLocalOnly() && SYNC_KEYS.includes(key)) {
      pendingSyncKeys.add(key);
      debouncedSyncToCloud();
    }

    return result;
  };
};

// Periodic sync ทุก 30 วินาที เพื่อให้แน่ใจว่าข้อมูลตรงกัน
const startPeriodicSync = () => {
  setInterval(async () => {
    if (!providerInstance || !isOnline || isLocalOnly() || isSyncing) return;

    try {
      await providerInstance.syncFromCloud?.();
    } catch (err) {
      console.error('Periodic sync error:', err);
    }
  }, 30000);
};

// ===== Initialization =====
const initCloudSync = async () => {
  createSyncStatusUI();

  if (isLocalOnly()) {
    updateSyncStatus();
    return;
  }

  // ใช้ config ที่บันทึกไว้ หรือใช้ Firebase เริ่มต้นอัตโนมัติ
  let savedConfig = getSyncConfig();

  // ถ้ายังไม่มี config ให้ใช้ Firebase เริ่มต้นทันที (auto-connect)
  if (!savedConfig?.provider || !savedConfig?.config) {
    savedConfig = {
      provider: 'firebase',
      config: PROVIDERS.firebase.defaultConfig
    };
    // บันทึก config เพื่อใช้ครั้งต่อไป
    saveSyncConfig('firebase', PROVIDERS.firebase.defaultConfig);
  }

  currentProvider = savedConfig.provider;
  const adapter = adapters[currentProvider];

  if (adapter) {
    providerInstance = adapter;
    if (await adapter.init(savedConfig.config)) {
      adapter.setupListeners?.(() => {
        if (window.render) window.render();
      });
      enhanceStorageWithSync();
      startPeriodicSync();

      // Sync ข้อมูลทันทีเมื่อเชื่อมต่อสำเร็จ
      setTimeout(() => {
        adapter.syncFromCloud?.();
      }, 1000);
    }
  }
};

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCloudSync);
} else {
  initCloudSync();
}

// Sync เมื่อผู้ใช้กลับมาใช้แอพ
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && providerInstance && isOnline && !isLocalOnly()) {
    try {
      await providerInstance.syncFromCloud?.();
      if (window.render) window.render();
    } catch (err) {
      console.error('Visibility sync error:', err);
    }
  }
});

// Sync ก่อนปิดหน้า (upload pending changes)
window.addEventListener('beforeunload', () => {
  if (pendingSyncKeys.size > 0 && providerInstance && isOnline && !isLocalOnly()) {
    providerInstance.syncToCloud?.();
  }
});

// Export
window.cloudSync = {
  isOnline: () => isOnline,
  isLocalOnly,
  getProvider: () => currentProvider,
  syncToCloud: () => providerInstance?.syncToCloud?.(),
  syncFromCloud: () => providerInstance?.syncFromCloud?.(),
  showSetup: showSyncSetupModal,
  reset: window.resetSyncConfig,
  PROVIDERS
};

// Backwards compatibility
window.firebaseSync = window.cloudSync;
