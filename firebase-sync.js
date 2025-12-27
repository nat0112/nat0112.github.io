/**
 * ================================================================================
 * Fish Farm Pro - Multi-Provider Cloud Sync Module
 * ================================================================================
 *
 * @description โมดูลสำหรับ sync ข้อมูลระหว่าง localStorage และ Cloud Database
 *              รองรับหลาย providers: Firebase, Firestore, Supabase, PocketBase,
 *              MongoDB Atlas, Google Sheets, REST API
 *
 * @version 2.1.0
 * @author Fish Farm Pro Team
 * @lastModified 2025-01-XX
 *
 * ================================================================================
 * CHANGELOG:
 * ================================================================================
 * v2.1.0 - Security & Stability Update
 *   - [FIX] Race condition ใน realtime listeners (infinite loop prevention)
 *   - [FIX] Firebase app re-initialization error
 *   - [FIX] JSON parse error handling (safeJSONParse)
 *   - [FIX] Memory leak ใน connection listener
 *   - [FIX] XSS vulnerability ใน modal HTML (escapeHtml)
 *   - [ADD] Mutex lock สำหรับ sync operations (acquireSyncLock/releaseSyncLock)
 *   - [ADD] Retry mechanism สำหรับ failed syncs (max 3 ครั้ง)
 *   - [ADD] Debounce สำหรับ sync back to cloud (500ms)
 *
 * v2.0.0 - Smart Merge Sync
 *   - [ADD] Smart merge algorithm (timestamp-based conflict resolution)
 *   - [ADD] ป้องกันข้อมูลหายเมื่อ sync จากหลายเครื่อง
 *
 * ================================================================================
 * HOW IT WORKS:
 * ================================================================================
 *
 * 1. INITIALIZATION:
 *    - โหลด config จาก localStorage (ff_sync_config)
 *    - เชื่อมต่อ provider ที่เลือก (default: Firebase)
 *    - ตั้งค่า realtime listeners
 *
 * 2. SMART SYNC ALGORITHM:
 *    ┌─────────────────────────────────────────────────────────────┐
 *    │  Local Data          Cloud Data                            │
 *    │     │                    │                                 │
 *    │     └────────┬───────────┘                                 │
 *    │              ▼                                             │
 *    │     ┌─────────────────┐                                    │
 *    │     │ Compare by ID   │                                    │
 *    │     └────────┬────────┘                                    │
 *    │              ▼                                             │
 *    │     ┌─────────────────┐                                    │
 *    │     │ Compare Timestamp│  ← ใช้ updatedAt/createdAt        │
 *    │     └────────┬────────┘                                    │
 *    │              ▼                                             │
 *    │     ┌─────────────────┐                                    │
 *    │     │ Select Newer    │  ← เลือกข้อมูลที่ใหม่กว่า          │
 *    │     └────────┬────────┘                                    │
 *    │              ▼                                             │
 *    │     ┌─────────────────┐                                    │
 *    │     │ Merge & Sync    │  ← อัพเดตทั้ง local และ cloud     │
 *    │     └─────────────────┘                                    │
 *    └─────────────────────────────────────────────────────────────┘
 *
 * 3. CONFLICT RESOLUTION:
 *    - ถ้า record มี id เดียวกัน → เปรียบเทียบ timestamp
 *    - ข้อมูลที่มี updatedAt/createdAt ใหม่กว่าจะถูกเลือก
 *    - ถ้า timestamp เท่ากัน → ใช้ข้อมูลจาก cloud (cloud wins)
 *
 * 4. PROTECTION MECHANISMS:
 *    - Mutex Lock: ป้องกัน sync หลายตัวทำงานพร้อมกัน
 *    - Cooldown: ต้องรออย่างน้อย 1 วินาทีระหว่าง sync
 *    - Debounce: รอ 500ms ก่อน sync back to cloud
 *    - Retry: ลองใหม่สูงสุด 3 ครั้งถ้า sync ล้มเหลว
 *
 * ================================================================================
 * SECURITY NOTES:
 * ================================================================================
 * - รหัสผ่านเริ่มต้น: 5280
 * - Master Key (สำหรับ reset): 011262
 * - รหัสผ่านถูก hash ด้วย simple hash function (ไม่ใช่ cryptographic)
 * - XSS protection: ใช้ escapeHtml() สำหรับ dynamic HTML content
 *
 * ================================================================================
 */

// ===== Configuration Keys =====
// Keys สำหรับเก็บข้อมูล config ใน localStorage
const SYNC_CONFIG_KEY = 'ff_sync_config';      // เก็บ provider config
const LOCAL_ONLY_KEY = 'ff_local_only';        // flag สำหรับ offline mode
const SYNC_METADATA_KEY = 'ff_sync_metadata';  // เก็บ metadata เช่น lastSync

/**
 * รายการ keys ที่ต้อง sync กับ cloud
 * @note ทุก key ต้องขึ้นต้นด้วย 'ff_' (fish farm prefix)
 * @note key จะถูกแปลงเป็นชื่อ collection/table ใน cloud โดยตัด 'ff_' ออก
 *
 * ตัวอย่าง: 'ff_ponds' → 'ponds' ใน Firebase
 */
const SYNC_KEYS = [
  'ff_ponds',          // ข้อมูลบ่อเลี้ยง
  'ff_cycles',         // รอบการเลี้ยง
  'ff_feeds',          // ชนิดอาหาร
  'ff_feed_stock',     // สต็อกอาหาร
  'ff_supplements',    // วิตามิน/อาหารเสริม
  'ff_medicines',      // ยารักษาโรค
  'ff_feeding_logs',   // บันทึกการให้อาหาร
  'ff_water_quality',  // คุณภาพน้ำ
  'ff_expenses',       // ค่าใช้จ่าย
  'ff_harvests',       // การจับปลา/เก็บเกี่ยว
  'ff_mortalities',    // บันทึกปลาตาย
  'ff_fish_types'      // ชนิดปลา
];

// =============================================================================
// SMART RENDER SYSTEM (Skip if no changes + Debounce + Batch)
// =============================================================================
// ป้องกันการ render ซ้ำซ้อนและ render เฉพาะเมื่อข้อมูลเปลี่ยนจริง
// =============================================================================

let lastDataFingerprint = null;
let pendingRender = false;
let renderDebounceTimer = null;
const RENDER_DEBOUNCE_MS = 300;

/**
 * สร้าง fingerprint ของข้อมูลทั้งหมดเพื่อเปรียบเทียบ
 * ใช้ simple hash แทน JSON.stringify เพื่อประสิทธิภาพ
 */
const getDataFingerprint = () => {
  let hash = 0;
  for (const key of SYNC_KEYS) {
    const data = localStorage.getItem(key);
    if (data) {
      // Simple hash function (djb2)
      for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
      }
    }
  }
  return hash;
};

/**
 * Smart Render - Skip if data unchanged + Debounce + Batch
 * - เปรียบเทียบ fingerprint ก่อน render
 * - รวม render requests หลายๆ อันเข้าด้วยกัน (batch)
 * - รอ debounce ก่อน render จริง
 */
const smartRender = (force = false) => {
  // Mark that render is pending
  pendingRender = true;

  // Clear existing timer (batch multiple calls)
  if (renderDebounceTimer) {
    clearTimeout(renderDebounceTimer);
  }

  // Debounce - wait before actual render
  renderDebounceTimer = setTimeout(() => {
    pendingRender = false;

    // Skip if data hasn't changed (unless forced)
    const currentFingerprint = getDataFingerprint();
    if (!force && currentFingerprint === lastDataFingerprint) {
      console.log('Render: skipped (no data changes)');
      return;
    }

    // Update fingerprint and render
    lastDataFingerprint = currentFingerprint;
    if (window.render) {
      console.log('Render: executing');
      window.render();
    }
  }, RENDER_DEBOUNCE_MS);
};

/**
 * Force render (bypass fingerprint check)
 * ใช้เมื่อต้องการ render แน่ๆ เช่น เปลี่ยนหน้า
 */
const forceRender = () => smartRender(true);

// Export for use in adapters and index.html
window.smartRender = smartRender;
window.forceRender = forceRender;

// =============================================================================
// SMART MERGE UTILITIES
// =============================================================================
// ฟังก์ชันสำหรับ merge ข้อมูลระหว่าง local และ cloud อย่างชาญฉลาด
// โดยใช้ timestamp เป็นตัวตัดสินว่าข้อมูลไหนใหม่กว่า
// =============================================================================

/**
 * ดึง metadata สำหรับ sync
 * @returns {Object} metadata object ที่เก็บ lastSync และข้อมูลอื่นๆ
 *
 * @example
 * const meta = getSyncMetadata();
 * console.log(meta.lastSync); // "2025-01-15T10:30:00.000Z"
 */
