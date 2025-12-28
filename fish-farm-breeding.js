// ===== Fish Farm Pro - Breeding, Nursery & Sales Module =====
// Version: 1.0.0
// This module extends the main Fish Farm Pro app with:
// - Broodstock (parent fish) management
// - Hormone injection tracking
// - Hatchery management
// - Nursery management
// - Sex reversal (17α-MT) tracking
// - Sales and customer management

(function() {
  'use strict';

  // ===== Storage Keys for New Features =====
  const BREEDING_KEYS = {
    BROODSTOCK: 'ff_broodstock',           // พ่อแม่พันธุ์
    HORMONE_LOGS: 'ff_hormone_logs',        // บันทึกการฉีดฮอร์โมน
    HORMONE_STOCK: 'ff_hormone_stock',      // สต๊อกฮอร์โมน
    BREEDING_CYCLES: 'ff_breeding_cycles',  // รอบการเพาะ
    HATCHERY: 'ff_hatchery',                // บ่อฟักไข่
    NURSERY_TANKS: 'ff_nursery_tanks',      // ถังอนุบาล
    NURSERY_BATCHES: 'ff_nursery_batches',  // รุ่นลูกปลา
    SEX_REVERSAL: 'ff_sex_reversal',        // บันทึกการแปลงเพศ
    FINGERLING_STOCK: 'ff_fingerling_stock', // สต๊อกลูกปลา
    CUSTOMERS: 'ff_customers',              // ลูกค้า
    SALES: 'ff_sales',                      // การขาย
    ORDERS: 'ff_orders',                    // การจอง
    BREEDING_GUIDES: 'ff_breeding_guides'   // คู่มือเพาะพันธุ์
  };

  // Export keys to window for access from main app
  window.BREEDING_KEYS = BREEDING_KEYS;

  // ===== Helper Functions =====
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const formatDate = (date) => new Date(date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  const formatNumber = (n, d = 0) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
  const formatCurrency = (n) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(n || 0);

  // Use existing storage from main app or create new one
  const breedingStorage = {
    get: (key) => {
      try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      } catch (e) {
        console.error(`Breeding storage read error for ${key}:`, e);
        return [];
      }
    },
    set: (key, data) => {
      try {
        localStorage.setItem(key, JSON.stringify(data));
        if (window.autoSaveToFile) window.autoSaveToFile();
        return true;
      } catch (e) {
        console.error(`Breeding storage write error for ${key}:`, e);
        if (window.showToast) window.showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
        return false;
      }
    }
  };

  // Filter deleted records
  const filterDeleted = (items) => (items || []).filter(item => !item?.deleted);

  // ===== Hormone Types =====
  const HORMONE_TYPES = [
    { id: 'suprefact', name: 'Suprefact (Buserelin)', unit: 'มล.', dosage: '0.3-0.5 มล./กก.' },
    { id: 'lhrh_a', name: 'LHRH-a (GnRH)', unit: 'ไมโครกรัม', dosage: '10-20 ug/กก.' },
    { id: 'hcg', name: 'HCG', unit: 'IU', dosage: '500-1500 IU/กก.' },
    { id: 'pituitary', name: 'ต่อมใต้สมอง (Pituitary)', unit: 'มก.', dosage: '2-4 มก./กก.' },
    { id: 'domperidone', name: 'Domperidone', unit: 'มก.', dosage: '5-10 มก./กก.' },
    { id: 'ovaprim', name: 'Ovaprim', unit: 'มล.', dosage: '0.4-0.6 มล./กก.' }
  ];
  window.HORMONE_TYPES = HORMONE_TYPES;

  // ===== Sex Reversal Hormone =====
  const SEX_REVERSAL_METHODS = [
    { id: 'mt_17a', name: '17α-Methyltestosterone (MT)', type: 'male', dosage: '60 มก./อาหาร 1 กก.', duration: '21-28 วัน' },
    { id: 'estradiol', name: 'Estradiol-17β', type: 'female', dosage: '50-100 มก./อาหาร 1 กก.', duration: '21-28 วัน' }
  ];
  window.SEX_REVERSAL_METHODS = SEX_REVERSAL_METHODS;

  // ===== Broodstock Database =====
  const broodstockDb = {
    getAll: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.BROODSTOCK)),
    getById: (id) => filterDeleted(breedingStorage.get(BREEDING_KEYS.BROODSTOCK)).find(b => b.id === id),
    getByGender: (gender) => filterDeleted(breedingStorage.get(BREEDING_KEYS.BROODSTOCK)).filter(b => b.gender === gender),

    create: (data) => {
      const broodstock = breedingStorage.get(BREEDING_KEYS.BROODSTOCK);
      const newBroodstock = {
        id: generateId(),
        code: data.code || `B${Date.now().toString().slice(-6)}`,
        fishTypeId: data.fishTypeId,
        gender: data.gender, // 'male' | 'female'
        weight: parseFloat(data.weight) || 0,
        age: data.age || null, // อายุเป็นเดือน
        source: data.source || 'farm', // 'farm' | 'purchased'
        purchaseDate: data.purchaseDate || null,
        purchasePrice: parseFloat(data.purchasePrice) || 0,
        notes: data.notes || '',
        status: 'active', // 'active' | 'resting' | 'retired'
        breedingCount: 0,
        lastBreedingDate: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      broodstock.push(newBroodstock);
      if (breedingStorage.set(BREEDING_KEYS.BROODSTOCK, broodstock)) {
        if (window.showToast) window.showToast('เพิ่มพ่อแม่พันธุ์สำเร็จ', 'success');
        return newBroodstock;
      }
      return null;
    },

    update: (id, data) => {
      const broodstock = breedingStorage.get(BREEDING_KEYS.BROODSTOCK);
      const index = broodstock.findIndex(b => b.id === id);
      if (index >= 0) {
        broodstock[index] = { ...broodstock[index], ...data, updatedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.BROODSTOCK, broodstock);
        return broodstock[index];
      }
      return null;
    },

    delete: (id) => {
      const broodstock = breedingStorage.get(BREEDING_KEYS.BROODSTOCK);
      const index = broodstock.findIndex(b => b.id === id);
      if (index >= 0) {
        broodstock[index] = { ...broodstock[index], deleted: true, deletedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.BROODSTOCK, broodstock);
        if (window.showToast) window.showToast('ลบพ่อแม่พันธุ์สำเร็จ', 'success');
      }
    }
  };
  window.broodstockDb = broodstockDb;

  // ===== Hormone Stock Database =====
  const hormoneStockDb = {
    getAll: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.HORMONE_STOCK)),
    getById: (id) => filterDeleted(breedingStorage.get(BREEDING_KEYS.HORMONE_STOCK)).find(h => h.id === id),

    create: (data) => {
      const stock = breedingStorage.get(BREEDING_KEYS.HORMONE_STOCK);
      const newItem = {
        id: generateId(),
        hormoneType: data.hormoneType,
        name: data.name || HORMONE_TYPES.find(h => h.id === data.hormoneType)?.name,
        quantity: parseFloat(data.quantity) || 0,
        unit: data.unit || HORMONE_TYPES.find(h => h.id === data.hormoneType)?.unit || 'มล.',
        batchNo: data.batchNo || '',
        expiryDate: data.expiryDate || null,
        purchaseDate: data.purchaseDate || new Date().toISOString().split('T')[0],
        pricePerUnit: parseFloat(data.pricePerUnit) || 0,
        totalPrice: parseFloat(data.totalPrice) || 0,
        supplier: data.supplier || '',
        notes: data.notes || '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      stock.push(newItem);
      if (breedingStorage.set(BREEDING_KEYS.HORMONE_STOCK, stock)) {
        if (window.showToast) window.showToast('เพิ่มฮอร์โมนในสต๊อกสำเร็จ', 'success');
        return newItem;
      }
      return null;
    },

    deduct: (id, amount) => {
      const stock = breedingStorage.get(BREEDING_KEYS.HORMONE_STOCK);
      const index = stock.findIndex(h => h.id === id);
      if (index >= 0) {
        stock[index].quantity = Math.max(0, stock[index].quantity - amount);
        stock[index].updatedAt = Date.now();
        breedingStorage.set(BREEDING_KEYS.HORMONE_STOCK, stock);
      }
    },

    delete: (id) => {
      const stock = breedingStorage.get(BREEDING_KEYS.HORMONE_STOCK);
      const index = stock.findIndex(h => h.id === id);
      if (index >= 0) {
        stock[index] = { ...stock[index], deleted: true, deletedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.HORMONE_STOCK, stock);
      }
    }
  };
  window.hormoneStockDb = hormoneStockDb;

  // ===== Hormone Injection Logs Database =====
  const hormoneLogsDb = {
    getAll: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.HORMONE_LOGS)),
    getByBroodstock: (broodstockId) => filterDeleted(breedingStorage.get(BREEDING_KEYS.HORMONE_LOGS))
      .filter(l => l.broodstockId === broodstockId),
    getByBreedingCycle: (cycleId) => filterDeleted(breedingStorage.get(BREEDING_KEYS.HORMONE_LOGS))
      .filter(l => l.breedingCycleId === cycleId),

    create: (data) => {
      const logs = breedingStorage.get(BREEDING_KEYS.HORMONE_LOGS);
      const broodstock = broodstockDb.getById(data.broodstockId);

      const newLog = {
        id: generateId(),
        broodstockId: data.broodstockId,
        breedingCycleId: data.breedingCycleId || null,
        hormoneStockId: data.hormoneStockId,
        hormoneType: data.hormoneType,
        injectionNumber: data.injectionNumber || 1, // ครั้งที่ 1, 2
        dosage: parseFloat(data.dosage) || 0,
        unit: data.unit || 'มล.',
        fishWeight: broodstock?.weight || parseFloat(data.fishWeight) || 0,
        dosagePerKg: parseFloat(data.dosagePerKg) || 0,
        injectionSite: data.injectionSite || 'muscle', // 'muscle' | 'peritoneal'
        injectionTime: data.injectionTime || new Date().toISOString(),
        expectedSpawningTime: data.expectedSpawningTime || null,
        notes: data.notes || '',
        createdAt: Date.now()
      };
      logs.push(newLog);

      if (breedingStorage.set(BREEDING_KEYS.HORMONE_LOGS, logs)) {
        // Deduct from stock
        if (data.hormoneStockId) {
          hormoneStockDb.deduct(data.hormoneStockId, newLog.dosage);
        }
        if (window.showToast) window.showToast('บันทึกการฉีดฮอร์โมนสำเร็จ', 'success');
        return newLog;
      }
      return null;
    },

    delete: (id) => {
      const logs = breedingStorage.get(BREEDING_KEYS.HORMONE_LOGS);
      const index = logs.findIndex(l => l.id === id);
      if (index >= 0) {
        logs[index] = { ...logs[index], deleted: true, deletedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.HORMONE_LOGS, logs);
      }
    }
  };
  window.hormoneLogsDb = hormoneLogsDb;

  // ===== Breeding Cycles Database =====
  const breedingCyclesDb = {
    getAll: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.BREEDING_CYCLES)),
    getById: (id) => filterDeleted(breedingStorage.get(BREEDING_KEYS.BREEDING_CYCLES)).find(c => c.id === id),
    getActive: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.BREEDING_CYCLES)).filter(c => c.status === 'active'),

    create: (data) => {
      const cycles = breedingStorage.get(BREEDING_KEYS.BREEDING_CYCLES);
      const newCycle = {
        id: generateId(),
        code: data.code || `BC${Date.now().toString().slice(-6)}`,
        femaleId: data.femaleId,
        maleId: data.maleId || null,
        fishTypeId: data.fishTypeId,
        startDate: data.startDate || new Date().toISOString(),

        // Hormone injection info
        firstInjectionTime: data.firstInjectionTime || null,
        secondInjectionTime: data.secondInjectionTime || null,

        // Egg stripping info
        strippingTime: data.strippingTime || null,
        eggWeight: parseFloat(data.eggWeight) || 0, // น้ำหนักไข่ (กรัม)
        eggCount: parseInt(data.eggCount) || 0, // จำนวนไข่โดยประมาณ
        fertilizationRate: parseFloat(data.fertilizationRate) || 0, // อัตราผสมติด %

        // Hatching info
        hatcheryId: data.hatcheryId || null,
        hatchingStartTime: data.hatchingStartTime || null,
        hatchingEndTime: data.hatchingEndTime || null,
        hatchingTemp: parseFloat(data.hatchingTemp) || 28, // อุณหภูมิฟัก
        hatchedCount: parseInt(data.hatchedCount) || 0,
        hatchingRate: parseFloat(data.hatchingRate) || 0, // อัตราฟัก %

        // Transfer to nursery
        nurseryBatchId: data.nurseryBatchId || null,
        transferredCount: parseInt(data.transferredCount) || 0,

        status: 'active', // 'active' | 'completed' | 'failed'
        notes: data.notes || '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      cycles.push(newCycle);

      if (breedingStorage.set(BREEDING_KEYS.BREEDING_CYCLES, cycles)) {
        // Update broodstock breeding count
        if (data.femaleId) {
          const female = broodstockDb.getById(data.femaleId);
          if (female) {
            broodstockDb.update(data.femaleId, {
              breedingCount: (female.breedingCount || 0) + 1,
              lastBreedingDate: new Date().toISOString()
            });
          }
        }
        if (window.showToast) window.showToast('สร้างรอบเพาะพันธุ์สำเร็จ', 'success');
        return newCycle;
      }
      return null;
    },

    update: (id, data) => {
      const cycles = breedingStorage.get(BREEDING_KEYS.BREEDING_CYCLES);
      const index = cycles.findIndex(c => c.id === id);
      if (index >= 0) {
        cycles[index] = { ...cycles[index], ...data, updatedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.BREEDING_CYCLES, cycles);
        return cycles[index];
      }
      return null;
    },

    complete: (id, result) => {
      return breedingCyclesDb.update(id, {
        status: result.success ? 'completed' : 'failed',
        completedAt: Date.now(),
        ...result
      });
    },

    delete: (id) => {
      const cycles = breedingStorage.get(BREEDING_KEYS.BREEDING_CYCLES);
      const index = cycles.findIndex(c => c.id === id);
      if (index >= 0) {
        cycles[index] = { ...cycles[index], deleted: true, deletedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.BREEDING_CYCLES, cycles);
      }
    }
  };
  window.breedingCyclesDb = breedingCyclesDb;

  // ===== Nursery Tanks Database =====
  const nurseryTanksDb = {
    getAll: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.NURSERY_TANKS)),
    getById: (id) => filterDeleted(breedingStorage.get(BREEDING_KEYS.NURSERY_TANKS)).find(t => t.id === id),
    getAvailable: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.NURSERY_TANKS)).filter(t => t.status === 'empty'),

    create: (data) => {
      const tanks = breedingStorage.get(BREEDING_KEYS.NURSERY_TANKS);
      const newTank = {
        id: generateId(),
        name: data.name,
        type: data.type || 'cement', // 'cement' | 'fiber' | 'canvas' | 'earthen'
        capacity: parseFloat(data.capacity) || 0, // ความจุ (ลิตร/ลบ.ม.)
        capacityUnit: data.capacityUnit || 'liters',
        maxFishCount: parseInt(data.maxFishCount) || 0,
        location: data.location || '',
        hasAeration: data.hasAeration !== false,
        hasHeater: data.hasHeater || false,
        status: 'empty', // 'empty' | 'in_use' | 'maintenance'
        notes: data.notes || '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      tanks.push(newTank);
      if (breedingStorage.set(BREEDING_KEYS.NURSERY_TANKS, tanks)) {
        if (window.showToast) window.showToast('เพิ่มถังอนุบาลสำเร็จ', 'success');
        return newTank;
      }
      return null;
    },

    update: (id, data) => {
      const tanks = breedingStorage.get(BREEDING_KEYS.NURSERY_TANKS);
      const index = tanks.findIndex(t => t.id === id);
      if (index >= 0) {
        tanks[index] = { ...tanks[index], ...data, updatedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.NURSERY_TANKS, tanks);
        return tanks[index];
      }
      return null;
    },

    delete: (id) => {
      const tanks = breedingStorage.get(BREEDING_KEYS.NURSERY_TANKS);
      const index = tanks.findIndex(t => t.id === id);
      if (index >= 0) {
        tanks[index] = { ...tanks[index], deleted: true, deletedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.NURSERY_TANKS, tanks);
      }
    }
  };
  window.nurseryTanksDb = nurseryTanksDb;

  // ===== Nursery Batches Database =====
  const nurseryBatchesDb = {
    getAll: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.NURSERY_BATCHES)),
    getById: (id) => filterDeleted(breedingStorage.get(BREEDING_KEYS.NURSERY_BATCHES)).find(b => b.id === id),
    getByTank: (tankId) => filterDeleted(breedingStorage.get(BREEDING_KEYS.NURSERY_BATCHES))
      .filter(b => b.tankId === tankId && b.status === 'active'),
    getActive: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.NURSERY_BATCHES)).filter(b => b.status === 'active'),

    create: (data) => {
      const batches = breedingStorage.get(BREEDING_KEYS.NURSERY_BATCHES);
      const newBatch = {
        id: generateId(),
        code: data.code || `NB${Date.now().toString().slice(-6)}`,
        tankId: data.tankId,
        breedingCycleId: data.breedingCycleId || null,
        fishTypeId: data.fishTypeId,

        initialCount: parseInt(data.initialCount) || 0,
        currentCount: parseInt(data.initialCount) || 0,

        startDate: data.startDate || new Date().toISOString(),
        stage: data.stage || 'larvae', // 'larvae' | 'fry' | 'fingerling' | 'juvenile'
        ageInDays: 0,

        // Growth tracking
        avgWeight: parseFloat(data.avgWeight) || 0, // กรัม
        lastWeighDate: null,
        growthRecords: [],

        // Sex reversal tracking
        sexReversal: {
          enabled: data.sexReversalEnabled || false,
          method: data.sexReversalMethod || null,
          startDate: null,
          endDate: null,
          targetGender: data.targetGender || 'male',
          status: 'pending' // 'pending' | 'in_progress' | 'completed'
        },

        // Mortality tracking
        totalMortality: 0,
        mortalityRecords: [],

        status: 'active', // 'active' | 'completed' | 'transferred'
        notes: data.notes || '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      batches.push(newBatch);

      if (breedingStorage.set(BREEDING_KEYS.NURSERY_BATCHES, batches)) {
        // Update tank status
        nurseryTanksDb.update(data.tankId, { status: 'in_use' });
        if (window.showToast) window.showToast('สร้างรุ่นอนุบาลสำเร็จ', 'success');
        return newBatch;
      }
      return null;
    },

    update: (id, data) => {
      const batches = breedingStorage.get(BREEDING_KEYS.NURSERY_BATCHES);
      const index = batches.findIndex(b => b.id === id);
      if (index >= 0) {
        batches[index] = { ...batches[index], ...data, updatedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.NURSERY_BATCHES, batches);
        return batches[index];
      }
      return null;
    },

    recordGrowth: (id, weight, count) => {
      const batches = breedingStorage.get(BREEDING_KEYS.NURSERY_BATCHES);
      const index = batches.findIndex(b => b.id === id);
      if (index >= 0) {
        const record = {
          date: new Date().toISOString(),
          avgWeight: parseFloat(weight),
          sampleCount: parseInt(count) || 10
        };
        batches[index].growthRecords = [...(batches[index].growthRecords || []), record];
        batches[index].avgWeight = parseFloat(weight);
        batches[index].lastWeighDate = record.date;
        batches[index].updatedAt = Date.now();
        breedingStorage.set(BREEDING_KEYS.NURSERY_BATCHES, batches);
        if (window.showToast) window.showToast('บันทึกน้ำหนักสำเร็จ', 'success');
        return batches[index];
      }
      return null;
    },

    recordMortality: (id, count, cause) => {
      const batches = breedingStorage.get(BREEDING_KEYS.NURSERY_BATCHES);
      const index = batches.findIndex(b => b.id === id);
      if (index >= 0) {
        const record = {
          date: new Date().toISOString(),
          count: parseInt(count),
          cause: cause || ''
        };
        batches[index].mortalityRecords = [...(batches[index].mortalityRecords || []), record];
        batches[index].totalMortality = (batches[index].totalMortality || 0) + parseInt(count);
        batches[index].currentCount = Math.max(0, batches[index].currentCount - parseInt(count));
        batches[index].updatedAt = Date.now();
        breedingStorage.set(BREEDING_KEYS.NURSERY_BATCHES, batches);
        if (window.showToast) window.showToast('บันทึกการตายสำเร็จ', 'success');
        return batches[index];
      }
      return null;
    },

    complete: (id, transferTo) => {
      const batch = nurseryBatchesDb.getById(id);
      if (!batch) return null;

      const result = nurseryBatchesDb.update(id, {
        status: 'completed',
        completedAt: Date.now(),
        transferredTo: transferTo
      });

      // Update tank status
      nurseryTanksDb.update(batch.tankId, { status: 'empty' });

      return result;
    },

    delete: (id) => {
      const batches = breedingStorage.get(BREEDING_KEYS.NURSERY_BATCHES);
      const index = batches.findIndex(b => b.id === id);
      if (index >= 0) {
        const batch = batches[index];
        batches[index] = { ...batch, deleted: true, deletedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.NURSERY_BATCHES, batches);
        // Update tank status if was active
        if (batch.status === 'active') {
          nurseryTanksDb.update(batch.tankId, { status: 'empty' });
        }
      }
    }
  };
  window.nurseryBatchesDb = nurseryBatchesDb;

  // ===== Sex Reversal Logs Database =====
  const sexReversalDb = {
    getAll: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.SEX_REVERSAL)),
    getByBatch: (batchId) => filterDeleted(breedingStorage.get(BREEDING_KEYS.SEX_REVERSAL))
      .filter(s => s.batchId === batchId),

    create: (data) => {
      const logs = breedingStorage.get(BREEDING_KEYS.SEX_REVERSAL);
      const method = SEX_REVERSAL_METHODS.find(m => m.id === data.methodId);

      const newLog = {
        id: generateId(),
        batchId: data.batchId,
        methodId: data.methodId,
        methodName: method?.name || data.methodName,
        targetGender: method?.type || data.targetGender,

        startDate: data.startDate || new Date().toISOString(),
        endDate: data.endDate || null,
        plannedDuration: parseInt(data.plannedDuration) || 28, // days

        // Hormone feed details
        feedAmount: parseFloat(data.feedAmount) || 0, // kg
        hormoneConcentration: parseFloat(data.hormoneConcentration) || 60, // mg/kg feed
        feedingFrequency: data.feedingFrequency || '4 มื้อ/วัน',

        dailyLogs: [], // Array of { date, fedAmount, notes }

        status: 'in_progress', // 'in_progress' | 'completed' | 'cancelled'
        result: null, // { successRate, maleCount, femaleCount }
        notes: data.notes || '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      logs.push(newLog);

      if (breedingStorage.set(BREEDING_KEYS.SEX_REVERSAL, logs)) {
        // Update batch
        nurseryBatchesDb.update(data.batchId, {
          sexReversal: {
            enabled: true,
            method: data.methodId,
            startDate: newLog.startDate,
            targetGender: newLog.targetGender,
            status: 'in_progress'
          }
        });
        if (window.showToast) window.showToast('เริ่มกระบวนการแปลงเพศสำเร็จ', 'success');
        return newLog;
      }
      return null;
    },

    addDailyLog: (id, fedAmount, notes) => {
      const logs = breedingStorage.get(BREEDING_KEYS.SEX_REVERSAL);
      const index = logs.findIndex(l => l.id === id);
      if (index >= 0) {
        logs[index].dailyLogs = [...(logs[index].dailyLogs || []), {
          date: new Date().toISOString(),
          fedAmount: parseFloat(fedAmount),
          notes: notes || ''
        }];
        logs[index].updatedAt = Date.now();
        breedingStorage.set(BREEDING_KEYS.SEX_REVERSAL, logs);
        return logs[index];
      }
      return null;
    },

    complete: (id, result) => {
      const logs = breedingStorage.get(BREEDING_KEYS.SEX_REVERSAL);
      const index = logs.findIndex(l => l.id === id);
      if (index >= 0) {
        logs[index].status = 'completed';
        logs[index].endDate = new Date().toISOString();
        logs[index].result = result;
        logs[index].updatedAt = Date.now();
        breedingStorage.set(BREEDING_KEYS.SEX_REVERSAL, logs);

        // Update batch
        nurseryBatchesDb.update(logs[index].batchId, {
          'sexReversal.status': 'completed',
          'sexReversal.endDate': logs[index].endDate
        });

        if (window.showToast) window.showToast('เสร็จสิ้นกระบวนการแปลงเพศ', 'success');
        return logs[index];
      }
      return null;
    },

    delete: (id) => {
      const logs = breedingStorage.get(BREEDING_KEYS.SEX_REVERSAL);
      const index = logs.findIndex(l => l.id === id);
      if (index >= 0) {
        logs[index] = { ...logs[index], deleted: true, deletedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.SEX_REVERSAL, logs);
      }
    }
  };
  window.sexReversalDb = sexReversalDb;

  // ===== Fingerling Stock Database =====
  const fingerlingStockDb = {
    getAll: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.FINGERLING_STOCK)),
    getById: (id) => filterDeleted(breedingStorage.get(BREEDING_KEYS.FINGERLING_STOCK)).find(s => s.id === id),
    getAvailable: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.FINGERLING_STOCK))
      .filter(s => s.availableCount > 0),

    create: (data) => {
      const stock = breedingStorage.get(BREEDING_KEYS.FINGERLING_STOCK);
      const newItem = {
        id: generateId(),
        batchId: data.batchId || null,
        fishTypeId: data.fishTypeId,

        count: parseInt(data.count) || 0,
        availableCount: parseInt(data.count) || 0,
        reservedCount: 0,
        soldCount: 0,

        size: data.size || 'small', // 'larvae' | 'small' | 'medium' | 'large'
        avgWeight: parseFloat(data.avgWeight) || 0, // กรัม
        ageInDays: parseInt(data.ageInDays) || 0,

        gender: data.gender || 'mixed', // 'male' | 'female' | 'mixed'
        pricePerFish: parseFloat(data.pricePerFish) || 0,

        location: data.location || '',
        notes: data.notes || '',

        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      stock.push(newItem);
      if (breedingStorage.set(BREEDING_KEYS.FINGERLING_STOCK, stock)) {
        if (window.showToast) window.showToast('เพิ่มสต๊อกลูกปลาสำเร็จ', 'success');
        return newItem;
      }
      return null;
    },

    update: (id, data) => {
      const stock = breedingStorage.get(BREEDING_KEYS.FINGERLING_STOCK);
      const index = stock.findIndex(s => s.id === id);
      if (index >= 0) {
        stock[index] = { ...stock[index], ...data, updatedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.FINGERLING_STOCK, stock);
        return stock[index];
      }
      return null;
    },

    reserve: (id, count) => {
      const stock = breedingStorage.get(BREEDING_KEYS.FINGERLING_STOCK);
      const index = stock.findIndex(s => s.id === id);
      if (index >= 0 && stock[index].availableCount >= count) {
        stock[index].availableCount -= count;
        stock[index].reservedCount = (stock[index].reservedCount || 0) + count;
        stock[index].updatedAt = Date.now();
        breedingStorage.set(BREEDING_KEYS.FINGERLING_STOCK, stock);
        return stock[index];
      }
      return null;
    },

    sell: (id, count) => {
      const stock = breedingStorage.get(BREEDING_KEYS.FINGERLING_STOCK);
      const index = stock.findIndex(s => s.id === id);
      if (index >= 0) {
        stock[index].availableCount = Math.max(0, stock[index].availableCount - count);
        stock[index].soldCount = (stock[index].soldCount || 0) + count;
        stock[index].updatedAt = Date.now();
        breedingStorage.set(BREEDING_KEYS.FINGERLING_STOCK, stock);
        return stock[index];
      }
      return null;
    },

    delete: (id) => {
      const stock = breedingStorage.get(BREEDING_KEYS.FINGERLING_STOCK);
      const index = stock.findIndex(s => s.id === id);
      if (index >= 0) {
        stock[index] = { ...stock[index], deleted: true, deletedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.FINGERLING_STOCK, stock);
      }
    }
  };
  window.fingerlingStockDb = fingerlingStockDb;

  // ===== Customers Database =====
  const customersDb = {
    getAll: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.CUSTOMERS)),
    getById: (id) => filterDeleted(breedingStorage.get(BREEDING_KEYS.CUSTOMERS)).find(c => c.id === id),
    search: (query) => {
      const q = query.toLowerCase();
      return filterDeleted(breedingStorage.get(BREEDING_KEYS.CUSTOMERS))
        .filter(c => c.name.toLowerCase().includes(q) ||
                     c.phone?.includes(q) ||
                     c.nickname?.toLowerCase().includes(q));
    },

    create: (data) => {
      const customers = breedingStorage.get(BREEDING_KEYS.CUSTOMERS);
      const newCustomer = {
        id: generateId(),
        name: data.name,
        nickname: data.nickname || '',
        phone: data.phone || '',
        lineId: data.lineId || '',
        address: data.address || '',
        province: data.province || '',
        isVip: data.isVip || false,
        discount: parseFloat(data.discount) || 0, // % ส่วนลด
        notes: data.notes || '',

        // Stats
        totalOrders: 0,
        totalSpent: 0,
        lastOrderDate: null,

        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      customers.push(newCustomer);
      if (breedingStorage.set(BREEDING_KEYS.CUSTOMERS, customers)) {
        if (window.showToast) window.showToast('เพิ่มลูกค้าสำเร็จ', 'success');
        return newCustomer;
      }
      return null;
    },

    update: (id, data) => {
      const customers = breedingStorage.get(BREEDING_KEYS.CUSTOMERS);
      const index = customers.findIndex(c => c.id === id);
      if (index >= 0) {
        customers[index] = { ...customers[index], ...data, updatedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.CUSTOMERS, customers);
        return customers[index];
      }
      return null;
    },

    updateStats: (id, orderAmount) => {
      const customers = breedingStorage.get(BREEDING_KEYS.CUSTOMERS);
      const index = customers.findIndex(c => c.id === id);
      if (index >= 0) {
        customers[index].totalOrders = (customers[index].totalOrders || 0) + 1;
        customers[index].totalSpent = (customers[index].totalSpent || 0) + orderAmount;
        customers[index].lastOrderDate = new Date().toISOString();
        customers[index].updatedAt = Date.now();
        breedingStorage.set(BREEDING_KEYS.CUSTOMERS, customers);
        return customers[index];
      }
      return null;
    },

    delete: (id) => {
      const customers = breedingStorage.get(BREEDING_KEYS.CUSTOMERS);
      const index = customers.findIndex(c => c.id === id);
      if (index >= 0) {
        customers[index] = { ...customers[index], deleted: true, deletedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.CUSTOMERS, customers);
      }
    }
  };
  window.customersDb = customersDb;

  // ===== Orders (Pre-orders/Reservations) Database =====
  const ordersDb = {
    getAll: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.ORDERS)),
    getById: (id) => filterDeleted(breedingStorage.get(BREEDING_KEYS.ORDERS)).find(o => o.id === id),
    getByCustomer: (customerId) => filterDeleted(breedingStorage.get(BREEDING_KEYS.ORDERS))
      .filter(o => o.customerId === customerId),
    getPending: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.ORDERS))
      .filter(o => o.status === 'pending' || o.status === 'confirmed'),

    create: (data) => {
      const orders = breedingStorage.get(BREEDING_KEYS.ORDERS);
      const newOrder = {
        id: generateId(),
        orderNumber: `ORD${Date.now().toString().slice(-8)}`,
        customerId: data.customerId,

        items: data.items || [], // [{ fishTypeId, size, gender, quantity, pricePerFish }]

        totalQuantity: data.items?.reduce((sum, i) => sum + i.quantity, 0) || 0,
        subtotal: data.items?.reduce((sum, i) => sum + (i.quantity * i.pricePerFish), 0) || 0,
        discount: parseFloat(data.discount) || 0,
        deliveryFee: parseFloat(data.deliveryFee) || 0,
        totalAmount: 0, // calculated below

        deposit: parseFloat(data.deposit) || 0,
        depositPaid: data.depositPaid || false,
        depositPaidDate: null,

        deliveryMethod: data.deliveryMethod || 'pickup', // 'pickup' | 'delivery' | 'shipping'
        deliveryAddress: data.deliveryAddress || '',
        expectedDeliveryDate: data.expectedDeliveryDate || null,

        status: 'pending', // 'pending' | 'confirmed' | 'ready' | 'delivered' | 'completed' | 'cancelled'
        notes: data.notes || '',

        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Calculate total
      newOrder.totalAmount = newOrder.subtotal - newOrder.discount + newOrder.deliveryFee;

      orders.push(newOrder);
      if (breedingStorage.set(BREEDING_KEYS.ORDERS, orders)) {
        if (window.showToast) window.showToast('สร้างคำสั่งจองสำเร็จ', 'success');
        return newOrder;
      }
      return null;
    },

    update: (id, data) => {
      const orders = breedingStorage.get(BREEDING_KEYS.ORDERS);
      const index = orders.findIndex(o => o.id === id);
      if (index >= 0) {
        orders[index] = { ...orders[index], ...data, updatedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.ORDERS, orders);
        return orders[index];
      }
      return null;
    },

    updateStatus: (id, status) => {
      return ordersDb.update(id, { status, statusUpdatedAt: Date.now() });
    },

    markDeposit: (id) => {
      return ordersDb.update(id, {
        depositPaid: true,
        depositPaidDate: new Date().toISOString(),
        status: 'confirmed'
      });
    },

    complete: (id) => {
      const order = ordersDb.getById(id);
      if (order) {
        // Update customer stats
        customersDb.updateStats(order.customerId, order.totalAmount);
        return ordersDb.update(id, { status: 'completed', completedAt: Date.now() });
      }
      return null;
    },

    cancel: (id, reason) => {
      return ordersDb.update(id, {
        status: 'cancelled',
        cancelledAt: Date.now(),
        cancelReason: reason || ''
      });
    },

    delete: (id) => {
      const orders = breedingStorage.get(BREEDING_KEYS.ORDERS);
      const index = orders.findIndex(o => o.id === id);
      if (index >= 0) {
        orders[index] = { ...orders[index], deleted: true, deletedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.ORDERS, orders);
      }
    }
  };
  window.ordersDb = ordersDb;

  // ===== Sales Database =====
  const salesDb = {
    getAll: () => filterDeleted(breedingStorage.get(BREEDING_KEYS.SALES)),
    getById: (id) => filterDeleted(breedingStorage.get(BREEDING_KEYS.SALES)).find(s => s.id === id),
    getByCustomer: (customerId) => filterDeleted(breedingStorage.get(BREEDING_KEYS.SALES))
      .filter(s => s.customerId === customerId),
    getByDate: (startDate, endDate) => {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      return filterDeleted(breedingStorage.get(BREEDING_KEYS.SALES))
        .filter(s => {
          const saleDate = new Date(s.saleDate).getTime();
          return saleDate >= start && saleDate <= end;
        });
    },

    create: (data) => {
      const sales = breedingStorage.get(BREEDING_KEYS.SALES);
      const newSale = {
        id: generateId(),
        receiptNumber: `RCP${Date.now().toString().slice(-8)}`,
        orderId: data.orderId || null,
        customerId: data.customerId || null,
        customerName: data.customerName || 'ลูกค้าทั่วไป',

        saleType: data.saleType || 'fingerling', // 'fingerling' | 'broodstock' | 'grown'

        items: data.items || [], // [{ stockId, fishTypeId, quantity, weight, pricePerUnit, amount }]

        totalQuantity: 0,
        totalWeight: 0,
        subtotal: 0,
        discount: parseFloat(data.discount) || 0,
        deliveryFee: parseFloat(data.deliveryFee) || 0,
        totalAmount: 0,

        paymentMethod: data.paymentMethod || 'cash', // 'cash' | 'transfer' | 'credit'
        paymentStatus: data.paymentStatus || 'paid', // 'paid' | 'pending' | 'partial'
        paidAmount: parseFloat(data.paidAmount) || 0,

        saleDate: data.saleDate || new Date().toISOString(),
        deliveryMethod: data.deliveryMethod || 'pickup',
        deliveryDate: data.deliveryDate || null,
        deliveryAddress: data.deliveryAddress || '',

        notes: data.notes || '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Calculate totals
      newSale.items.forEach(item => {
        newSale.totalQuantity += item.quantity || 0;
        newSale.totalWeight += item.weight || 0;
        newSale.subtotal += item.amount || 0;
      });
      newSale.totalAmount = newSale.subtotal - newSale.discount + newSale.deliveryFee;
      if (newSale.paymentStatus === 'paid') {
        newSale.paidAmount = newSale.totalAmount;
      }

      sales.push(newSale);
      if (breedingStorage.set(BREEDING_KEYS.SALES, sales)) {
        // Deduct from stock
        newSale.items.forEach(item => {
          if (item.stockId) {
            fingerlingStockDb.sell(item.stockId, item.quantity);
          }
        });

        // Update customer stats
        if (data.customerId) {
          customersDb.updateStats(data.customerId, newSale.totalAmount);
        }

        if (window.showToast) window.showToast('บันทึกการขายสำเร็จ', 'success');
        return newSale;
      }
      return null;
    },

    update: (id, data) => {
      const sales = breedingStorage.get(BREEDING_KEYS.SALES);
      const index = sales.findIndex(s => s.id === id);
      if (index >= 0) {
        sales[index] = { ...sales[index], ...data, updatedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.SALES, sales);
        return sales[index];
      }
      return null;
    },

    delete: (id) => {
      const sales = breedingStorage.get(BREEDING_KEYS.SALES);
      const index = sales.findIndex(s => s.id === id);
      if (index >= 0) {
        sales[index] = { ...sales[index], deleted: true, deletedAt: Date.now() };
        breedingStorage.set(BREEDING_KEYS.SALES, sales);
      }
    }
  };
  window.salesDb = salesDb;

  // ===== Reports & Analytics =====
  const breedingReports = {
    // Breeding success rate
    getBreedingStats: (startDate, endDate) => {
      const cycles = breedingCyclesDb.getAll().filter(c => {
        const date = new Date(c.startDate).getTime();
        return date >= new Date(startDate).getTime() && date <= new Date(endDate).getTime();
      });

      const completed = cycles.filter(c => c.status === 'completed');
      const failed = cycles.filter(c => c.status === 'failed');

      return {
        totalCycles: cycles.length,
        completedCycles: completed.length,
        failedCycles: failed.length,
        successRate: cycles.length > 0 ? (completed.length / cycles.length * 100).toFixed(1) : 0,
        avgFertilizationRate: completed.length > 0
          ? (completed.reduce((sum, c) => sum + (c.fertilizationRate || 0), 0) / completed.length).toFixed(1)
          : 0,
        avgHatchingRate: completed.length > 0
          ? (completed.reduce((sum, c) => sum + (c.hatchingRate || 0), 0) / completed.length).toFixed(1)
          : 0,
        totalEggs: cycles.reduce((sum, c) => sum + (c.eggCount || 0), 0),
        totalHatched: cycles.reduce((sum, c) => sum + (c.hatchedCount || 0), 0)
      };
    },

    // Nursery survival rate
    getNurseryStats: () => {
      const batches = nurseryBatchesDb.getAll();
      const completed = batches.filter(b => b.status === 'completed');

      let totalInitial = 0;
      let totalSurvived = 0;
      let totalMortality = 0;

      completed.forEach(b => {
        totalInitial += b.initialCount || 0;
        totalSurvived += b.currentCount || 0;
        totalMortality += b.totalMortality || 0;
      });

      return {
        totalBatches: batches.length,
        activeBatches: batches.filter(b => b.status === 'active').length,
        completedBatches: completed.length,
        avgSurvivalRate: totalInitial > 0 ? ((totalSurvived / totalInitial) * 100).toFixed(1) : 0,
        totalMortality: totalMortality
      };
    },

    // Sales report
    getSalesStats: (startDate, endDate) => {
      const sales = salesDb.getByDate(startDate, endDate);

      const byType = {};
      let totalRevenue = 0;
      let totalQuantity = 0;

      sales.forEach(sale => {
        totalRevenue += sale.totalAmount || 0;
        totalQuantity += sale.totalQuantity || 0;

        const type = sale.saleType || 'other';
        if (!byType[type]) {
          byType[type] = { count: 0, revenue: 0, quantity: 0 };
        }
        byType[type].count++;
        byType[type].revenue += sale.totalAmount || 0;
        byType[type].quantity += sale.totalQuantity || 0;
      });

      return {
        totalSales: sales.length,
        totalRevenue,
        totalQuantity,
        byType,
        avgOrderValue: sales.length > 0 ? totalRevenue / sales.length : 0
      };
    },

    // Customer ranking
    getTopCustomers: (limit = 10) => {
      return customersDb.getAll()
        .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
        .slice(0, limit);
    },

    // Stock summary
    getStockSummary: () => {
      const stock = fingerlingStockDb.getAll();

      const byType = {};
      let totalCount = 0;
      let totalValue = 0;

      stock.forEach(s => {
        const typeId = s.fishTypeId || 'unknown';
        if (!byType[typeId]) {
          byType[typeId] = { count: 0, value: 0 };
        }
        byType[typeId].count += s.availableCount || 0;
        byType[typeId].value += (s.availableCount || 0) * (s.pricePerFish || 0);

        totalCount += s.availableCount || 0;
        totalValue += (s.availableCount || 0) * (s.pricePerFish || 0);
      });

      return {
        totalItems: stock.length,
        totalCount,
        totalValue,
        byType
      };
    }
  };
  window.breedingReports = breedingReports;

  // ===== Breeding Guides =====
  const BREEDING_GUIDES = [
    {
      id: 'breeding-basics',
      category: 'breeding',
      title: 'พื้นฐานการเพาะพันธุ์ปลาดุก',
      summary: 'ขั้นตอนเบื้องต้นในการเพาะพันธุ์ปลาดุก',
      content: `🐟 การเพาะพันธุ์ปลาดุกเบื้องต้น

📋 การเลือกพ่อแม่พันธุ์
• อายุ 8-12 เดือนขึ้นไป
• น้ำหนัก 200-500 กรัม (ปลาดุก)
• สุขภาพแข็งแรง ไม่มีแผล
• ท้องพร้อม (ตัวเมีย): ท้องอูม นิ่ม

🔍 การดูความพร้อม
ตัวเมีย:
• ท้องกลมอูม นิ่มเมื่อกด
• ช่องเพศบวมแดงเล็กน้อย
• กดท้องมีไข่ออกมา (ไข่สุก)

ตัวผู้:
• อวัยวะเพศชัดเจน
• กดท้องมีน้ำเชื้อสีขาวขุ่น

📅 ฤดูกาลเพาะ
• ช่วงที่เหมาะสม: มี.ค. - ต.ค.
• อุณหภูมิ: 26-30°C
• ช่วงฝนตก/อากาศเย็น ปลาวางไข่ดี`
    },
    {
      id: 'hormone-injection',
      category: 'breeding',
      title: 'การฉีดฮอร์โมนกระตุ้นไข่',
      summary: 'วิธีฉีดฮอร์โมนสำหรับกระตุ้นการวางไข่',
      content: `💉 การฉีดฮอร์โมนกระตุ้นไข่

📊 ฮอร์โมนที่ใช้
┌─────────────┬────────────────┬─────────────┐
│ ฮอร์โมน      │ ขนาด/กก.ปลา   │ ราคา        │
├─────────────┼────────────────┼─────────────┤
│ Suprefact   │ 0.3-0.5 มล.   │ ~1,500/ขวด  │
│ LHRH-a      │ 10-20 ug      │ ~800/ขวด    │
│ HCG         │ 500-1500 IU   │ ~300/ขวด    │
│ Ovaprim     │ 0.4-0.6 มล.   │ ~1,200/ขวด  │
│ ต่อมใต้สมอง   │ 2-4 มก.       │ ~50/ต่อม    │
└─────────────┴────────────────┴─────────────┘

💉 วิธีฉีด
1️⃣ ฉีดครั้งที่ 1 (Priming dose)
• ให้ 10-20% ของขนาดเต็ม
• ฉีดตัวเมียอย่างเดียว

2️⃣ ฉีดครั้งที่ 2 (Resolving dose)
• ให้ครบขนาดหลังฉีดครั้งแรก 6-8 ชม.
• ฉีดทั้งตัวผู้และตัวเมีย
• ตัวผู้ให้ครึ่งหนึ่งของตัวเมีย

📍 ตำแหน่งฉีด
• ฉีดเข้ากล้ามเนื้อบริเวณหลัง
• ใต้ครีบหลัง มุม 45 องศา
• ความลึก 0.5-1 ซม.

⏰ ระยะเวลาหลังฉีด
• Suprefact/LHRH-a: 8-12 ชม.
• HCG: 10-14 ชม.
• ต่อมใต้สมอง: 10-12 ชม.`
    },
    {
      id: 'egg-stripping',
      category: 'breeding',
      title: 'การรีดไข่และผสมเทียม',
      summary: 'เทคนิคการรีดไข่และการผสมน้ำเชื้อ',
      content: `🥚 การรีดไข่และผสมเทียม

⏰ ดูความพร้อม
• หลังฉีดฮอร์โมน 8-12 ชม.
• กดท้องเบาๆ ถ้าไข่ไหลออก = พร้อม
• ไข่สุก: สีเหลืองทอง กลมใส

📋 อุปกรณ์
• ผ้าชุบน้ำ (เช็ดปลาให้แห้ง)
• ถ้วยพลาสติกสะอาด
• ขนไก่หรือพู่กัน
• น้ำเกลือ 0.9%

🔄 ขั้นตอนรีดไข่
1. จับปลาเมียห่อผ้า เช็ดให้แห้ง
2. รีดจากท้องลงไปช่องเพศ
3. รองไข่ในถ้วยแห้ง
4. ห้ามให้ไข่โดนน้ำ!

🔬 ผสมน้ำเชื้อ (Dry method)
1. รีดน้ำเชื้อตัวผู้ลงบนไข่
2. ใช้ขนไก่คนเบาๆ 1-2 นาที
3. เติมน้ำเกลือ 0.9% ท่วมไข่
4. คนต่ออีก 2-3 นาที
5. ล้างน้ำสะอาด 2-3 ครั้ง

📊 อัตราส่วน
• ตัวผู้ 1 : ตัวเมีย 2-3
• น้ำเชื้อ 1 มล. ผสมไข่ได้ ~500 กรัม`
    },
    {
      id: 'egg-hatching',
      category: 'breeding',
      title: 'การฟักไข่ปลา',
      summary: 'อุณหภูมิและระยะเวลาการฟักไข่',
      content: `🐣 การฟักไข่ปลา

🌡️ อุณหภูมิฟัก
┌───────────┬────────────────┬─────────────┐
│ อุณหภูมิ   │ ระยะเวลาฟัก    │ หมายเหตุ    │
├───────────┼────────────────┼─────────────┤
│ 26-28°C   │ 24-30 ชม.     │ เหมาะสม     │
│ 28-30°C   │ 18-24 ชม.     │ เร็วแต่เสี่ยง │
│ 24-26°C   │ 30-36 ชม.     │ ช้าแต่ปลอดภัย │
└───────────┴────────────────┴─────────────┘

📦 ภาชนะฟัก
• ถังไฟเบอร์ 100-200 ลิตร
• เติมน้ำ 50-80 ลิตร
• เปิดออกซิเจนเบาๆ

💧 การดูแลระหว่างฟัก
• รักษาอุณหภูมิคงที่
• เปิดออกซิเจนตลอด
• เก็บไข่เสีย (สีขาวขุ่น) ออก
• ไม่ต้องให้แสง

📈 ขั้นตอนการพัฒนา
• 4-6 ชม.: เห็นการแบ่งเซลล์
• 8-12 ชม.: เห็นแกนร่างกาย
• 16-20 ชม.: เห็นหัวใจเต้น
• 20-28 ชม.: ลูกปลาฟักออก

🐟 หลังฟัก
• ลูกปลามีถุงไข่แดง 2-3 วัน
• ไม่ต้องให้อาหาร
• วันที่ 3-4 เริ่มให้ไรแดง/อาร์ทีเมีย`
    },
    {
      id: 'sex-reversal-mt',
      category: 'nursery',
      title: 'การแปลงเพศด้วย 17α-MT',
      summary: 'วิธีแปลงเพศลูกปลาให้เป็นเพศผู้',
      content: `♂️ การแปลงเพศด้วย 17α-Methyltestosterone

📋 หลักการ
• ให้ฮอร์โมนเพศผู้ผสมอาหาร
• ลูกปลาจะเปลี่ยนเป็นเพศผู้
• ใช้กับปลานิล/ปลาทับทิม

⏰ ช่วงเวลาที่เหมาะสม
• เริ่มให้ตั้งแต่ลูกปลากินอาหาร
• อายุ 7-14 วัน (ถุงไข่แดงยุบ)
• ให้ต่อเนื่อง 21-28 วัน

💊 อัตราการผสม
┌─────────────┬────────────────┐
│ MT          │ 60 มก./อาหาร 1 กก. │
└─────────────┴────────────────┘

📝 วิธีผสมอาหาร
1. ละลาย MT ในแอลกอฮอล์ 95%
   (60 มก. ต่อแอลกอฮอล์ 50 มล.)
2. ผสมกับอาหารผง 1 กก.
3. คลุกให้เข้ากัน
4. ผึ่งให้แอลกอฮอล์ระเหย (ในร่ม)
5. เก็บในภาชนะปิดมิดชิด

🍽️ การให้อาหาร
• วันละ 4-6 มื้อ
• ให้กินหมดภายใน 15 นาที
• ให้ทุกวันไม่ขาด 21-28 วัน

📊 ผลลัพธ์
• อัตราแปลงเพศ: 95-99%
• ปลาเพศผู้โตเร็วกว่าเพศเมีย 30%

⚠️ ข้อควรระวัง
• MT เป็นสารควบคุม
• ใช้ในโรงเพาะฟักเท่านั้น
• ไม่ใช้กับปลาขาย`
    },
    {
      id: 'oral-medication',
      category: 'nursery',
      title: 'การให้ยาทางอาหาร',
      summary: 'วิธีผสมยาปฏิชีวนะกับอาหารปลา',
      content: `💊 การให้ยาทางอาหาร

📋 ข้อบ่งใช้
• ปลาเริ่มป่วย ยังกินอาหาร
• ป้องกันโรคในช่วงเสี่ยง
• หลังขนย้าย/เปลี่ยนน้ำ

💉 ยาที่ใช้บ่อย
┌──────────────┬────────────────┬─────────────┐
│ ยา           │ ขนาด/อาหาร 1 กก. │ ระยะเวลา   │
├──────────────┼────────────────┼─────────────┤
│ Oxytetracycline │ 3-5 กรัม    │ 5-7 วัน     │
│ Enrofloxacin │ 1-2 กรัม      │ 5-7 วัน     │
│ Sulfadiazine │ 5-10 กรัม     │ 5-7 วัน     │
│ Amoxicillin  │ 2-4 กรัม      │ 5 วัน       │
└──────────────┴────────────────┴─────────────┘

📝 วิธีผสม
1. ละลายยาในน้ำอุ่นเล็กน้อย
2. ผสมน้ำมันพืช 1 ช้อนโต๊ะ
3. คลุกกับอาหาร 1 กก.
4. ตากให้แห้งในร่ม
5. เก็บใช้ภายใน 24 ชม.

🍽️ การให้อาหาร
• ลดอาหารเหลือ 50-70%
• แบ่งให้ 2-3 มื้อ
• ให้กินหมดภายใน 15 นาที

⚠️ ข้อควรระวัง
• หยุดยา 7-14 วันก่อนจับขาย
• ไม่ใช้ยาหมดอายุ
• บันทึกการใช้ยาทุกครั้ง`
    },
    {
      id: 'nursery-stages',
      category: 'nursery',
      title: 'การอนุบาลลูกปลาระยะต่างๆ',
      summary: 'การดูแลลูกปลาตั้งแต่ฟักจนพร้อมจำหน่าย',
      content: `🐟 การอนุบาลลูกปลาระยะต่างๆ

📊 ระยะการเจริญเติบโต
┌────────────┬─────────────┬──────────────┐
│ ระยะ       │ อายุ        │ ขนาด         │
├────────────┼─────────────┼──────────────┤
│ ถุงไข่แดง   │ 0-3 วัน     │ 3-5 มม.      │
│ ลูกน้ำ      │ 3-14 วัน    │ 5-15 มม.     │
│ ลูกปลา     │ 14-30 วัน   │ 1-3 ซม.      │
│ ปลาวัยอ่อน  │ 1-2 เดือน   │ 3-5 ซม.      │
│ พร้อมขาย   │ 2-3 เดือน   │ 5-8 ซม.      │
└────────────┴─────────────┴──────────────┘

🍽️ อาหารแต่ละระยะ

1️⃣ ระยะถุงไข่แดง (0-3 วัน)
• ไม่ต้องให้อาหาร
• รักษาคุณภาพน้ำ

2️⃣ ระยะลูกน้ำ (3-14 วัน)
• ไข่แดงต้มบด
• ไรแดง/อาร์ทีเมีย
• ให้วันละ 6-8 มื้อ

3️⃣ ระยะลูกปลา (14-30 วัน)
• อาหารเม็ดจิ๋ว (เบอร์ 0)
• ไรแดง/ไรน้ำ
• ให้วันละ 4-6 มื้อ

4️⃣ ระยะวัยอ่อน (1-2 เดือน)
• อาหารเม็ดเบอร์ 1
• ลดมื้อเหลือ 3-4 มื้อ

💧 คุณภาพน้ำ
• อุณหภูมิ: 26-30°C
• pH: 7.0-8.0
• ออกซิเจน: > 4 mg/L
• เปลี่ยนน้ำ 20-30% ทุก 2-3 วัน

📈 อัตราปล่อย
• ลูกน้ำ: 500-1000 ตัว/ลิตร
• ลูกปลา: 100-200 ตัว/ลิตร
• วัยอ่อน: 50-100 ตัว/ลิตร`
    },
    {
      id: 'pituitary-extraction',
      category: 'breeding',
      title: 'การเตรียมต่อมใต้สมอง',
      summary: 'วิธีสกัดต่อมใต้สมองจากปลาผู้บริจาค',
      content: `🧠 การเตรียมต่อมใต้สมอง

📋 ปลาผู้บริจาค
• ปลาดุก/ปลาสวายสุกงอม
• น้ำหนัก 500-1000 กรัม
• เพิ่งตายไม่เกิน 1-2 ชม.

🔬 อุปกรณ์
• มีดคม/กรรไกรผ่าตัด
• ปากคีบ
• น้ำเกลือ 0.9%
• ขวดเก็บมีฝาปิด

📍 ตำแหน่งต่อมใต้สมอง
• อยู่ใต้สมอง
• บริเวณหลังตา
• สีขาว ขนาดเท่าเมล็ดข้าว

🔄 ขั้นตอน
1. ตัดหัวปลาแนวขวาง
2. ใช้มีดเปิดกะโหลกจากด้านบน
3. หาต่อมใต้สมอง (ก้อนสีขาว)
4. ใช้ปากคีบหยิบอย่างระวัง
5. แช่น้ำเกลือ 0.9%

💉 วิธีใช้
• บดต่อมใต้สมองในครกเซรามิก
• ผสมน้ำเกลือ 0.5-1 มล.
• กรองผ่านผ้าขาวบาง
• ฉีดทันที

📊 อัตราใช้
• ตัวเมีย: 1 ต่อม/ปลา 1 กก.
• ตัวผู้: ครึ่งต่อม/ปลา 1 กก.

💡 การเก็บรักษา
• เก็บในอะซิโตน -20°C
• อยู่ได้ 6-12 เดือน
• แช่แข็งสด: 1-2 สัปดาห์`
    }
  ];

  // Add guides to window
  window.BREEDING_GUIDES = BREEDING_GUIDES;

  // ===== Initialize on Load =====
  const initBreedingModule = () => {
    console.log('🐟 Fish Farm Breeding Module v1.0.0 loaded');
    console.log('Available databases: broodstockDb, hormoneStockDb, hormoneLogsDb, breedingCyclesDb, nurseryTanksDb, nurseryBatchesDb, sexReversalDb, fingerlingStockDb, customersDb, ordersDb, salesDb');
    console.log('Reports: breedingReports');

    // Add breeding guides to main guides if available
    if (window.KEYS && window.storage) {
      const existingGuides = window.storage.get(window.KEYS.GUIDES) || [];
      const existingIds = new Set(existingGuides.map(g => g.id));

      let addedCount = 0;
      BREEDING_GUIDES.forEach(guide => {
        if (!existingIds.has(guide.id)) {
          existingGuides.push({
            ...guide,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
          addedCount++;
        }
      });

      if (addedCount > 0) {
        window.storage.set(window.KEYS.GUIDES, existingGuides);
        console.log(`Added ${addedCount} new breeding guides`);
      }
    }
  };

  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBreedingModule);
  } else {
    initBreedingModule();
  }

  // Export module version
  window.BREEDING_MODULE_VERSION = '1.0.0';

})();