const getSyncMetadata = () => {
  try {
    const data = localStorage.getItem(SYNC_METADATA_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
};

/**
 * บันทึก metadata
 * @param {Object} metadata - ข้อมูล metadata ที่จะบันทึก
 */
const saveSyncMetadata = (metadata) => {
  localStorage.setItem(SYNC_METADATA_KEY, JSON.stringify(metadata));
};

/**
 * ดึง timestamp จาก record เพื่อใช้เปรียบเทียบ
 * @param {Object} record - record ที่ต้องการดึง timestamp
 * @returns {number} Unix timestamp (milliseconds) หรือ 0 ถ้าไม่มี
 *
 * @note ลำดับความสำคัญ: updatedAt > lastUpdated > createdAt > date
 * @note ถ้าไม่มี field ใดเลย จะ return 0 (ถือว่าเก่าที่สุด)
 * @note เพิ่ม _syncSeq เป็น tiebreaker เมื่อ timestamp เท่ากัน (สำหรับ 4+ เครื่อง)
 */
const getRecordTimestamp = (record) => {
  if (!record) return 0;
  // เรียงลำดับความสำคัญ: แก้ไขล่าสุด > อัพเดตล่าสุด > สร้างเมื่อ > วันที่
  const ts = record.updatedAt || record.lastUpdated || record.createdAt || record.date;
  const baseTime = ts ? new Date(ts).getTime() : 0;
  // เพิ่ม _syncSeq เป็น tiebreaker (micro-precision)
  const seq = record._syncSeq || 0;
  return baseTime + (seq * 0.001); // เพิ่มความละเอียดเป็น microseconds
};

/**
 * เพิ่ม sync sequence number ใน record (สำหรับ 4+ เครื่อง)
 * @description ป้องกัน race condition เมื่อ timestamp เท่ากัน
 */
let syncSequence = 0;
const addSyncSequence = (record) => {
  if (!record || typeof record !== 'object') return record;
  syncSequence = (syncSequence + 1) % 1000; // 0-999
  return { ...record, _syncSeq: syncSequence };
};

// =============================================================================
// SOFT DELETE SYSTEM (Best Practice - Flag in Record)
// =============================================================================
/**
 * @description ระบบ Soft Delete แบบ Best Practice
 *              แทนที่จะลบจริง → set deleted: true, deletedAt: timestamp ใน record
 *              ทุกเครื่องเห็น record เดียวกัน (sync ผ่าน cloud)
 *              กรอง deleted=true ออกตอนแสดงผล
 *
 * Record Structure:
 * {
 *   id: "abc123",
 *   name: "ข้อมูล",
 *   deleted: true,        // flag บอกว่าถูกลบ
 *   deletedAt: 1703123456789,  // timestamp ที่ลบ
 *   updatedAt: 1703123456789   // timestamp ล่าสุด
 * }
 */

/**
 * Mark record as deleted (Soft Delete) + Sync to Cloud
 * @param {string} key - localStorage key (เช่น ff_ponds)
 * @param {string} id - record ID ที่ต้องการลบ
 *
 * ขั้นตอน:
 * 1. Set deleted=true, deletedAt=timestamp ใน localStorage
 * 2. Sync deleted record ไป Cloud (ทุกเครื่องจะเห็น deleted flag)
 * 3. Cloud จะเก็บ deleted record ไว้ 30 วัน แล้วลบจริง (hard delete)
 */
const markAsDeleted = (key, id) => {
  try {
    const data = localStorage.getItem(key);
    const items = data ? JSON.parse(data) : [];
    const now = Date.now();

    const updated = items.map(item => {
      if (item && item.id === id) {
        return {
          ...item,
          deleted: true,
          deletedAt: now,
          updatedAt: now
        };
      }
      return item;
    });

    localStorage.setItem(key, JSON.stringify(updated));
    console.log(`Sync: soft deleted ${key}/${id}`);

    // Sync deleted record to cloud immediately
    syncDeletedRecordToCloud(key, id, now);
    
    // Update UI after delete
    smartRender();

  } catch (e) {
    console.error('Soft delete error:', e);
  }
};

// Queue for deleted records to sync (deferred execution)
const deletedSyncQueue = [];

/**
 * Queue deleted record for cloud sync
 * จะถูก process หลังจาก adapters ถูก init
 */
const syncDeletedRecordToCloud = (key, id, deletedAt) => {
  deletedSyncQueue.push({ key, id, deletedAt });
  // Process queue after short delay (ensures adapters are initialized)
  setTimeout(() => processDeletedSyncQueue(), 100);
};

/**
 * Process queued deleted records
 * ใช้ Transaction สำหรับ Firebase เพื่อป้องกัน race condition
 */
const processDeletedSyncQueue = async () => {
  if (deletedSyncQueue.length === 0) return;
  if (typeof adapters === 'undefined') return;

  while (deletedSyncQueue.length > 0) {
    const { key, id, deletedAt } = deletedSyncQueue.shift();

    try {
      const configStr = localStorage.getItem(SYNC_CONFIG_KEY);
      let config;
      try { config = configStr ? JSON.parse(configStr) : null; } catch { config = null; }
      if (!config || !config.provider) continue;

      const adapter = adapters[config.provider];
      if (!adapter) continue;

      const dbKey = key.replace('ff_', '');

      if (config.provider === 'firebase' && adapter.db) {
        // Firebase: ใช้ Transaction เพื่อ atomic update
        const ref = adapter.db.ref(dbKey);
        await ref.transaction((currentData) => {
          if (!currentData) return currentData;
          const items = Array.isArray(currentData) ? currentData :
            (currentData && typeof currentData === 'object' ? Object.values(currentData) : []);
          return items.map(item => {
            if (item && item.id === id) {
              return { ...item, deleted: true, deletedAt, updatedAt: deletedAt };
            }
            return item;
          });
        });
        console.log(`Sync: deleted ${key}/${id} synced to Firebase with Transaction`);

      } else if (config.provider === 'firestore' && adapter.db) {
        // Firestore: ใช้ Transaction
        const docRef = adapter.db.collection('fish_farm').doc(key);
        await adapter.db.runTransaction(async (transaction) => {
          const doc = await transaction.get(docRef);
          if (doc.exists) {
            const data = doc.data().data || [];
            const updated = data.map(item => {
              if (item && item.id === id) {
                return { ...item, deleted: true, deletedAt, updatedAt: deletedAt };
              }
              return item;
            });
            transaction.update(docRef, { data: updated, updatedAt: new Date() });
          }
        });
        console.log(`Sync: deleted ${key}/${id} synced to Firestore with Transaction`);

      } else if (config.provider === 'supabase' && adapter.client) {
        // Supabase: ดึงข้อมูลมา update
        const { data: existing } = await adapter.client
          .from('fish_farm_sync')
          .select('data')
          .eq('key', key)
          .single();

        if (existing && existing.data) {
          const updated = existing.data.map(item => {
            if (item && item.id === id) {
              return { ...item, deleted: true, deletedAt, updatedAt: deletedAt };
            }
            return item;
          });
          await adapter.client
            .from('fish_farm_sync')
            .update({ data: updated, updated_at: new Date().toISOString() })
            .eq('key', key);
        }
        console.log(`Sync: deleted ${key}/${id} synced to Supabase`);
      }
    } catch (e) {
      console.error('Sync delete to cloud error:', e);
    }
  }
};

/**
 * กรอง records ที่ถูกลบออก (ใช้ตอนแสดงผล)
 * @param {Array} items - array ของ records
 * @returns {Array} records ที่ไม่ได้ถูกลบ
 */
const _filterDeleted = (items) => {
  if (!Array.isArray(items)) return [];
  return items.filter(item => !item?.deleted);
};

/**
 * Permanently delete old soft-deleted records (cleanup)
 * ลบ records ที่ถูก soft delete เกิน 30 วัน
 */
const cleanupDeletedRecords = () => {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

  SYNC_KEYS.forEach(key => {
    try {
      const data = localStorage.getItem(key);
      if (!data) return;

      const items = JSON.parse(data);
      const cleaned = items.filter(item => {
        // เก็บ record ที่ไม่ได้ลบ หรือลบไม่เกิน 30 วัน
        if (!item?.deleted) return true;
        return (item.deletedAt || 0) > thirtyDaysAgo;
      });

      if (cleaned.length !== items.length) {
        localStorage.setItem(key, JSON.stringify(cleaned));
        console.log(`Sync: cleaned up ${items.length - cleaned.length} old deleted records from ${key}`);
      }
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  });
};

// Export สำหรับ index.html ใช้เมื่อลบข้อมูล
window.markAsDeleted = markAsDeleted;
// filterDeleted is defined in index.html

/**
 * แปลง Firebase Object เป็น Array
 * Firebase เก็บ Array เป็น Object ที่มี index เป็น key
 * เช่น { "0": {...}, "1": {...} } → [{...}, {...}]
 */
const toArray = (data) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  // Firebase Object → Array (เอาเฉพาะ values ที่เป็น object)
  return Object.values(data).filter(item => item && typeof item === 'object');
};

/**
 * เปรียบเทียบและ merge 2 arrays โดยใช้ timestamp
 * @param {string} key - localStorage key (เช่น ff_ponds) สำหรับเช็ค deleted IDs
 * @param {Array} localData - ข้อมูลจาก localStorage
 * @param {Array} cloudData - ข้อมูลจาก cloud
 * @returns {Array} ข้อมูลที่ merge แล้ว
 *
 * @algorithm (Soft Delete Flag in Record)
 * 1. ใส่ข้อมูล cloud ทั้งหมดลง Map
 * 2. วนลูป local data:
 *    - ถ้าไม่มีใน cloud → เพิ่มเข้าไป (ข้อมูลใหม่จาก local)
 *    - ถ้ามีใน cloud → เปรียบเทียบ timestamp:
 *      - local ใหม่กว่า → ใช้ local
 *      - cloud ใหม่กว่าหรือเท่ากัน → ใช้ cloud
 * 3. Return ข้อมูลทั้งหมดจาก Map (รวม deleted records ด้วย)
 * 4. กรอง deleted=true ออกตอนแสดงผลใน UI
 */
const mergeArraysByTimestamp = (key, localData, cloudData) => {
  // ใช้ toArray เพื่อแปลง Firebase Object เป็น Array
  localData = toArray(localData);
  cloudData = toArray(cloudData);

  const merged = new Map();

  // เพิ่มข้อมูล cloud ทั้งหมด (รวม deleted records)
  cloudData.forEach(item => {
    if (item && item.id) {
      merged.set(item.id, { ...item, _source: 'cloud' });
    }
  });

  // เปรียบเทียบกับ local และเลือกอันใหม่กว่า
  const myDeviceId = getDeviceId();
  localData.forEach(item => {
    if (item && item.id) {
      const existing = merged.get(item.id);
      if (!existing) {
        // ไม่มีใน cloud = ข้อมูลใหม่จาก local
        merged.set(item.id, { ...item, _source: 'local', _deviceId: myDeviceId });
      } else {
        // มีทั้งสองที่ = เปรียบเทียบ timestamp (รวม deletedAt ด้วย)
        const localTs = Math.max(getRecordTimestamp(item), item.deletedAt || 0);
        const cloudTs = Math.max(getRecordTimestamp(existing), existing.deletedAt || 0);

        if (localTs > cloudTs) {
          // local ใหม่กว่า (รวมถึงกรณี local ลบล่าสุด)
          merged.set(item.id, { ...item, _source: 'local', _deviceId: myDeviceId });
        } else if (localTs === cloudTs) {
          // timestamp เท่ากัน - ใช้ device ID เป็น tiebreaker
          if (item._deviceId === myDeviceId || existing._deviceId !== myDeviceId) {
            merged.set(item.id, { ...item, _source: 'local', _deviceId: myDeviceId });
          }
        }
        // ถ้า cloud ใหม่กว่า ใช้ cloud (รวมถึงกรณี cloud ลบล่าสุด)
      }
    }
  });

  // ลบ internal fields ออกก่อน return (เก็บแค่ข้อมูลจริง)
  return Array.from(merged.values()).map(item => {
    const { _source, _deviceId, _syncSeq, ...rest } = item;
    return rest;
  });
};

/**
 * Smart sync - เปรียบเทียบและ merge ข้อมูลก่อน sync
 * รองรับ soft delete flag (deleted records จะ sync ไปทุกเครื่อง)
 */
const smartMergeData = (key, localData, cloudData) => {
  // แปลง Object เป็น Array ก่อน (Firebase ส่ง Object มา)
  const localArr = toArray(localData);
  const cloudArr = toArray(cloudData);

  // ถ้าไม่มีข้อมูล cloud ใช้ local
  if (cloudArr.length === 0) {
    return { merged: localArr, hasChanges: localArr.length > 0 };
  }

  // ถ้าไม่มีข้อมูล local ใช้ cloud (รวม deleted records)
  if (localArr.length === 0) {
    return { merged: cloudArr, hasChanges: cloudArr.length > 0 };
  }

  // Merge arrays by timestamp (รวม deleted records ด้วย)
  const merged = mergeArraysByTimestamp(key, localArr, cloudArr);

  // เช็คว่ามีการเปลี่ยนแปลงจาก local หรือไม่ (เทียบ Array กับ Array เท่านั้น)
  const mergedStr = JSON.stringify(merged);
  const localStr = JSON.stringify(localArr);
  const hasChanges = mergedStr !== localStr;

  return { merged, hasChanges };
};

// =============================================================================
// PROVIDER DEFINITIONS
// =============================================================================
/**
 * @description กำหนด Cloud Database Providers ที่รองรับ
 *              แต่ละ provider มีการตั้งค่าและ SDK ที่แตกต่างกัน
 *
 * @property {string} id - รหัส provider (ใช้ใน code)
 * @property {string} name - ชื่อแสดงผล
 * @property {string} icon - emoji icon
 * @property {string} description - คำอธิบายสั้นๆ
 * @property {Array} fields - ฟิลด์การตั้งค่าที่ต้องกรอก
 * @property {Object|null} defaultConfig - ค่าเริ่มต้น (null = ต้องกรอกเอง)
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Provider Comparison:                                                    │
 * ├─────────────┬───────────────┬──────────────┬────────────────────────────┤
 * │ Provider    │ Realtime Sync │ Free Tier    │ Best For                   │
 * ├─────────────┼───────────────┼──────────────┼────────────────────────────┤
 * │ Firebase    │ ✅ Yes        │ 1GB, 10K/day │ Simple apps, beginners     │
 * │ Firestore   │ ✅ Yes        │ 1GB, 50K/day │ Complex queries            │
 * │ Supabase    │ ✅ Yes        │ 500MB        │ PostgreSQL, auth built-in  │
 * │ PocketBase  │ ✅ Yes        │ Self-hosted  │ Full control, self-hosted  │
 * │ MongoDB     │ ❌ Polling    │ 512MB        │ Document-based, scalable   │
 * │ Sheets      │ ❌ Polling    │ Unlimited    │ Simple data, non-technical │
 * │ REST API    │ ❌ Polling    │ Depends      │ Custom backends            │
 * └─────────────┴───────────────┴──────────────┴────────────────────────────┘
 */
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

// =============================================================================
// STATE VARIABLES
// =============================================================================
/**
 * @description ตัวแปรสถานะต่างๆ สำหรับจัดการ sync
 *
 * สถานะการทำงาน:
 * - currentProvider: provider ที่กำลังใช้ (firebase, supabase, etc.)
 * - providerInstance: instance ของ adapter ที่กำลังใช้
 * - isOnline: สถานะการเชื่อมต่อ cloud
 * - isSyncing: กำลัง sync อยู่หรือไม่
 *
 * ระบบป้องกัน:
 * - syncLock: Mutex lock ป้องกัน sync พร้อมกัน
 * - lastSyncTime: เวลา sync ล่าสุด (ใช้กับ cooldown)
 * - isProcessingListener: ป้องกัน infinite loop จาก listener
 */
let currentProvider = null;          // Provider ID ที่ใช้งานอยู่ (string)
let providerInstance = null;         // Instance ของ adapter object
let isOnline = false;                // true = เชื่อมต่อ cloud สำเร็จ
let isSyncing = false;               // true = กำลัง sync อยู่ (แสดง animation)
let syncListeners = [];              // Array ของ unsubscribe functions

/**
 * Mutex Lock System - ป้องกัน race condition
 *
 * ปัญหา: ถ้า sync หลายครั้งพร้อมกัน อาจเกิดข้อมูลเขียนทับกัน
 * วิธีแก้: ใช้ lock + cooldown
 *
 * Flow:
 * 1. acquireSyncLock() → ขอ lock ก่อน sync
 * 2. ถ้าได้ lock → ทำ sync
 * 3. releaseSyncLock() → ปล่อย lock หลัง sync เสร็จ
 * 4. cooldown 1 วินาที ก่อนอนุญาต sync ครั้งต่อไป
 */
let syncLock = false;                // true = มีคนกำลัง sync อยู่
let lastSyncTime = 0;                // Unix timestamp ของ sync ล่าสุด
let syncRetryCount = 0;              // จำนวนครั้งที่ลอง retry
let pendingSyncRequest = false;     // มี sync request ที่รอคิวอยู่ (สำหรับ 4+ เครื่อง)

/**
 * ค่าคงที่สำหรับระบบ sync
 * @constant {number} MAX_SYNC_RETRIES - จำนวนครั้งสูงสุดที่จะลอง sync ใหม่เมื่อ error
 * @constant {number} SYNC_COOLDOWN_MS - เวลาขั้นต่ำระหว่าง sync (milliseconds)
 * @constant {number} SYNC_DEBOUNCE_MS - เวลารอก่อน sync กลับไป cloud (สำหรับหลายเครื่อง)
 *
 * @note ปรับค่าสำหรับ 4 เครื่องซิงค์พร้อมกัน:
 *       - Cooldown เพิ่มเป็น 2 วินาที (เดิม 1 วินาที)
 *       - Debounce เพิ่มเป็น 1 วินาที (เดิม 500ms)
 */
const MAX_SYNC_RETRIES = 3;          // ลอง sync ใหม่ได้สูงสุด 3 ครั้ง
const SYNC_COOLDOWN_MS = 2000;       // รออย่างน้อย 2 วินาทีระหว่าง sync (เพิ่มจาก 1 วินาที)
const SYNC_DEBOUNCE_MS = 1000;       // รอ 1 วินาทีก่อน sync กลับ cloud (เพิ่มจาก 500ms)

/**
 * Device ID - ระบุตัวตนของเครื่อง
 * @description ใช้แยกแยะว่าข้อมูลมาจากเครื่องไหน
 *              ช่วยป้องกันการ overwrite ตัวเองเมื่อ 4+ เครื่องซิงค์
 */
const DEVICE_ID_KEY = 'ff_device_id';
const getDeviceId = () => {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    // สร้าง Device ID ใหม่: timestamp + random
    deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

/**
 * ป้องกัน Infinite Loop ใน Realtime Listeners
 *
 * ปัญหา:
 * 1. Cloud เปลี่ยน → trigger listener → อัพเดต local
 * 2. อัพเดต local → trigger sync → อัพเดต cloud
 * 3. Cloud เปลี่ยน → trigger listener → วนลูปไม่สิ้นสุด!
 *
 * วิธีแก้:
 * - ตั้ง flag ก่อนเขียน cloud
 * - ถ้า flag = true → ข้าม listener
 */
let isProcessingListener = false;    // true = กำลังประมวลผล listener อยู่

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Safe JSON Parse - แปลง JSON string อย่างปลอดภัย
 *
 * @description ป้องกัน error เมื่อ JSON ไม่ถูกต้อง (corrupt, empty, null)
 *              ซึ่งอาจเกิดจาก:
 *              - localStorage เสียหาย
 *              - ข้อมูลจาก cloud ไม่สมบูรณ์
 *              - Network ขาดระหว่างรับข้อมูล
 *
 * @param {string} str - JSON string ที่จะแปลง
 * @param {*} defaultValue - ค่าเริ่มต้นถ้าแปลงไม่ได้ (default: [])
 * @returns {*} ข้อมูลที่แปลงแล้ว หรือ defaultValue ถ้า error
 *
 * @example
 * safeJSONParse('{"name":"test"}')     // { name: 'test' }
 * safeJSONParse('invalid json')         // []
 * safeJSONParse(null, {})               // {}
 * safeJSONParse('', [])                 // []
 */
const safeJSONParse = (str, defaultValue = []) => {
  if (!str) return defaultValue;
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn('JSON parse error:', e);
    return defaultValue;
  }
};

/**
 * XSS Prevention - ป้องกัน Cross-Site Scripting
 *
 * @description แปลง HTML special characters เป็น entities
 *              ป้องกันการ inject script ผ่าน user input
 *
 *              ⚠️ ต้องใช้ทุกครั้งที่แสดง user input ใน HTML!
 *
 * @param {string} str - string ที่อาจมี HTML
 * @returns {string} safe string ที่แสดงได้อย่างปลอดภัย
 *
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 *
 * escapeHtml('Tom & Jerry')  // 'Tom &amp; Jerry'
 * escapeHtml("It's good")    // "It&#039;s good"
 *
 * @security CRITICAL - ใช้กับทุก dynamic content ใน modal HTML
 */
const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')   // & → &amp;   (ต้องทำก่อน!)
    .replace(/</g, '&lt;')    // < → &lt;
    .replace(/>/g, '&gt;')    // > → &gt;
    .replace(/"/g, '&quot;')  // " → &quot;
    .replace(/'/g, '&#039;'); // ' → &#039;
};

// =============================================================================
// SYNC LOCK MANAGEMENT (Mutex Pattern)
// =============================================================================

/**
 * ขอ Sync Lock (Acquire)
 *
 * @description ก่อน sync ต้องขอ lock ก่อนเสมอ
 *              จะได้ lock เมื่อ:
 *              1. ไม่มีใครถือ lock อยู่ (syncLock = false)
 *              2. ผ่าน cooldown แล้ว (> 1 วินาทีจาก sync ก่อนหน้า)
 *
 * @returns {boolean} true = ได้ lock, false = ไม่ได้ (มีคนอื่นกำลัง sync)
 *
 * @example
 * if (!acquireSyncLock()) {
 *   console.log('Sync in progress, skipping...');
 *   return;
 * }
 * // ทำ sync...
 * releaseSyncLock();
 */
const acquireSyncLock = (queueIfBusy = true) => {
  // เช็คว่ามีคนถือ lock อยู่ไหม
  if (syncLock) {
    // Queue request ถ้า lock ไม่ว่าง (สำหรับ 4+ เครื่อง)
    if (queueIfBusy) {
      pendingSyncRequest = true;
      console.log('Sync: request queued, will run after current sync completes');
    }
    return false;
  }

  // เช็ค cooldown (ป้องกัน sync ถี่เกินไป)
  const now = Date.now();
  if (now - lastSyncTime < SYNC_COOLDOWN_MS) {
    // Queue request ถ้ายังอยู่ใน cooldown
    if (queueIfBusy) {
      pendingSyncRequest = true;
      console.log('Sync: request queued during cooldown period');
    }
    return false;
  }

  // ได้ lock!
  syncLock = true;
  return true;
};

/**
 * ปล่อย Sync Lock (Release)
 *
 * @description เรียกหลัง sync เสร็จ (ทั้งสำเร็จและ error)
 *              ⚠️ ต้องเรียกเสมอ ไม่งั้น lock จะค้างตลอด!
 *
 * @example
 * try {
 *   await doSync();
 * } finally {
 *   releaseSyncLock(); // ต้องเรียกแม้จะ error
 * }
 */
const releaseSyncLock = () => {
  syncLock = false;
  lastSyncTime = Date.now(); // บันทึกเวลาเพื่อ cooldown

  // ประมวลผล pending sync request (สำหรับ 4+ เครื่อง)
  // ถ้ามี request รออยู่ จะเริ่ม sync หลัง cooldown
  if (pendingSyncRequest) {
    pendingSyncRequest = false;
    setTimeout(() => {
      if (providerInstance && providerInstance.smartSync) {
        providerInstance.smartSync();
      }
    }, SYNC_COOLDOWN_MS + 500); // รอ cooldown + buffer
  }
};

// =============================================================================
// PROVIDER ADAPTERS
// =============================================================================
/**
 * @description Adapter Pattern สำหรับ Cloud Providers ต่างๆ
 *
 * แต่ละ adapter ต้อง implement methods เหล่านี้:
 * - init(config)       : เริ่มต้นการเชื่อมต่อ
 * - syncToCloud()      : ส่งข้อมูลจาก local ไป cloud
 * - syncFromCloud()    : ดึงข้อมูลจาก cloud มา local
 * - setupListeners()   : ตั้ง realtime listeners (ถ้ามี)
 * - set(key, data)     : บันทึกข้อมูลเฉพาะ key
 * - destroy()          : cleanup เมื่อเปลี่ยน provider
 *
 * Adapter Interface:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  adapter.init(config)                                                   │
 * │    ↓ เชื่อมต่อสำเร็จ                                                    │
 * │  adapter.setupListeners(onChange)  ← ตั้ง realtime listener            │
 * │    ↓                                                                    │
 * │  adapter.syncFromCloud()           ← ดึงข้อมูลล่าสุดจาก cloud          │
 * │    ↓ ใช้งานปกติ                                                         │
 * │  adapter.syncToCloud()             ← sync เมื่อ local เปลี่ยน          │
 * │    ↓ ผู้ใช้เปลี่ยน provider                                            │
 * │  adapter.destroy()                 ← cleanup                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
const adapters = {
  // =========================================================================
  // FIREBASE REALTIME DATABASE ADAPTER
  // =========================================================================
  /**
   * Firebase Realtime Database Adapter
   *
   * @description Provider หลักที่ใช้เป็น default
   *              รองรับ realtime sync อัตโนมัติ
   *
   * Features:
   * - ✅ Realtime listeners (ข้อมูลอัพเดตทันที)
   * - ✅ Offline support (Firebase SDK จัดการให้)
   * - ✅ Smart merge (ป้องกันข้อมูลหาย)
   * - ✅ Connection monitoring
   * - ✅ Auto-reconnect
   *
   * Data Structure in Firebase:
   * /
   * ├── ponds/           ← ff_ponds
   * ├── cycles/          ← ff_cycles
   * ├── feeds/           ← ff_feeds
   * └── ...
   */
  firebase: {
    app: null,      // Firebase App instance
    db: null,       // Firebase Database instance

    connectionListener: null, // เก็บ reference เพื่อ cleanup (ป้องกัน memory leak)

    /**
     * เริ่มต้นการเชื่อมต่อ Firebase
     *
     * @param {Object} config - Firebase configuration
     * @param {string} config.apiKey - API Key
     * @param {string} config.databaseURL - Realtime Database URL (required)
     * @param {string} config.projectId - Project ID
     * @returns {Promise<boolean>} true = สำเร็จ, false = ล้มเหลว
     */
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
        // Fix: Check if Firebase is already initialized globally
        if (!this.app) {
          if (firebase.apps && firebase.apps.length > 0) {
            // Use existing app
            this.app = firebase.apps[0];
          } else {
            this.app = firebase.initializeApp(config);
          }
          this.db = firebase.database();
        }

        // Remove old connection listener if exists (prevent memory leak)
        if (this.connectionListener) {
          this.db.ref('.info/connected').off('value', this.connectionListener);
        }

        // Monitor connection
        this.connectionListener = (snap) => {
          const wasOnline = isOnline;
          isOnline = snap.val() === true;
          updateSyncStatus();

          if (isOnline && !wasOnline) {
            showToast('เชื่อมต่อ Cloud สำเร็จ', 'success');
            // ใช้ smartSync พร้อม cooldown protection
            if (!syncLock) {
              this.smartSync();
            }
          }
        };
        this.db.ref('.info/connected').on('value', this.connectionListener);

        return true;
      } catch (e) {
        console.error('Firebase init error:', e);
        return false;
      }
    },

    /**
     * Smart Sync - ดึงข้อมูล cloud มา merge กับ local แล้ว sync กลับ
     * ป้องกันการเขียนทับข้อมูลที่ใหม่กว่า
     * พร้อม mutex lock และ retry mechanism
     */
    async smartSync(retryCount = 0) {
      if (!this.db || !isOnline) return;

      // Acquire sync lock (mutex)
      if (!acquireSyncLock()) {
        console.log('Firebase: sync already in progress, skipping');
        return;
      }

      isSyncing = true;
      updateSyncStatus();

      try {
        // 1. ดึงข้อมูลจาก cloud
        const snapshot = await this.db.ref().once('value');
        const cloudData = snapshot.val() || {};

        const updates = {};
        let hasAnyChanges = false;

        // 2. Merge แต่ละ key (ใช้ safeJSONParse)
        for (const key of SYNC_KEYS) {
          const dbKey = key.replace('ff_', '');
          const localRaw = localStorage.getItem(key);
          const localData = safeJSONParse(localRaw, []);
          const cloudKeyData = cloudData[dbKey] || [];

          // ใช้ smart merge
          const { merged, hasChanges } = smartMergeData(key, localData, cloudKeyData);

          if (hasChanges) {
            hasAnyChanges = true;
            // อัพเดต local storage
            localStorage.setItem(key, JSON.stringify(merged));
            // เตรียม update ไป cloud
            updates[dbKey] = merged;
          }
        }

        // 3. อัพเดต cloud ถ้ามีการเปลี่ยนแปลง
        if (hasAnyChanges && Object.keys(updates).length > 0) {
          await this.db.ref().update(updates);
          console.log('Firebase: smart sync completed with changes');
        } else {
          console.log('Firebase: smart sync - no changes needed');
        }

        // 4. บันทึกเวลา sync ล่าสุด พร้อม device ID
        const metadata = getSyncMetadata();
        metadata.lastSync = new Date().toISOString();
        metadata.deviceId = getDeviceId();
        metadata.syncCount = (metadata.syncCount || 0) + 1;
        saveSyncMetadata(metadata);

        // Reset retry count on success
        syncRetryCount = 0;

      } catch (e) {
        console.error('Firebase smart sync error:', e);

        // Retry mechanism
        if (retryCount < MAX_SYNC_RETRIES) {
          console.log(`Firebase: retrying sync (${retryCount + 1}/${MAX_SYNC_RETRIES})`);
          releaseSyncLock();
          setTimeout(() => this.smartSync(retryCount + 1), 2000 * (retryCount + 1));
          return;
        }
      }

      isSyncing = false;
      releaseSyncLock();
      updateSyncStatus();
    },

    async syncToCloud() {
      if (!this.db || !isOnline) return;

      try {
        // ใช้ smart sync แทนการเขียนทับโดยตรง
        await this.smartSync();
      } catch (e) {
        console.error('Firebase sync error:', e);
      }
    },

    async syncFromCloud() {
      if (!this.db) return;

      try {
        // ใช้ smart sync แทนการเขียนทับโดยตรง
        await this.smartSync();
      } catch (e) {
        console.error('Firebase sync error:', e);
      }
    },

    setupListeners(onChange) {
      if (!this.db) return;

      // Debounce timer for sync back to cloud (prevent rapid fire)
      let syncBackTimer = null;
      const pendingSyncBack = new Map();

      SYNC_KEYS.forEach(key => {
        const dbKey = key.replace('ff_', '');
        const ref = this.db.ref(dbKey);

        const listener = ref.on('value', (snapshot) => {
          // Prevent infinite loop: skip if we're currently writing to cloud
          if (isProcessingListener) {
            return;
          }

          const cloudData = snapshot.val();
          console.log(`Firebase: received update for ${dbKey}`, cloudData !== null ? "with data" : "empty");
          if (cloudData !== null) {
            // ใช้ safeJSONParse แทน JSON.parse
            const localRaw = localStorage.getItem(key);
            const localData = safeJSONParse(localRaw, []);

            const { merged, hasChanges } = smartMergeData(key, localData, cloudData);
            console.log(`Firebase listener [${key}]: hasChanges=`, hasChanges, "local:", localData.length, "cloud:", toArray(cloudData).length);

            if (hasChanges) {
              localStorage.setItem(key, JSON.stringify(merged));

              // ถ้า local มีข้อมูลใหม่กว่า ต้อง sync กลับไป cloud
              // แปลง cloudData เป็น Array ก่อนเทียบ (ป้องกัน loop)
              const cloudArr = toArray(cloudData);
              const cloudArrStr = JSON.stringify(cloudArr);
              const mergedStr = JSON.stringify(merged);

              // เทียบ Array กับ Array เท่านั้น
              if (cloudArrStr !== mergedStr) {
                // Queue sync back with debounce to prevent rapid writes
                pendingSyncBack.set(dbKey, merged);

                if (syncBackTimer) clearTimeout(syncBackTimer);
                syncBackTimer = setTimeout(() => {
                  isProcessingListener = true;
                  const updates = Object.fromEntries(pendingSyncBack);
                  pendingSyncBack.clear();

                  this.db.ref().update(updates)
                    .catch(e => console.error('Firebase: error syncing back to cloud', e))
                    .finally(() => {
                      isProcessingListener = false;
                    });
                }, SYNC_DEBOUNCE_MS); // รอก่อน sync กลับ (สำหรับ 4+ เครื่อง)
              }


              smartRender();
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
      // Clean up connection listener (prevent memory leak)
      if (this.db && this.connectionListener) {
        this.db.ref('.info/connected').off('value', this.connectionListener);
        this.connectionListener = null;
      }
      syncListeners.forEach(unsub => unsub());
      syncListeners = [];
      this.app = null;
      this.db = null;
    }
  },

  // =========================================================================
  // FIRESTORE ADAPTER
  // =========================================================================
  /**
   * Cloud Firestore Adapter
   *
   * @description Firebase Firestore (NoSQL Document Database)
   *              เหมาะสำหรับ queries ที่ซับซ้อน
   *
   * Features:
   * - ✅ Realtime listeners
   * - ✅ Complex queries (where, orderBy, limit)
   * - ✅ Offline support
   * - ❌ ยังไม่ได้ใช้ smart merge (TODO)
   *
   * Data Structure:
   * /fish_farm (collection)
   *   ├── ff_ponds (document) → { data: [...], updatedAt: ... }
   *   ├── ff_cycles (document)
   *   └── ...
   *
   * @note ต้องเปิด Firestore ใน Firebase Console ก่อน
   */
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

    /**
     * Smart Sync - ดึงข้อมูล cloud มา merge กับ local แล้ว sync กลับ
     * ใช้ Transaction เพื่อป้องกัน race condition
     */
    async smartSync(retryCount = 0) {
      if (!this.db) return;

      if (!acquireSyncLock()) {
        console.log('Firestore: sync already in progress, skipping');
        return;
      }

      isSyncing = true;
      updateSyncStatus();

      try {
        const snapshot = await this.db.collection('fish_farm').get();
        const cloudData = {};
        snapshot.forEach(doc => {
          if (SYNC_KEYS.includes(doc.id)) {
            cloudData[doc.id] = doc.data().data || [];
          }
        });

        const batch = this.db.batch();
        let hasAnyChanges = false;

        for (const key of SYNC_KEYS) {
          const localRaw = localStorage.getItem(key);
          const localData = safeJSONParse(localRaw, []);
          const cloudKeyData = cloudData[key] || [];

          const { merged, hasChanges } = smartMergeData(key, localData, cloudKeyData);

          if (hasChanges) {
            hasAnyChanges = true;
            localStorage.setItem(key, JSON.stringify(merged));
            const docRef = this.db.collection('fish_farm').doc(key);
            batch.set(docRef, { data: merged, updatedAt: new Date() });
          }
        }

        if (hasAnyChanges) {
          await batch.commit();
          console.log('Firestore: smart sync completed with changes');
        } else {
          console.log('Firestore: smart sync - no changes needed');
        }

        const metadata = getSyncMetadata();
        metadata.lastSync = new Date().toISOString();
        metadata.deviceId = getDeviceId();
        saveSyncMetadata(metadata);

      } catch (e) {
        console.error('Firestore smart sync error:', e);
        if (retryCount < MAX_SYNC_RETRIES) {
          releaseSyncLock();
          setTimeout(() => this.smartSync(retryCount + 1), 2000 * (retryCount + 1));
          return;
        }
      }

      isSyncing = false;
      releaseSyncLock();
      updateSyncStatus();
    },

    async syncToCloud() {
      if (!this.db) return;
      await this.smartSync();
    },

    async syncFromCloud() {
      if (!this.db) return;
      await this.smartSync();
    },

    setupListeners(onChange) {
      if (!this.db) return;

      let syncBackTimer = null;
      const pendingSyncBack = new Map();

      const unsubscribe = this.db.collection('fish_farm').onSnapshot(snapshot => {
        if (isProcessingListener) return;

        snapshot.docChanges().forEach(change => {
          if (change.type === 'modified' || change.type === 'added') {
            const key = change.doc.id;
            if (SYNC_KEYS.includes(key) && change.doc.data().data) {
              const cloudData = change.doc.data().data;
              const localRaw = localStorage.getItem(key);
              const localData = safeJSONParse(localRaw, []);

              const { merged, hasChanges } = smartMergeData(key, localData, cloudData);
            console.log(`Firebase listener [${key}]: hasChanges=`, hasChanges, "local:", localData.length, "cloud:", toArray(cloudData).length);

              if (hasChanges) {
                localStorage.setItem(key, JSON.stringify(merged));

                // Sync back if local has newer data
                const cloudStr = JSON.stringify(cloudData);
                const mergedStr = JSON.stringify(merged);
                if (cloudStr !== mergedStr) {
                  pendingSyncBack.set(key, merged);

                  if (syncBackTimer) clearTimeout(syncBackTimer);
                  syncBackTimer = setTimeout(() => {
                    isProcessingListener = true;
                    const batch = this.db.batch();
                    pendingSyncBack.forEach((data, k) => {
                      const docRef = this.db.collection('fish_farm').doc(k);
                      batch.set(docRef, { data, updatedAt: new Date() });
                    });
                    pendingSyncBack.clear();
                    batch.commit()
                      .catch(e => console.error('Firestore: error syncing back', e))
                      .finally(() => { isProcessingListener = false; });
                  }, SYNC_DEBOUNCE_MS);
                }

                smartRender();

              }
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

  // =========================================================================
  // SUPABASE ADAPTER
  // =========================================================================
  /**
   * Supabase Adapter
   *
   * @description PostgreSQL + Realtime + Authentication
   *              Open-source alternative to Firebase
   *
   * Features:
   * - ✅ Realtime listeners (Postgres Changes)
   * - ✅ PostgreSQL database
   * - ✅ Row Level Security (RLS)
   * - ❌ ยังไม่ได้ใช้ smart merge (TODO)
   *
   * Required Table:
   * ```sql
   * CREATE TABLE fish_farm_sync (
   *   key TEXT PRIMARY KEY,
   *   data JSONB,
   *   updated_at TIMESTAMPTZ
   * );
   * ```
   *
   * @note ต้องเปิด Realtime ใน Supabase Dashboard
   */
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

    /**
     * Smart Sync - ดึงข้อมูล cloud มา merge กับ local แล้ว sync กลับ
     */
    async smartSync(retryCount = 0) {
      if (!this.client) return;

      if (!acquireSyncLock()) {
        console.log('Supabase: sync already in progress, skipping');
        return;
      }

      isSyncing = true;
      updateSyncStatus();

      try {
        // ดึงข้อมูลจาก cloud
        const { data: cloudRows, error } = await this.client
          .from('fish_farm_sync')
          .select('*');

        if (error) throw error;

        const cloudData = {};
        cloudRows?.forEach(row => {
          if (SYNC_KEYS.includes(row.key)) {
            cloudData[row.key] = row.data || [];
          }
        });

        let hasAnyChanges = false;

        for (const key of SYNC_KEYS) {
          const localRaw = localStorage.getItem(key);
          const localData = safeJSONParse(localRaw, []);
          const cloudKeyData = cloudData[key] || [];

          const { merged, hasChanges } = smartMergeData(key, localData, cloudKeyData);

          if (hasChanges) {
            hasAnyChanges = true;
            localStorage.setItem(key, JSON.stringify(merged));

            // อัพเดต cloud
            await this.client
              .from('fish_farm_sync')
              .upsert({
                key,
                data: merged,
                updated_at: new Date().toISOString()
              }, { onConflict: 'key' });
          }
        }

        if (hasAnyChanges) {
          console.log('Supabase: smart sync completed with changes');
        } else {
          console.log('Supabase: smart sync - no changes needed');
        }

        const metadata = getSyncMetadata();
        metadata.lastSync = new Date().toISOString();
        metadata.deviceId = getDeviceId();
        saveSyncMetadata(metadata);

      } catch (e) {
        console.error('Supabase smart sync error:', e);
        if (retryCount < MAX_SYNC_RETRIES) {
          releaseSyncLock();
          setTimeout(() => this.smartSync(retryCount + 1), 2000 * (retryCount + 1));
          return;
        }
      }

      isSyncing = false;
      releaseSyncLock();
      updateSyncStatus();
    },

    async syncToCloud() {
      if (!this.client) return;
      await this.smartSync();
    },

    async syncFromCloud() {
      if (!this.client) return;
      await this.smartSync();
    },

    setupListeners(onChange) {
      if (!this.client) return;

      let syncBackTimer = null;

      const channel = this.client
        .channel('fish_farm_changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'fish_farm_sync' },
          async (payload) => {
            if (isProcessingListener) return;

            if (payload.new && SYNC_KEYS.includes(payload.new.key)) {
              const key = payload.new.key;
              const cloudData = payload.new.data || [];
              const localRaw = localStorage.getItem(key);
              const localData = safeJSONParse(localRaw, []);

              const { merged, hasChanges } = smartMergeData(key, localData, cloudData);
            console.log(`Firebase listener [${key}]: hasChanges=`, hasChanges, "local:", localData.length, "cloud:", toArray(cloudData).length);

              if (hasChanges) {
                localStorage.setItem(key, JSON.stringify(merged));

                // Sync back if local has newer data
                const cloudStr = JSON.stringify(cloudData);
                const mergedStr = JSON.stringify(merged);
                if (cloudStr !== mergedStr) {
                  if (syncBackTimer) clearTimeout(syncBackTimer);
                  syncBackTimer = setTimeout(async () => {
                    isProcessingListener = true;
                    try {
                      await this.client
                        .from('fish_farm_sync')
                        .upsert({
                          key,
                          data: merged,
                          updated_at: new Date().toISOString()
                        }, { onConflict: 'key' });
                    } catch (e) {
                      console.error('Supabase: error syncing back', e);
                    }
                    isProcessingListener = false;
                  }, SYNC_DEBOUNCE_MS);
                }


                smartRender();
              }
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

  // =========================================================================
  // POCKETBASE ADAPTER
  // =========================================================================
  /**
   * PocketBase Adapter
   *
   * @description Self-hosted Backend (Go)
   *              เหมาะสำหรับผู้ที่ต้องการควบคุม data ทั้งหมด
   *
   * Features:
   * - ✅ Realtime subscriptions
   * - ✅ Self-hosted (ข้อมูลอยู่ใน server ตัวเอง)
   * - ✅ REST + Realtime API
   * - ❌ ยังไม่ได้ใช้ smart merge (TODO)
   *
   * Collection Schema:
   * - key: text (unique)
   * - data: json
   *
   * @see https://pocketbase.io
   */
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
          smartRender();

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

  // =========================================================================
  // MONGODB ATLAS DATA API ADAPTER
  // =========================================================================
  /**
   * MongoDB Atlas Data API Adapter
   *
   * @description MongoDB Atlas ผ่าน Data API (REST)
   *              ไม่ต้องใช้ MongoDB driver โดยตรง
   *
   * Features:
   * - ✅ REST API (ไม่ต้องติดตั้ง driver)
   * - ✅ Free tier 512MB
   * - ❌ ไม่มี realtime (ใช้ polling ทุก 30 วินาที)
   * - ❌ ยังไม่ได้ใช้ smart merge (TODO)
   *
   * Collection Schema:
   * {
   *   key: string,
   *   data: array/object,
   *   updatedAt: Date
   * }
   *
   * @note ต้องเปิด Data API ใน MongoDB Atlas
   * @see https://www.mongodb.com/docs/atlas/api/data-api/
   */
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
        smartRender();

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

  // =========================================================================
  // GOOGLE SHEETS ADAPTER
  // =========================================================================
  /**
   * Google Sheets Adapter
   *
   * @description ใช้ Google Sheets เป็น database
   *              เหมาะสำหรับผู้ใช้ที่ไม่ใช่ technical
   *
   * Features:
   * - ✅ ดูและแก้ไขข้อมูลผ่าน Sheets UI
   * - ✅ Free unlimited storage
   * - ❌ Read-only ด้วย API Key (เขียนต้องใช้ OAuth)
   * - ❌ ไม่มี realtime (polling ทุก 60 วินาที)
   *
   * Sheet Format:
   * | A (key)    | B (data)                    |
   * |------------|------------------------------|
   * | ff_ponds   | [{"id":"1","name":"บ่อ 1"}] |
   * | ff_cycles  | [...]                        |
   *
   * @limitation การเขียนต้องใช้ OAuth 2.0 ไม่รองรับ API Key
   */
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
        smartRender();

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

  // =========================================================================
  // GENERIC REST API ADAPTER
  // =========================================================================
  /**
   * Custom REST API Adapter
   *
   * @description สำหรับ backend ที่สร้างเอง หรือ BaaS อื่นๆ
   *              เช่น PlanetScale, DynamoDB, Cloudflare D1, etc.
   *
   * Features:
   * - ✅ รองรับ custom headers (Authorization, API Key, etc.)
   * - ✅ Flexible endpoint configuration
   * - ❌ ไม่มี realtime (polling ทุก 30 วินาที)
   * - ❌ ยังไม่ได้ใช้ smart merge (TODO)
   *
   * Required API Endpoints:
   * - GET  /health          - Health check (optional)
   * - GET  /sync            - Get all data
   * - POST /sync            - Save all data
   * - PUT  /sync/:key       - Save specific key
   *
   * Request/Response Format:
   * {
   *   "ff_ponds": [...],
   *   "ff_cycles": [...],
   *   ...
   * }
   */
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
        smartRender();

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

// =============================================================================
// CONFIG MANAGEMENT
// =============================================================================
/**
 * @description จัดการ configuration ของ cloud sync
 *
 * Data stored in localStorage:
 * - ff_sync_config: { provider: string, config: object }
 * - ff_local_only: "true" (เมื่อเปิด offline mode)
 */

/**
 * อ่าน config ปัจจุบัน
 * @returns {Object|null} { provider: string, config: object } หรือ null ถ้า error
 *
 * @example
 * const cfg = getSyncConfig();
 * // { provider: 'firebase', config: { databaseURL: '...' } }
 */
const getSyncConfig = () => {
  try {
    const config = localStorage.getItem(SYNC_CONFIG_KEY);
    if (config) return JSON.parse(config);

    // ค่าเริ่มต้น: Firebase (auto-connect)
    return {
      provider: 'firebase',
      config: PROVIDERS.firebase.defaultConfig
    };
  } catch (e) {
    return null;
  }
};

/**
 * บันทึก config และปิด offline mode
 * @param {string} provider - ID ของ provider
 * @param {Object} config - การตั้งค่า provider
 */
const saveSyncConfig = (provider, config) => {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify({ provider, config }));
  localStorage.removeItem(LOCAL_ONLY_KEY); // ปิด offline mode
};

/**
 * เช็คว่าเป็น offline mode หรือไม่
 * @returns {boolean} true = offline mode
 */
const isLocalOnly = () => localStorage.getItem(LOCAL_ONLY_KEY) === 'true';

/**
 * Alias สำหรับ isLocalOnly (backwards compatibility)
 */
const isOfflineLocked = () => isLocalOnly();

// Export status functions for index.html
window.isOnline = () => isOnline;
window.isLocalOnly = isLocalOnly;
window.getFirebaseConfig = () => {
  try {
    const config = localStorage.getItem(SYNC_CONFIG_KEY);
    if (config) {
      const parsed = JSON.parse(config);
      return parsed.config || null;
    }
  } catch (e) {}
  return null;
};

// =============================================================================
// PASSWORD SYSTEM
// =============================================================================
/**
 * @description ระบบรหัสผ่านสำหรับป้องกันการเข้าถึงหน้าตั้งค่า
 *
 * ⚠️ SECURITY NOTE:
 * - ใช้ simple hash function (ไม่ใช่ cryptographic hash)
 * - เหมาะสำหรับป้องกันการเข้าถึงโดยผู้ไม่ประสงค์ดีทั่วไป
 * - ไม่เหมาะสำหรับข้อมูลที่ต้องการความปลอดภัยสูง
 *
 * รหัสผ่าน:
 * - รหัสเริ่มต้น: 5280
 * - Master Key: 011262 (ใช้ reset รหัสผ่านเมื่อลืม)
 */

/** Key สำหรับเก็บ hashed password ใน localStorage */
const APP_PASSWORD_KEY = 'ff_app_password';

/** รหัสผ่านเริ่มต้น (ก่อนผู้ใช้เปลี่ยน) */
const DEFAULT_PASSWORD = '5280';

/** Master Key สำหรับ reset รหัสผ่าน (ต้องจำ หรือบันทึกไว้ที่อื่น) */
const MASTER_KEY = '011262';

/**
 * Hash รหัสผ่านด้วย simple hash function
 *
 * @description ใช้ djb2-like hash algorithm
 *              ไม่ใช่ cryptographic hash (bcrypt, argon2, etc.)
 *
 * @param {string} password - รหัสผ่านที่จะ hash
 * @returns {string} hashed password (format: "pwd_xxxxx")
 *
 * @security ⚠️ Simple hash เท่านั้น ไม่ปลอดภัยสำหรับ sensitive data
 */
const hashPassword = (password) => {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;  // hash * 31 + char
    hash = hash & hash;                    // Convert to 32-bit integer
  }
  return 'pwd_' + Math.abs(hash).toString(36);  // Base36 encoding
};

/**
 * ตรวจสอบรหัสผ่าน
 *
 * @param {string} password - รหัสผ่านที่ต้องการตรวจสอบ
 * @returns {boolean} true = ถูกต้อง
 *
 * @note Master Key จะถูกต้องเสมอ (backdoor สำหรับ recovery)
 */
const verifyPassword = (password) => {
  // Master Key ใช้ได้เสมอ (emergency access)
  if (password === MASTER_KEY) return true;

  const stored = localStorage.getItem(APP_PASSWORD_KEY);
  // ถ้ายังไม่มี custom password → ใช้รหัสเริ่มต้น
  if (!stored) {
    return password === DEFAULT_PASSWORD;
  }
  // เปรียบเทียบ hash
  return stored === hashPassword(password);
};

/**
 * เปลี่ยนรหัสผ่าน
 * @param {string} newPassword - รหัสผ่านใหม่ (ขั้นต่ำ 4 ตัวอักษร)
 */
const changePassword = (newPassword) => {
  localStorage.setItem(APP_PASSWORD_KEY, hashPassword(newPassword));
};

/**
 * รีเซ็ตรหัสผ่านกลับเป็นค่าเริ่มต้น (5280)
 * @note เรียกหลังจากใช้ Master Key ยืนยันแล้ว
 */
const resetPassword = () => {
  localStorage.removeItem(APP_PASSWORD_KEY);
};

/**
 * Alias สำหรับ verifyPassword
 * @deprecated ใช้ verifyPassword แทน
 */
const verifyOfflineLock = verifyPassword;

// =============================================================================
// SYNC STATUS UI
// =============================================================================
/**
 * @description สร้าง indicator แสดงสถานะการ sync
 *              จุดเล็กๆ มุมบนขวาของหน้าจอ
 *
 * สถานะ (CSS Classes):
 * - .sync-online  : เขียว - เชื่อมต่อ cloud สำเร็จ
 * - .sync-offline : แดง  - ไม่ได้เชื่อมต่อ
 * - .sync-syncing : น้ำเงิน (กระพริบ) - กำลัง sync
 * - .sync-local   : เทา  - Offline mode
 *
 * การใช้งาน:
 * - คลิกที่จุด → เปิดหน้าตั้งค่า
 * - Hover → แสดง tooltip บอกสถานะ
 */
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
    indicator.title = '📴 Offline Mode';
  } else if (isSyncing) {
    indicator.className = 'sync-indicator sync-syncing';
    indicator.title = '🔄 กำลัง Sync...';
  } else if (isOnline) {
    indicator.className = 'sync-indicator sync-online';
    indicator.title = `☁️ ${provider?.name || 'Cloud'}`;
  } else {
    indicator.className = 'sync-indicator sync-offline';
    indicator.title = '⚠️ ไม่ได้เชื่อมต่อ';
  }
};

// =============================================================================
// MODALS - UI DIALOGS
// =============================================================================
/**
 * @description Modal dialogs สำหรับตั้งค่าและยืนยันตัวตน
 *
 * Modals:
 * - showSyncSetupModal()       : ตั้งค่า provider
 * - showUnlockModal()          : ยืนยันรหัสผ่าน
 * - showForgotPasswordModal()  : reset รหัสผ่านด้วย master key
 * - showChangePasswordModal()  : เปลี่ยนรหัสผ่าน
 *
 * ⚠️ XSS Protection:
 * - ใช้ escapeHtml() กับ dynamic content ทั้งหมด
 */

/** Flag ตรวจสอบว่ายืนยันรหัสผ่านแล้วหรือยัง (session-based) */
let isAuthenticated = false;

/**
 * แสดง Modal ตั้งค่า Cloud Sync
 * @note ต้องยืนยันรหัสผ่านก่อน
 */
const showSyncSetupModal = () => {
  // ต้องยืนยันรหัสผ่านก่อนเข้าตั้งค่าเสมอ
  if (!isAuthenticated) {
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

      <!-- Provider Selection (XSS protected) -->
      <div class="grid grid-cols-2 gap-2 mb-4" id="provider-grid">
        ${Object.values(PROVIDERS).map(p => `
          <button onclick="selectProvider('${escapeHtml(p.id)}')"
            class="provider-btn p-3 rounded-xl border-2 transition-all text-left ${p.id === currentProviderId ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-600 hover:border-slate-500'}"
            data-provider="${escapeHtml(p.id)}">
            <div class="text-2xl mb-1">${escapeHtml(p.icon)}</div>
            <div class="text-sm font-medium text-slate-200">${escapeHtml(p.name)}</div>
            <div class="text-xs text-slate-400">${escapeHtml(p.description)}</div>
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

  // Render config fields (XSS protected with escapeHtml)
  const configDiv = document.getElementById('provider-config');
  configDiv.innerHTML = `
    <input type="hidden" id="selected-provider" value="${escapeHtml(providerId)}">
    ${provider.fields.map(field => `
      <div>
        <label class="block text-sm text-slate-300 mb-1">
          ${escapeHtml(field.label)} ${field.required ? '<span class="text-red-400">*</span>' : ''}
        </label>
        ${field.type === 'textarea'
          ? `<textarea id="field-${escapeHtml(field.key)}" rows="3"
              class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
              placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(config[field.key] || '')}</textarea>`
          : `<input type="text" id="field-${escapeHtml(field.key)}"
              class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
              placeholder="${escapeHtml(field.placeholder || '')}"
              value="${escapeHtml(config[field.key] || '')}">`
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
      adapter.setupListeners?.();
      await adapter.syncFromCloud();
      closeSyncModal();
      smartRender();

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
  smartRender();

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
    isAuthenticated = true;
    closeForgotPasswordModal();
    showToast('รีเซ็ตรหัสผ่านสำเร็จ (รหัสใหม่: ' + DEFAULT_PASSWORD + ')', 'success');
    updateSyncStatus();
    setTimeout(() => showSyncSetupModal(), 100);
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
      smartRender();

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
    isAuthenticated = true;

    closeUnlockModal();
    showToast('ยืนยันสำเร็จ', 'success');

    // Show setup modal
    setTimeout(() => {
      showSyncSetupModal();
    }, 100);
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
  isAuthenticated = false; // รีเซ็ตสถานะยืนยันตัวตน
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

// =============================================================================
// ENHANCED STORAGE
// =============================================================================
/**
 * @description ดักจับ storage.set() เพื่อ trigger sync อัตโนมัติ
 *
 * Flow:
 * 1. User บันทึกข้อมูล → storage.set()
 * 2. Hook ดักจับและเพิ่ม key ลง pendingSyncKeys
 * 3. รอ 2 วินาที (debounce) เพื่อรวม changes หลายๆ อัน
 * 4. Sync ไป cloud ครั้งเดียว
 *
 * ทำไมต้อง debounce?
 * - ป้องกัน sync ทุกครั้งที่มีการเปลี่ยนแปลง (ประหยัด bandwidth)
 * - รวมการเปลี่ยนแปลงหลายอันเป็น 1 request
 */

let syncDebounceTimer = null;           // Timer สำหรับ debounce
let pendingSyncKeys = new Set();        // Keys ที่รอ sync

/**
 * Sync ไป cloud พร้อม debounce
 * รอ 2 วินาทีหลังจากการเปลี่ยนแปลงล่าสุด
 */
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
  }, 2000); // 2 วินาที debounce
};

/**
 * Hook เข้า window.storage.set() เพื่อ auto-sync
 *
 * @description ใช้ Monkey Patching pattern
 *              ดักจับ function เดิมแล้วเพิ่มพฤติกรรมใหม่
 */
const enhanceStorageWithSync = () => {
  if (!window.storage) return;

  const originalSet = window.storage.set;

  window.storage.set = (key, data) => {
    const result = originalSet.call(window.storage, key, data);

    // ถ้าเป็น key ที่ต้อง sync → queue ไว้
    if (providerInstance && !isLocalOnly() && SYNC_KEYS.includes(key)) {
      pendingSyncKeys.add(key);
      debouncedSyncToCloud();
    }

    return result;
  };
};

/**
 * Periodic Sync - sync ทุก 30 วินาที
 *
 * @description ป้องกันกรณี realtime listener พลาด
 *              หรือ connection หลุดแล้วกลับมา
 */
const startPeriodicSync = () => {
  setInterval(async () => {
    if (!providerInstance || !isOnline || isLocalOnly() || isSyncing) return;

    try {
      await providerInstance.syncFromCloud?.();
    } catch (err) {
      console.error('Periodic sync error:', err);
    }
  }, 30000); // ทุก 30 วินาที
};

// =============================================================================
// INITIALIZATION
// =============================================================================
/**
 * @description เริ่มต้น Cloud Sync module
 *
 * Boot Sequence:
 * 1. สร้าง UI indicator
 * 2. ตรวจสอบ config (ใช้ Firebase default ถ้าไม่มี)
 * 3. เชื่อมต่อ provider
 * 4. ตั้ง realtime listeners
 * 5. Hook storage.set()
 * 6. เริ่ม periodic sync
 * 7. Sync ข้อมูลเริ่มต้น
 */
const initCloudSync = async () => {
  // Cleanup soft deleted records ที่เก่าเกิน 30 วัน
  cleanupDeletedRecords();

  // สร้าง sync indicator ที่มุมบนขวา
  createSyncStatusUI();

  // ถ้าเป็น offline mode ไม่ต้องเชื่อมต่อ
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
      // setupListeners เรียก smartRender โดยตรง (smartRender มี debounce ในตัว)
      adapter.setupListeners?.();
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
      smartRender();

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
