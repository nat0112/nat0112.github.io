// ===== Fish Farm Pro - Breeding & Sales UI Module =====
// Version: 1.0.0
// This module provides UI for breeding, nursery, and sales features

(function() {
  'use strict';

  // Wait for main app and breeding module to load
  const initUI = () => {
    if (!window.broodstockDb || !window.storage) {
      setTimeout(initUI, 100);
      return;
    }

    console.log('🎨 Fish Farm Breeding UI Module loaded');

    // ===== State Management =====
    const breedingState = {
      currentView: 'breeding-main', // breeding-main, broodstock, hormone, nursery, sales, customers, orders
      selectedBroodstock: null,
      selectedCustomer: null,
      selectedOrder: null,
      selectedBatch: null,
      breedingTab: 'broodstock', // broodstock, hormone, cycles
      salesTab: 'sales', // sales, customers, orders
      nurseryTab: 'batches', // batches, tanks
      modal: null
    };

    window.breedingState = breedingState;

    const setBreedingState = (newState) => {
      Object.assign(breedingState, newState);
      renderBreedingModule();
    };
    window.setBreedingState = setBreedingState;

    // ===== Utility Functions =====
    const formatCurrency = (n) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(n || 0);
    const formatNumber = (n, d = 0) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
    const formatDate = (date) => date ? new Date(date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
    const formatDateTime = (date) => date ? new Date(date).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

    // Get fish type name
    const getFishTypeName = (id) => {
      if (!id) return 'ไม่ระบุ';
      const types = window.db?.fishTypes?.getAll() || [];
      const type = types.find(t => t.id === id);
      return type?.name || 'ไม่ระบุ';
    };

    // ===== Main Breeding Module Render =====
    const renderBreedingModule = () => {
      const container = document.getElementById('breeding-module-container');
      if (!container) return;

      let content = '';

      switch (breedingState.currentView) {
        case 'breeding-main':
          content = renderBreedingMain();
          break;
        case 'broodstock':
          content = renderBroodstockList();
          break;
        case 'broodstock-detail':
          content = renderBroodstockDetail();
          break;
        case 'nursery':
          content = renderNurseryMain();
          break;
        case 'nursery-detail':
          content = renderNurseryBatchDetail();
          break;
        case 'sales':
          content = renderSalesMain();
          break;
        case 'customers':
          content = renderCustomerList();
          break;
        case 'customer-detail':
          content = renderCustomerDetail();
          break;
        case 'orders':
          content = renderOrderList();
          break;
        default:
          content = renderBreedingMain();
      }

      container.innerHTML = content + renderBreedingModal();
    };
    window.renderBreedingModule = renderBreedingModule;

    // ===== Breeding Main Dashboard =====
    const renderBreedingMain = () => {
      const broodstock = window.broodstockDb.getAll();
      const females = broodstock.filter(b => b.gender === 'female' && b.status === 'active');
      const males = broodstock.filter(b => b.gender === 'male' && b.status === 'active');
      const batches = window.nurseryBatchesDb.getActive();
      const customers = window.customersDb.getAll();
      const pendingOrders = window.ordersDb.getPending();
      const fingerlings = window.fingerlingStockDb.getAvailable();
      const totalFingerlings = fingerlings.reduce((sum, f) => sum + f.availableCount, 0);

      return `
        <div class="p-4 pb-24 fade-in">
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <div>
              <h1 class="text-xl font-bold text-slate-100">เพาะพันธุ์ & ขาย</h1>
              <p class="text-slate-400 text-sm">จัดการการเพาะ อนุบาล และการขาย</p>
            </div>
          </div>

          <!-- Quick Stats -->
          <div class="grid grid-cols-2 gap-3 mb-6">
            <div class="bg-amber-500/20 rounded-xl p-4 border border-amber-500/30">
              <div class="text-amber-400 text-2xl font-bold">${females.length}/${males.length}</div>
              <div class="text-slate-300 text-sm">แม่/พ่อพันธุ์</div>
            </div>
            <div class="bg-blue-500/20 rounded-xl p-4 border border-blue-500/30">
              <div class="text-blue-400 text-2xl font-bold">${batches.length}</div>
              <div class="text-slate-300 text-sm">รุ่นอนุบาล</div>
            </div>
            <div class="bg-cyan-500/20 rounded-xl p-4 border border-cyan-500/30">
              <div class="text-cyan-400 text-2xl font-bold">${formatNumber(totalFingerlings)}</div>
              <div class="text-slate-300 text-sm">ลูกปลาพร้อมขาย</div>
            </div>
            <div class="bg-green-500/20 rounded-xl p-4 border border-green-500/30">
              <div class="text-green-400 text-2xl font-bold">${pendingOrders.length}</div>
              <div class="text-slate-300 text-sm">รอส่งมอบ</div>
            </div>
          </div>

          <!-- Menu Cards -->
          <div class="space-y-3">
            <!-- Broodstock -->
            <div onclick="setBreedingState({currentView:'broodstock'})" class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 active:scale-[0.98] transition-transform cursor-pointer">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center text-2xl">🐟</div>
                <div class="flex-1">
                  <div class="text-slate-100 font-medium">พ่อแม่พันธุ์</div>
                  <div class="text-slate-400 text-sm">จัดการพ่อแม่พันธุ์ ${broodstock.length} ตัว</div>
                </div>
                <div class="text-slate-500">›</div>
              </div>
            </div>

            <!-- Nursery -->
            <div onclick="setBreedingState({currentView:'nursery'})" class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 active:scale-[0.98] transition-transform cursor-pointer">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-2xl">🍼</div>
                <div class="flex-1">
                  <div class="text-slate-100 font-medium">อนุบาล</div>
                  <div class="text-slate-400 text-sm">ถังอนุบาล & รุ่นลูกปลา</div>
                </div>
                <div class="text-slate-500">›</div>
              </div>
            </div>

            <!-- Sales -->
            <div onclick="setBreedingState({currentView:'sales'})" class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 active:scale-[0.98] transition-transform cursor-pointer">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center text-2xl">💰</div>
                <div class="flex-1">
                  <div class="text-slate-100 font-medium">การขาย</div>
                  <div class="text-slate-400 text-sm">บันทึกขาย & ใบเสร็จ</div>
                </div>
                <div class="text-slate-500">›</div>
              </div>
            </div>

            <!-- Customers -->
            <div onclick="setBreedingState({currentView:'customers'})" class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 active:scale-[0.98] transition-transform cursor-pointer">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center text-2xl">👥</div>
                <div class="flex-1">
                  <div class="text-slate-100 font-medium">ลูกค้า/พ่อค้า</div>
                  <div class="text-slate-400 text-sm">${customers.length} ราย</div>
                </div>
                <div class="text-slate-500">›</div>
              </div>
            </div>

            <!-- Orders -->
            <div onclick="setBreedingState({currentView:'orders'})" class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 active:scale-[0.98] transition-transform cursor-pointer">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center text-2xl">📋</div>
                <div class="flex-1">
                  <div class="text-slate-100 font-medium">การจอง</div>
                  <div class="text-slate-400 text-sm">${pendingOrders.length} รายการรอดำเนินการ</div>
                </div>
                <div class="text-slate-500">›</div>
              </div>
            </div>
          </div>
        </div>
      `;
    };

    // ===== Broodstock List =====
    const renderBroodstockList = () => {
      const broodstock = window.broodstockDb.getAll();
      const females = broodstock.filter(b => b.gender === 'female');
      const males = broodstock.filter(b => b.gender === 'male');

      return `
        <div class="p-4 pb-24 fade-in">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-6">
            <button onclick="setBreedingState({currentView:'breeding-main'})" class="p-2 hover:bg-slate-700/50 rounded-xl">
              <span class="text-xl">←</span>
            </button>
            <div class="flex-1">
              <h1 class="text-xl font-bold text-slate-100">พ่อแม่พันธุ์</h1>
              <p class="text-slate-400 text-sm">ทั้งหมด ${broodstock.length} ตัว</p>
            </div>
            <button onclick="showAddBroodstockModal()" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium">
              + เพิ่ม
            </button>
          </div>

          <!-- Tabs -->
          <div class="flex gap-2 mb-4">
            <button onclick="filterBroodstock('all')" id="broodAll" class="flex-1 py-2 px-3 rounded-xl text-sm font-medium bg-amber-500/20 border border-amber-500/50 text-amber-400">
              ทั้งหมด (${broodstock.length})
            </button>
            <button onclick="filterBroodstock('female')" id="broodFemale" class="flex-1 py-2 px-3 rounded-xl text-sm font-medium bg-slate-700/50 border border-slate-600 text-slate-300">
              ♀ แม่พันธุ์ (${females.length})
            </button>
            <button onclick="filterBroodstock('male')" id="broodMale" class="flex-1 py-2 px-3 rounded-xl text-sm font-medium bg-slate-700/50 border border-slate-600 text-slate-300">
              ♂ พ่อพันธุ์ (${males.length})
            </button>
          </div>

          <!-- List -->
          <div id="broodstockList" class="space-y-3">
            ${broodstock.length === 0 ? `
              <div class="text-center py-12 text-slate-500">
                <div class="text-4xl mb-2">🐟</div>
                <div>ยังไม่มีพ่อแม่พันธุ์</div>
                <button onclick="showAddBroodstockModal()" class="mt-4 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm">
                  + เพิ่มพ่อแม่พันธุ์
                </button>
              </div>
            ` : broodstock.map(b => `
              <div onclick="viewBroodstock('${b.id}')" class="broodstock-item bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 cursor-pointer active:scale-[0.98] transition-transform" data-gender="${b.gender}">
                <div class="flex items-center gap-3">
                  <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${b.gender === 'female' ? 'bg-pink-500/20' : 'bg-blue-500/20'}">
                    ${b.gender === 'female' ? '♀' : '♂'}
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-slate-100 font-medium">${b.code}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full ${b.status === 'active' ? 'bg-green-500/20 text-green-400' : b.status === 'resting' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-400'}">
                        ${b.status === 'active' ? 'พร้อม' : b.status === 'resting' ? 'พักฟื้น' : 'ปลด'}
                      </span>
                    </div>
                    <div class="text-slate-400 text-sm">${getFishTypeName(b.fishTypeId)} • ${formatNumber(b.weight)} ก.</div>
                    <div class="text-slate-500 text-xs">เพาะ ${b.breedingCount || 0} ครั้ง</div>
                  </div>
                  <div class="text-slate-500">›</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    };

    // Filter broodstock
    window.filterBroodstock = (gender) => {
      const items = document.querySelectorAll('.broodstock-item');
      items.forEach(item => {
        if (gender === 'all' || item.dataset.gender === gender) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      });

      // Update tab styles
      ['broodAll', 'broodFemale', 'broodMale'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
          if ((id === 'broodAll' && gender === 'all') ||
              (id === 'broodFemale' && gender === 'female') ||
              (id === 'broodMale' && gender === 'male')) {
            btn.className = 'flex-1 py-2 px-3 rounded-xl text-sm font-medium bg-amber-500/20 border border-amber-500/50 text-amber-400';
          } else {
            btn.className = 'flex-1 py-2 px-3 rounded-xl text-sm font-medium bg-slate-700/50 border border-slate-600 text-slate-300';
          }
        }
      });
    };

    // View broodstock detail
    window.viewBroodstock = (id) => {
      setBreedingState({ currentView: 'broodstock-detail', selectedBroodstock: id });
    };

    // ===== Broodstock Detail =====
    const renderBroodstockDetail = () => {
      const b = window.broodstockDb.getById(breedingState.selectedBroodstock);
      if (!b) return renderBroodstockList();

      const hormoneLogs = window.hormoneLogsDb.getByBroodstock(b.id);

      return `
        <div class="p-4 pb-24 fade-in">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-6">
            <button onclick="setBreedingState({currentView:'broodstock'})" class="p-2 hover:bg-slate-700/50 rounded-xl">
              <span class="text-xl">←</span>
            </button>
            <div class="flex-1">
              <h1 class="text-xl font-bold text-slate-100">${b.code}</h1>
              <p class="text-slate-400 text-sm">${b.gender === 'female' ? 'แม่พันธุ์' : 'พ่อพันธุ์'}</p>
            </div>
            <button onclick="showEditBroodstockModal('${b.id}')" class="p-2 hover:bg-slate-700/50 rounded-xl text-slate-400">
              ✏️
            </button>
          </div>

          <!-- Info Card -->
          <div class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 mb-4">
            <div class="flex items-center gap-4 mb-4">
              <div class="w-16 h-16 rounded-xl flex items-center justify-center text-3xl ${b.gender === 'female' ? 'bg-pink-500/20' : 'bg-blue-500/20'}">
                ${b.gender === 'female' ? '♀' : '♂'}
              </div>
              <div>
                <div class="text-slate-100 font-bold text-lg">${getFishTypeName(b.fishTypeId)}</div>
                <span class="text-xs px-2 py-1 rounded-full ${b.status === 'active' ? 'bg-green-500/20 text-green-400' : b.status === 'resting' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-400'}">
                  ${b.status === 'active' ? 'พร้อมเพาะ' : b.status === 'resting' ? 'พักฟื้น' : 'ปลดระวาง'}
                </span>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="bg-slate-700/30 rounded-xl p-3">
                <div class="text-slate-500 text-xs">น้ำหนัก</div>
                <div class="text-slate-100 font-medium">${formatNumber(b.weight)} กรัม</div>
              </div>
              <div class="bg-slate-700/30 rounded-xl p-3">
                <div class="text-slate-500 text-xs">อายุ</div>
                <div class="text-slate-100 font-medium">${b.age ? b.age + ' เดือน' : '-'}</div>
              </div>
              <div class="bg-slate-700/30 rounded-xl p-3">
                <div class="text-slate-500 text-xs">เพาะแล้ว</div>
                <div class="text-slate-100 font-medium">${b.breedingCount || 0} ครั้ง</div>
              </div>
              <div class="bg-slate-700/30 rounded-xl p-3">
                <div class="text-slate-500 text-xs">เพาะล่าสุด</div>
                <div class="text-slate-100 font-medium">${formatDate(b.lastBreedingDate)}</div>
              </div>
            </div>

            ${b.notes ? `
              <div class="mt-3 p-3 bg-slate-700/30 rounded-xl">
                <div class="text-slate-500 text-xs mb-1">หมายเหตุ</div>
                <div class="text-slate-300 text-sm">${b.notes}</div>
              </div>
            ` : ''}
          </div>

          <!-- Hormone Logs -->
          <div class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 mb-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-slate-200 font-medium">ประวัติฉีดฮอร์โมน</h3>
              <button onclick="showAddHormoneLogModal('${b.id}')" class="text-sm text-amber-400">+ บันทึก</button>
            </div>
            ${hormoneLogs.length === 0 ? `
              <div class="text-center py-6 text-slate-500 text-sm">ยังไม่มีประวัติ</div>
            ` : `
              <div class="space-y-2">
                ${hormoneLogs.slice(0, 5).map(log => `
                  <div class="bg-slate-700/30 rounded-xl p-3">
                    <div class="flex items-center justify-between">
                      <span class="text-slate-200 text-sm">${window.HORMONE_TYPES.find(h => h.id === log.hormoneType)?.name || log.hormoneType}</span>
                      <span class="text-slate-400 text-xs">${formatDateTime(log.injectionTime)}</span>
                    </div>
                    <div class="text-slate-400 text-xs mt-1">
                      ครั้งที่ ${log.injectionNumber} • ${log.dosage} ${log.unit}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Actions -->
          <div class="grid grid-cols-2 gap-3">
            <button onclick="updateBroodstockStatus('${b.id}', '${b.status === 'active' ? 'resting' : 'active'}')" class="py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-medium">
              ${b.status === 'active' ? '😴 พักฟื้น' : '✅ พร้อมเพาะ'}
            </button>
            <button onclick="confirmDeleteBroodstock('${b.id}')" class="py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl font-medium">
              🗑️ ลบ
            </button>
          </div>
        </div>
      `;
    };

    // ===== Nursery Main =====
    const renderNurseryMain = () => {
      const tanks = window.nurseryTanksDb.getAll();
      const batches = window.nurseryBatchesDb.getActive();
      const availableTanks = tanks.filter(t => t.status === 'empty');

      return `
        <div class="p-4 pb-24 fade-in">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-6">
            <button onclick="setBreedingState({currentView:'breeding-main'})" class="p-2 hover:bg-slate-700/50 rounded-xl">
              <span class="text-xl">←</span>
            </button>
            <div class="flex-1">
              <h1 class="text-xl font-bold text-slate-100">อนุบาล</h1>
              <p class="text-slate-400 text-sm">${batches.length} รุ่น กำลังอนุบาล</p>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex gap-2 mb-4">
            <button onclick="setBreedingState({nurseryTab:'batches'})" class="${breedingState.nurseryTab === 'batches' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-slate-700/50 border-slate-600 text-slate-300'} flex-1 py-2 px-3 rounded-xl text-sm font-medium border">
              🍼 รุ่นลูกปลา
            </button>
            <button onclick="setBreedingState({nurseryTab:'tanks'})" class="${breedingState.nurseryTab === 'tanks' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-slate-700/50 border-slate-600 text-slate-300'} flex-1 py-2 px-3 rounded-xl text-sm font-medium border">
              🪣 ถังอนุบาล
            </button>
          </div>

          ${breedingState.nurseryTab === 'batches' ? `
            <!-- Batches List -->
            <div class="flex justify-end mb-3">
              <button onclick="showAddNurseryBatchModal()" class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium">
                + เพิ่มรุ่น
              </button>
            </div>
            <div class="space-y-3">
              ${batches.length === 0 ? `
                <div class="text-center py-12 text-slate-500">
                  <div class="text-4xl mb-2">🍼</div>
                  <div>ยังไม่มีรุ่นอนุบาล</div>
                </div>
              ` : batches.map(batch => {
                const tank = window.nurseryTanksDb.getById(batch.tankId);
                const ageInDays = Math.floor((Date.now() - new Date(batch.startDate).getTime()) / (1000 * 60 * 60 * 24));
                const survivalRate = batch.initialCount > 0 ? ((batch.currentCount / batch.initialCount) * 100).toFixed(1) : 0;
                return `
                  <div onclick="viewNurseryBatch('${batch.id}')" class="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 cursor-pointer active:scale-[0.98] transition-transform">
                    <div class="flex items-center gap-3">
                      <div class="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-xl">🐟</div>
                      <div class="flex-1">
                        <div class="flex items-center gap-2">
                          <span class="text-slate-100 font-medium">${batch.code}</span>
                          <span class="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">${batch.stage}</span>
                        </div>
                        <div class="text-slate-400 text-sm">${getFishTypeName(batch.fishTypeId)} • ${tank?.name || '-'}</div>
                        <div class="text-slate-500 text-xs">อายุ ${ageInDays} วัน • รอด ${survivalRate}%</div>
                      </div>
                      <div class="text-right">
                        <div class="text-cyan-400 font-medium">${formatNumber(batch.currentCount)}</div>
                        <div class="text-slate-500 text-xs">ตัว</div>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <!-- Tanks List -->
            <div class="flex justify-end mb-3">
              <button onclick="showAddTankModal()" class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium">
                + เพิ่มถัง
              </button>
            </div>
            <div class="space-y-3">
              ${tanks.length === 0 ? `
                <div class="text-center py-12 text-slate-500">
                  <div class="text-4xl mb-2">🪣</div>
                  <div>ยังไม่มีถังอนุบาล</div>
                </div>
              ` : tanks.map(tank => `
                <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                  <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl ${tank.status === 'empty' ? 'bg-green-500/20' : tank.status === 'in_use' ? 'bg-blue-500/20' : 'bg-amber-500/20'}">
                      🪣
                    </div>
                    <div class="flex-1">
                      <div class="text-slate-100 font-medium">${tank.name}</div>
                      <div class="text-slate-400 text-sm">${tank.capacity} ${tank.capacityUnit === 'liters' ? 'ลิตร' : 'ลบ.ม.'}</div>
                    </div>
                    <span class="text-xs px-2 py-1 rounded-full ${tank.status === 'empty' ? 'bg-green-500/20 text-green-400' : tank.status === 'in_use' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}">
                      ${tank.status === 'empty' ? 'ว่าง' : tank.status === 'in_use' ? 'ใช้งาน' : 'ซ่อมบำรุง'}
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;
    };

    // View nursery batch
    window.viewNurseryBatch = (id) => {
      setBreedingState({ currentView: 'nursery-detail', selectedBatch: id });
    };

    // ===== Nursery Batch Detail =====
    const renderNurseryBatchDetail = () => {
      const batch = window.nurseryBatchesDb.getById(breedingState.selectedBatch);
      if (!batch) return renderNurseryMain();

      const tank = window.nurseryTanksDb.getById(batch.tankId);
      const ageInDays = Math.floor((Date.now() - new Date(batch.startDate).getTime()) / (1000 * 60 * 60 * 24));
      const survivalRate = batch.initialCount > 0 ? ((batch.currentCount / batch.initialCount) * 100).toFixed(1) : 0;

      return `
        <div class="p-4 pb-24 fade-in">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-6">
            <button onclick="setBreedingState({currentView:'nursery'})" class="p-2 hover:bg-slate-700/50 rounded-xl">
              <span class="text-xl">←</span>
            </button>
            <div class="flex-1">
              <h1 class="text-xl font-bold text-slate-100">${batch.code}</h1>
              <p class="text-slate-400 text-sm">${getFishTypeName(batch.fishTypeId)}</p>
            </div>
          </div>

          <!-- Info Card -->
          <div class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 mb-4">
            <div class="grid grid-cols-2 gap-3 mb-4">
              <div class="bg-slate-700/30 rounded-xl p-3">
                <div class="text-slate-500 text-xs">จำนวนปัจจุบัน</div>
                <div class="text-cyan-400 font-bold text-lg">${formatNumber(batch.currentCount)} ตัว</div>
              </div>
              <div class="bg-slate-700/30 rounded-xl p-3">
                <div class="text-slate-500 text-xs">อัตรารอด</div>
                <div class="text-green-400 font-bold text-lg">${survivalRate}%</div>
              </div>
              <div class="bg-slate-700/30 rounded-xl p-3">
                <div class="text-slate-500 text-xs">อายุ</div>
                <div class="text-slate-100 font-medium">${ageInDays} วัน</div>
              </div>
              <div class="bg-slate-700/30 rounded-xl p-3">
                <div class="text-slate-500 text-xs">น้ำหนักเฉลี่ย</div>
                <div class="text-slate-100 font-medium">${batch.avgWeight || 0} ก.</div>
              </div>
              <div class="bg-slate-700/30 rounded-xl p-3">
                <div class="text-slate-500 text-xs">ระยะ</div>
                <div class="text-slate-100 font-medium">${batch.stage}</div>
              </div>
              <div class="bg-slate-700/30 rounded-xl p-3">
                <div class="text-slate-500 text-xs">ถัง</div>
                <div class="text-slate-100 font-medium">${tank?.name || '-'}</div>
              </div>
            </div>

            ${batch.sexReversal?.enabled ? `
              <div class="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl mb-3">
                <div class="flex items-center gap-2 text-purple-400 text-sm font-medium mb-1">
                  ♂ การแปลงเพศ
                </div>
                <div class="text-slate-300 text-sm">
                  ${window.SEX_REVERSAL_METHODS.find(m => m.id === batch.sexReversal.method)?.name || batch.sexReversal.method}
                </div>
                <div class="text-slate-500 text-xs">
                  สถานะ: ${batch.sexReversal.status === 'in_progress' ? 'กำลังดำเนินการ' : batch.sexReversal.status === 'completed' ? 'เสร็จสิ้น' : 'รอเริ่ม'}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Growth Records -->
          <div class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 mb-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-slate-200 font-medium">บันทึกการเจริญเติบโต</h3>
              <button onclick="showRecordGrowthModal('${batch.id}')" class="text-sm text-blue-400">+ บันทึก</button>
            </div>
            ${(batch.growthRecords || []).length === 0 ? `
              <div class="text-center py-4 text-slate-500 text-sm">ยังไม่มีบันทึก</div>
            ` : `
              <div class="space-y-2">
                ${batch.growthRecords.slice(-5).reverse().map(r => `
                  <div class="bg-slate-700/30 rounded-xl p-3 flex justify-between items-center">
                    <span class="text-slate-400 text-sm">${formatDate(r.date)}</span>
                    <span class="text-slate-100">${r.avgWeight} ก. (${r.sampleCount} ตัว)</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Actions -->
          <div class="grid grid-cols-2 gap-3">
            <button onclick="showRecordMortalityModal('${batch.id}')" class="py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl font-medium text-sm">
              💀 บันทึกตาย
            </button>
            <button onclick="showTransferToStockModal('${batch.id}')" class="py-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-xl font-medium text-sm">
              📦 ย้ายเข้าสต๊อก
            </button>
          </div>
        </div>
      `;
    };

    // ===== Sales Main =====
    const renderSalesMain = () => {
      const sales = window.salesDb.getAll().sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate));
      const today = new Date().toISOString().split('T')[0];
      const todaySales = sales.filter(s => s.saleDate.startsWith(today));
      const todayRevenue = todaySales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);

      return `
        <div class="p-4 pb-24 fade-in">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-6">
            <button onclick="setBreedingState({currentView:'breeding-main'})" class="p-2 hover:bg-slate-700/50 rounded-xl">
              <span class="text-xl">←</span>
            </button>
            <div class="flex-1">
              <h1 class="text-xl font-bold text-slate-100">การขาย</h1>
              <p class="text-slate-400 text-sm">ยอดวันนี้ ${formatCurrency(todayRevenue)}</p>
            </div>
            <button onclick="showNewSaleModal()" class="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-medium">
              + ขาย
            </button>
          </div>

          <!-- Summary -->
          <div class="grid grid-cols-2 gap-3 mb-6">
            <div class="bg-green-500/20 rounded-xl p-4 border border-green-500/30">
              <div class="text-green-400 text-2xl font-bold">${todaySales.length}</div>
              <div class="text-slate-300 text-sm">รายการวันนี้</div>
            </div>
            <div class="bg-cyan-500/20 rounded-xl p-4 border border-cyan-500/30">
              <div class="text-cyan-400 text-lg font-bold">${formatCurrency(todayRevenue)}</div>
              <div class="text-slate-300 text-sm">ยอดขายวันนี้</div>
            </div>
          </div>

          <!-- Recent Sales -->
          <h3 class="text-slate-300 font-medium mb-3">รายการขายล่าสุด</h3>
          <div class="space-y-3">
            ${sales.length === 0 ? `
              <div class="text-center py-12 text-slate-500">
                <div class="text-4xl mb-2">💰</div>
                <div>ยังไม่มีรายการขาย</div>
              </div>
            ` : sales.slice(0, 20).map(sale => `
              <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-slate-100 font-medium">${sale.customerName || 'ลูกค้าทั่วไป'}</span>
                  <span class="text-green-400 font-bold">${formatCurrency(sale.totalAmount)}</span>
                </div>
                <div class="flex items-center justify-between text-sm">
                  <span class="text-slate-400">${sale.receiptNumber}</span>
                  <span class="text-slate-500">${formatDateTime(sale.saleDate)}</span>
                </div>
                <div class="text-slate-500 text-xs mt-1">
                  ${sale.totalQuantity} ตัว • ${sale.paymentMethod === 'cash' ? 'เงินสด' : sale.paymentMethod === 'transfer' ? 'โอน' : 'เครดิต'}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    };

    // ===== Customer List =====
    const renderCustomerList = () => {
      const customers = window.customersDb.getAll().sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));

      return `
        <div class="p-4 pb-24 fade-in">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-6">
            <button onclick="setBreedingState({currentView:'breeding-main'})" class="p-2 hover:bg-slate-700/50 rounded-xl">
              <span class="text-xl">←</span>
            </button>
            <div class="flex-1">
              <h1 class="text-xl font-bold text-slate-100">ลูกค้า/พ่อค้า</h1>
              <p class="text-slate-400 text-sm">${customers.length} ราย</p>
            </div>
            <button onclick="showAddCustomerModal()" class="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-sm font-medium">
              + เพิ่ม
            </button>
          </div>

          <!-- Search -->
          <div class="mb-4">
            <input type="text" id="customerSearch" oninput="searchCustomers(this.value)" placeholder="🔍 ค้นหาชื่อ, เบอร์โทร..."
              class="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500">
          </div>

          <!-- Customer List -->
          <div id="customerListContainer" class="space-y-3">
            ${customers.length === 0 ? `
              <div class="text-center py-12 text-slate-500">
                <div class="text-4xl mb-2">👥</div>
                <div>ยังไม่มีรายชื่อลูกค้า</div>
                <button onclick="showAddCustomerModal()" class="mt-4 px-4 py-2 bg-purple-500 text-white rounded-xl text-sm">
                  + เพิ่มลูกค้า
                </button>
              </div>
            ` : customers.map(c => `
              <div onclick="viewCustomer('${c.id}')" class="customer-item bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 cursor-pointer active:scale-[0.98] transition-transform" data-name="${c.name}" data-phone="${c.phone || ''}" data-nickname="${c.nickname || ''}">
                <div class="flex items-center gap-3">
                  <div class="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center text-xl">
                    ${c.isVip ? '⭐' : '👤'}
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-slate-100 font-medium">${c.name}</span>
                      ${c.isVip ? '<span class="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">VIP</span>' : ''}
                    </div>
                    <div class="text-slate-400 text-sm">${c.phone || '-'}</div>
                    ${c.province ? `<div class="text-slate-500 text-xs">📍 ${c.province}</div>` : ''}
                  </div>
                  <div class="text-right">
                    <div class="text-green-400 font-medium">${formatCurrency(c.totalSpent || 0)}</div>
                    <div class="text-slate-500 text-xs">${c.totalOrders || 0} ออเดอร์</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    };

    // Search customers
    window.searchCustomers = (query) => {
      const q = query.toLowerCase();
      const items = document.querySelectorAll('.customer-item');
      items.forEach(item => {
        const name = item.dataset.name.toLowerCase();
        const phone = item.dataset.phone;
        const nickname = item.dataset.nickname.toLowerCase();
        if (name.includes(q) || phone.includes(q) || nickname.includes(q)) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      });
    };

    // View customer
    window.viewCustomer = (id) => {
      setBreedingState({ currentView: 'customer-detail', selectedCustomer: id });
    };

    // ===== Customer Detail =====
    const renderCustomerDetail = () => {
      const c = window.customersDb.getById(breedingState.selectedCustomer);
      if (!c) return renderCustomerList();

      const orders = window.ordersDb.getByCustomer(c.id);
      const sales = window.salesDb.getByCustomer(c.id);

      return `
        <div class="p-4 pb-24 fade-in">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-6">
            <button onclick="setBreedingState({currentView:'customers'})" class="p-2 hover:bg-slate-700/50 rounded-xl">
              <span class="text-xl">←</span>
            </button>
            <div class="flex-1">
              <h1 class="text-xl font-bold text-slate-100">${c.name}</h1>
              <p class="text-slate-400 text-sm">${c.isVip ? '⭐ VIP' : 'ลูกค้า'}</p>
            </div>
            <button onclick="showEditCustomerModal('${c.id}')" class="p-2 hover:bg-slate-700/50 rounded-xl text-slate-400">
              ✏️
            </button>
          </div>

          <!-- Info Card -->
          <div class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 mb-4">
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <span class="text-slate-500 w-20">📞 โทร</span>
                <a href="tel:${c.phone}" class="text-cyan-400">${c.phone || '-'}</a>
              </div>
              ${c.lineId ? `
                <div class="flex items-center gap-3">
                  <span class="text-slate-500 w-20">💬 Line</span>
                  <span class="text-slate-200">${c.lineId}</span>
                </div>
              ` : ''}
              ${c.address ? `
                <div class="flex items-start gap-3">
                  <span class="text-slate-500 w-20">📍 ที่อยู่</span>
                  <span class="text-slate-200">${c.address}${c.province ? `, ${c.province}` : ''}</span>
                </div>
              ` : ''}
              ${c.discount > 0 ? `
                <div class="flex items-center gap-3">
                  <span class="text-slate-500 w-20">🏷️ ส่วนลด</span>
                  <span class="text-green-400">${c.discount}%</span>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Stats -->
          <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="bg-green-500/20 rounded-xl p-4 border border-green-500/30">
              <div class="text-green-400 text-xl font-bold">${formatCurrency(c.totalSpent || 0)}</div>
              <div class="text-slate-300 text-sm">ยอดซื้อสะสม</div>
            </div>
            <div class="bg-blue-500/20 rounded-xl p-4 border border-blue-500/30">
              <div class="text-blue-400 text-xl font-bold">${c.totalOrders || 0}</div>
              <div class="text-slate-300 text-sm">จำนวนออเดอร์</div>
            </div>
          </div>

          <!-- Recent Orders -->
          <div class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 mb-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-slate-200 font-medium">ประวัติการซื้อ</h3>
              <button onclick="showNewSaleModal('${c.id}')" class="text-sm text-green-400">+ ขายให้</button>
            </div>
            ${sales.length === 0 ? `
              <div class="text-center py-4 text-slate-500 text-sm">ยังไม่มีประวัติ</div>
            ` : `
              <div class="space-y-2">
                ${sales.slice(0, 5).map(s => `
                  <div class="bg-slate-700/30 rounded-xl p-3 flex justify-between items-center">
                    <div>
                      <div class="text-slate-300 text-sm">${s.receiptNumber}</div>
                      <div class="text-slate-500 text-xs">${formatDate(s.saleDate)}</div>
                    </div>
                    <span class="text-green-400 font-medium">${formatCurrency(s.totalAmount)}</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Pending Orders -->
          ${orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled').length > 0 ? `
            <div class="bg-amber-500/10 rounded-2xl p-4 border border-amber-500/30 mb-4">
              <h3 class="text-amber-400 font-medium mb-3">📋 รายการจองค้าง</h3>
              <div class="space-y-2">
                ${orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled').map(o => `
                  <div class="bg-slate-800/50 rounded-xl p-3">
                    <div class="flex justify-between items-center">
                      <span class="text-slate-200">${o.orderNumber}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full ${o.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}">
                        ${o.status === 'pending' ? 'รอยืนยัน' : o.status === 'confirmed' ? 'ยืนยันแล้ว' : o.status === 'ready' ? 'พร้อมส่ง' : o.status}
                      </span>
                    </div>
                    <div class="text-slate-400 text-sm">${formatNumber(o.totalQuantity)} ตัว • ${formatCurrency(o.totalAmount)}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Actions -->
          <div class="grid grid-cols-2 gap-3">
            <button onclick="showNewOrderModal('${c.id}')" class="py-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-xl font-medium text-sm">
              📋 รับจอง
            </button>
            <button onclick="confirmDeleteCustomer('${c.id}')" class="py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl font-medium text-sm">
              🗑️ ลบ
            </button>
          </div>
        </div>
      `;
    };

    // ===== Order List =====
    const renderOrderList = () => {
      const orders = window.ordersDb.getAll().sort((a, b) => b.createdAt - a.createdAt);
      const pending = orders.filter(o => o.status === 'pending' || o.status === 'confirmed');

      return `
        <div class="p-4 pb-24 fade-in">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-6">
            <button onclick="setBreedingState({currentView:'breeding-main'})" class="p-2 hover:bg-slate-700/50 rounded-xl">
              <span class="text-xl">←</span>
            </button>
            <div class="flex-1">
              <h1 class="text-xl font-bold text-slate-100">การจอง</h1>
              <p class="text-slate-400 text-sm">${pending.length} รายการรอดำเนินการ</p>
            </div>
            <button onclick="showNewOrderModal()" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium">
              + รับจอง
            </button>
          </div>

          <!-- Order List -->
          <div class="space-y-3">
            ${orders.length === 0 ? `
              <div class="text-center py-12 text-slate-500">
                <div class="text-4xl mb-2">📋</div>
                <div>ยังไม่มีรายการจอง</div>
              </div>
            ` : orders.map(o => {
              const customer = window.customersDb.getById(o.customerId);
              const statusColors = {
                pending: 'bg-amber-500/20 text-amber-400',
                confirmed: 'bg-blue-500/20 text-blue-400',
                ready: 'bg-cyan-500/20 text-cyan-400',
                delivered: 'bg-green-500/20 text-green-400',
                completed: 'bg-slate-500/20 text-slate-400',
                cancelled: 'bg-red-500/20 text-red-400'
              };
              const statusNames = {
                pending: 'รอยืนยัน',
                confirmed: 'ยืนยันแล้ว',
                ready: 'พร้อมส่ง',
                delivered: 'ส่งแล้ว',
                completed: 'เสร็จสิ้น',
                cancelled: 'ยกเลิก'
              };
              return `
                <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-slate-100 font-medium">${customer?.name || 'ไม่ระบุลูกค้า'}</span>
                    <span class="text-xs px-2 py-1 rounded-full ${statusColors[o.status]}">${statusNames[o.status]}</span>
                  </div>
                  <div class="text-slate-400 text-sm mb-2">${o.orderNumber}</div>
                  <div class="flex items-center justify-between">
                    <span class="text-slate-500 text-sm">${formatNumber(o.totalQuantity)} ตัว</span>
                    <span class="text-green-400 font-bold">${formatCurrency(o.totalAmount)}</span>
                  </div>
                  <div class="flex items-center justify-between text-xs text-slate-500 mt-2">
                    <span>มัดจำ: ${o.depositPaid ? '✅ ' + formatCurrency(o.deposit) : '❌ ' + formatCurrency(o.deposit)}</span>
                    <span>${formatDate(o.createdAt)}</span>
                  </div>
                  ${o.status !== 'completed' && o.status !== 'cancelled' ? `
                    <div class="flex gap-2 mt-3">
                      ${o.status === 'pending' ? `
                        <button onclick="updateOrderStatus('${o.id}', 'confirmed')" class="flex-1 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm">ยืนยัน</button>
                      ` : ''}
                      ${o.status === 'confirmed' ? `
                        <button onclick="updateOrderStatus('${o.id}', 'ready')" class="flex-1 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm">พร้อมส่ง</button>
                      ` : ''}
                      ${o.status === 'ready' ? `
                        <button onclick="convertOrderToSale('${o.id}')" class="flex-1 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm">ส่งมอบ</button>
                      ` : ''}
                      <button onclick="updateOrderStatus('${o.id}', 'cancelled')" class="py-2 px-3 bg-red-500/20 text-red-400 rounded-lg text-sm">ยกเลิก</button>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    };

    // Update order status
    window.updateOrderStatus = (id, status) => {
      window.ordersDb.updateStatus(id, status);
      if (window.showToast) window.showToast('อัพเดทสถานะสำเร็จ', 'success');
      renderBreedingModule();
    };

    // Convert order to sale
    window.convertOrderToSale = (orderId) => {
      const order = window.ordersDb.getById(orderId);
      if (!order) return;

      // Create sale from order
      window.salesDb.create({
        orderId: order.id,
        customerId: order.customerId,
        customerName: window.customersDb.getById(order.customerId)?.name || 'ลูกค้า',
        saleType: 'fingerling',
        items: order.items,
        discount: order.discount,
        deliveryFee: order.deliveryFee,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        deliveryMethod: order.deliveryMethod
      });

      // Complete order
      window.ordersDb.complete(orderId);
      renderBreedingModule();
    };

    // ===== Modals =====
    const renderBreedingModal = () => {
      if (!breedingState.modal) return '';

      let modalContent = '';
      switch (breedingState.modal) {
        case 'add-broodstock':
          modalContent = renderAddBroodstockModal();
          break;
        case 'add-customer':
          modalContent = renderAddCustomerModal();
          break;
        case 'add-tank':
          modalContent = renderAddTankModal();
          break;
        case 'add-batch':
          modalContent = renderAddBatchModal();
          break;
        case 'new-sale':
          modalContent = renderNewSaleModal();
          break;
        case 'new-order':
          modalContent = renderNewOrderModal();
          break;
        case 'record-growth':
          modalContent = renderRecordGrowthModal();
          break;
        case 'record-mortality':
          modalContent = renderRecordMortalityModal();
          break;
        default:
          return '';
      }

      return `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center" onclick="closeBreedingModal()">
          <div class="w-full max-w-lg bg-slate-800 rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto slide-up" onclick="event.stopPropagation()">
            ${modalContent}
          </div>
        </div>
      `;
    };

    window.closeBreedingModal = () => {
      setBreedingState({ modal: null });
    };

    // Add Broodstock Modal
    window.showAddBroodstockModal = () => {
      setBreedingState({ modal: 'add-broodstock' });
    };

    const renderAddBroodstockModal = () => {
      const fishTypes = window.db?.fishTypes?.getAll() || [];
      return `
        <h3 class="text-xl font-bold text-slate-100 mb-4">เพิ่มพ่อแม่พันธุ์</h3>
        <form onsubmit="submitAddBroodstock(event)">
          <div class="space-y-4">
            <div>
              <label class="text-slate-400 text-sm">รหัส</label>
              <input type="text" name="code" placeholder="เช่น F001, M001" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
            </div>
            <div>
              <label class="text-slate-400 text-sm">เพศ</label>
              <div class="flex gap-3 mt-1">
                <button type="button" onclick="selectBroodGender('female')" id="genderFemale" class="flex-1 py-3 rounded-xl border bg-pink-500/20 border-pink-500/50 text-pink-400">♀ เพศเมีย</button>
                <button type="button" onclick="selectBroodGender('male')" id="genderMale" class="flex-1 py-3 rounded-xl border bg-slate-700 border-slate-600 text-slate-400">♂ เพศผู้</button>
              </div>
              <input type="hidden" name="gender" value="female">
            </div>
            <div>
              <label class="text-slate-400 text-sm">ชนิดปลา</label>
              <select name="fishTypeId" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
                ${fishTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-slate-400 text-sm">น้ำหนัก (กรัม)</label>
                <input type="number" name="weight" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
              </div>
              <div>
                <label class="text-slate-400 text-sm">อายุ (เดือน)</label>
                <input type="number" name="age" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
              </div>
            </div>
            <div>
              <label class="text-slate-400 text-sm">หมายเหตุ</label>
              <textarea name="notes" rows="2" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100"></textarea>
            </div>
          </div>
          <div class="flex gap-3 mt-6">
            <button type="button" onclick="closeBreedingModal()" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl">ยกเลิก</button>
            <button type="submit" class="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium">บันทึก</button>
          </div>
        </form>
      `;
    };

    window.selectBroodGender = (gender) => {
      document.querySelector('[name=gender]').value = gender;
      const femaleBtn = document.getElementById('genderFemale');
      const maleBtn = document.getElementById('genderMale');
      if (gender === 'female') {
        femaleBtn.className = 'flex-1 py-3 rounded-xl border bg-pink-500/20 border-pink-500/50 text-pink-400';
        maleBtn.className = 'flex-1 py-3 rounded-xl border bg-slate-700 border-slate-600 text-slate-400';
      } else {
        maleBtn.className = 'flex-1 py-3 rounded-xl border bg-blue-500/20 border-blue-500/50 text-blue-400';
        femaleBtn.className = 'flex-1 py-3 rounded-xl border bg-slate-700 border-slate-600 text-slate-400';
      }
    };

    window.submitAddBroodstock = (e) => {
      e.preventDefault();
      const form = e.target;
      window.broodstockDb.create({
        code: form.code.value,
        gender: form.gender.value,
        fishTypeId: form.fishTypeId.value,
        weight: form.weight.value,
        age: form.age.value,
        notes: form.notes.value
      });
      closeBreedingModal();
      renderBreedingModule();
    };

    // Add Customer Modal
    window.showAddCustomerModal = () => {
      setBreedingState({ modal: 'add-customer' });
    };

    const renderAddCustomerModal = () => `
      <h3 class="text-xl font-bold text-slate-100 mb-4">เพิ่มลูกค้า/พ่อค้า</h3>
      <form onsubmit="submitAddCustomer(event)">
        <div class="space-y-4">
          <div>
            <label class="text-slate-400 text-sm">ชื่อ *</label>
            <input type="text" name="name" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
          </div>
          <div>
            <label class="text-slate-400 text-sm">ชื่อเล่น</label>
            <input type="text" name="nickname" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
          </div>
          <div>
            <label class="text-slate-400 text-sm">เบอร์โทร</label>
            <input type="tel" name="phone" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
          </div>
          <div>
            <label class="text-slate-400 text-sm">Line ID</label>
            <input type="text" name="lineId" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
          </div>
          <div>
            <label class="text-slate-400 text-sm">จังหวัด</label>
            <input type="text" name="province" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
          </div>
          <div>
            <label class="text-slate-400 text-sm">ที่อยู่</label>
            <textarea name="address" rows="2" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100"></textarea>
          </div>
          <div class="flex items-center gap-3">
            <input type="checkbox" name="isVip" id="isVip" class="w-5 h-5 rounded">
            <label for="isVip" class="text-slate-300">⭐ ลูกค้า VIP</label>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" onclick="closeBreedingModal()" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl">ยกเลิก</button>
          <button type="submit" class="flex-1 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium">บันทึก</button>
        </div>
      </form>
    `;

    window.submitAddCustomer = (e) => {
      e.preventDefault();
      const form = e.target;
      window.customersDb.create({
        name: form.name.value,
        nickname: form.nickname.value,
        phone: form.phone.value,
        lineId: form.lineId.value,
        province: form.province.value,
        address: form.address.value,
        isVip: form.isVip.checked
      });
      closeBreedingModal();
      renderBreedingModule();
    };

    // Add Tank Modal
    window.showAddTankModal = () => {
      setBreedingState({ modal: 'add-tank' });
    };

    const renderAddTankModal = () => `
      <h3 class="text-xl font-bold text-slate-100 mb-4">เพิ่มถังอนุบาล</h3>
      <form onsubmit="submitAddTank(event)">
        <div class="space-y-4">
          <div>
            <label class="text-slate-400 text-sm">ชื่อถัง *</label>
            <input type="text" name="name" required placeholder="เช่น ถัง A1, บ่อซีเมนต์ 1" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
          </div>
          <div>
            <label class="text-slate-400 text-sm">ประเภท</label>
            <select name="type" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
              <option value="cement">บ่อซีเมนต์</option>
              <option value="fiber">ถังไฟเบอร์</option>
              <option value="canvas">ถังผ้าใบ</option>
              <option value="earthen">บ่อดิน</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-slate-400 text-sm">ความจุ</label>
              <input type="number" name="capacity" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
            </div>
            <div>
              <label class="text-slate-400 text-sm">หน่วย</label>
              <select name="capacityUnit" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
                <option value="liters">ลิตร</option>
                <option value="cubic_meters">ลบ.ม.</option>
              </select>
            </div>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" onclick="closeBreedingModal()" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl">ยกเลิก</button>
          <button type="submit" class="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium">บันทึก</button>
        </div>
      </form>
    `;

    window.submitAddTank = (e) => {
      e.preventDefault();
      const form = e.target;
      window.nurseryTanksDb.create({
        name: form.name.value,
        type: form.type.value,
        capacity: form.capacity.value,
        capacityUnit: form.capacityUnit.value
      });
      closeBreedingModal();
      renderBreedingModule();
    };

    // Add Batch Modal
    window.showAddNurseryBatchModal = () => {
      setBreedingState({ modal: 'add-batch' });
    };

    const renderAddBatchModal = () => {
      const tanks = window.nurseryTanksDb.getAvailable();
      const fishTypes = window.db?.fishTypes?.getAll() || [];
      return `
        <h3 class="text-xl font-bold text-slate-100 mb-4">เพิ่มรุ่นอนุบาล</h3>
        <form onsubmit="submitAddBatch(event)">
          <div class="space-y-4">
            <div>
              <label class="text-slate-400 text-sm">รหัสรุ่น</label>
              <input type="text" name="code" placeholder="เช่น NB001" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
            </div>
            <div>
              <label class="text-slate-400 text-sm">ถังอนุบาล *</label>
              <select name="tankId" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
                ${tanks.length === 0 ? '<option value="">ไม่มีถังว่าง</option>' : tanks.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="text-slate-400 text-sm">ชนิดปลา *</label>
              <select name="fishTypeId" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
                ${fishTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="text-slate-400 text-sm">จำนวนเริ่มต้น *</label>
              <input type="number" name="initialCount" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
            </div>
            <div>
              <label class="text-slate-400 text-sm">ระยะ</label>
              <select name="stage" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
                <option value="larvae">ลูกน้ำ (Larvae)</option>
                <option value="fry">ลูกปลา (Fry)</option>
                <option value="fingerling">ปลานิ้ว (Fingerling)</option>
                <option value="juvenile">วัยรุ่น (Juvenile)</option>
              </select>
            </div>
            <div class="flex items-center gap-3">
              <input type="checkbox" name="sexReversalEnabled" id="sexReversalEnabled" class="w-5 h-5 rounded">
              <label for="sexReversalEnabled" class="text-slate-300">♂ แปลงเพศ (MT)</label>
            </div>
          </div>
          <div class="flex gap-3 mt-6">
            <button type="button" onclick="closeBreedingModal()" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl">ยกเลิก</button>
            <button type="submit" class="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium">บันทึก</button>
          </div>
        </form>
      `;
    };

    window.submitAddBatch = (e) => {
      e.preventDefault();
      const form = e.target;
      window.nurseryBatchesDb.create({
        code: form.code.value,
        tankId: form.tankId.value,
        fishTypeId: form.fishTypeId.value,
        initialCount: form.initialCount.value,
        stage: form.stage.value,
        sexReversalEnabled: form.sexReversalEnabled.checked
      });
      closeBreedingModal();
      renderBreedingModule();
    };

    // New Sale Modal
    window.showNewSaleModal = (customerId = null) => {
      breedingState.selectedCustomer = customerId;
      setBreedingState({ modal: 'new-sale' });
    };

    const renderNewSaleModal = () => {
      const customers = window.customersDb.getAll();
      const stocks = window.fingerlingStockDb.getAvailable();
      return `
        <h3 class="text-xl font-bold text-slate-100 mb-4">บันทึกการขาย</h3>
        <form onsubmit="submitNewSale(event)">
          <div class="space-y-4">
            <div>
              <label class="text-slate-400 text-sm">ลูกค้า</label>
              <select name="customerId" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
                <option value="">ลูกค้าทั่วไป</option>
                ${customers.map(c => `<option value="${c.id}" ${breedingState.selectedCustomer === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="text-slate-400 text-sm">สต๊อกลูกปลา</label>
              <select name="stockId" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
                <option value="">-- เลือกสต๊อก --</option>
                ${stocks.map(s => `<option value="${s.id}" data-price="${s.pricePerFish}">${getFishTypeName(s.fishTypeId)} - ${s.size} (${formatNumber(s.availableCount)} ตัว @ ${formatCurrency(s.pricePerFish)})</option>`).join('')}
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-slate-400 text-sm">จำนวน (ตัว) *</label>
                <input type="number" name="quantity" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
              </div>
              <div>
                <label class="text-slate-400 text-sm">ราคา/ตัว *</label>
                <input type="number" name="pricePerFish" step="0.01" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
              </div>
            </div>
            <div>
              <label class="text-slate-400 text-sm">วิธีชำระเงิน</label>
              <select name="paymentMethod" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
                <option value="cash">เงินสด</option>
                <option value="transfer">โอนเงิน</option>
                <option value="credit">เครดิต</option>
              </select>
            </div>
          </div>
          <div class="flex gap-3 mt-6">
            <button type="button" onclick="closeBreedingModal()" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl">ยกเลิก</button>
            <button type="submit" class="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium">บันทึกขาย</button>
          </div>
        </form>
      `;
    };

    window.submitNewSale = (e) => {
      e.preventDefault();
      const form = e.target;
      const customer = window.customersDb.getById(form.customerId.value);
      const quantity = parseInt(form.quantity.value);
      const pricePerFish = parseFloat(form.pricePerFish.value);

      window.salesDb.create({
        customerId: form.customerId.value || null,
        customerName: customer?.name || 'ลูกค้าทั่วไป',
        saleType: 'fingerling',
        items: [{
          stockId: form.stockId.value || null,
          quantity: quantity,
          pricePerUnit: pricePerFish,
          amount: quantity * pricePerFish
        }],
        paymentMethod: form.paymentMethod.value,
        paymentStatus: 'paid'
      });
      closeBreedingModal();
      renderBreedingModule();
    };

    // New Order Modal
    window.showNewOrderModal = (customerId = null) => {
      breedingState.selectedCustomer = customerId;
      setBreedingState({ modal: 'new-order' });
    };

    const renderNewOrderModal = () => {
      const customers = window.customersDb.getAll();
      const fishTypes = window.db?.fishTypes?.getAll() || [];
      return `
        <h3 class="text-xl font-bold text-slate-100 mb-4">รับจองลูกปลา</h3>
        <form onsubmit="submitNewOrder(event)">
          <div class="space-y-4">
            <div>
              <label class="text-slate-400 text-sm">ลูกค้า *</label>
              <select name="customerId" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
                <option value="">-- เลือกลูกค้า --</option>
                ${customers.map(c => `<option value="${c.id}" ${breedingState.selectedCustomer === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="text-slate-400 text-sm">ชนิดปลา *</label>
              <select name="fishTypeId" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
                ${fishTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-slate-400 text-sm">จำนวน (ตัว) *</label>
                <input type="number" name="quantity" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
              </div>
              <div>
                <label class="text-slate-400 text-sm">ราคา/ตัว *</label>
                <input type="number" name="pricePerFish" step="0.01" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-slate-400 text-sm">มัดจำ</label>
                <input type="number" name="deposit" value="0" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
              </div>
              <div>
                <label class="text-slate-400 text-sm">วันส่งมอบ</label>
                <input type="date" name="expectedDeliveryDate" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
              </div>
            </div>
            <div>
              <label class="text-slate-400 text-sm">หมายเหตุ</label>
              <textarea name="notes" rows="2" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100"></textarea>
            </div>
          </div>
          <div class="flex gap-3 mt-6">
            <button type="button" onclick="closeBreedingModal()" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl">ยกเลิก</button>
            <button type="submit" class="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium">บันทึกจอง</button>
          </div>
        </form>
      `;
    };

    window.submitNewOrder = (e) => {
      e.preventDefault();
      const form = e.target;
      const quantity = parseInt(form.quantity.value);
      const pricePerFish = parseFloat(form.pricePerFish.value);

      window.ordersDb.create({
        customerId: form.customerId.value,
        items: [{
          fishTypeId: form.fishTypeId.value,
          quantity: quantity,
          pricePerFish: pricePerFish
        }],
        deposit: parseFloat(form.deposit.value) || 0,
        expectedDeliveryDate: form.expectedDeliveryDate.value || null,
        notes: form.notes.value
      });
      closeBreedingModal();
      setBreedingState({ currentView: 'orders' });
    };

    // Record Growth Modal
    window.showRecordGrowthModal = (batchId) => {
      breedingState.selectedBatch = batchId;
      setBreedingState({ modal: 'record-growth' });
    };

    const renderRecordGrowthModal = () => `
      <h3 class="text-xl font-bold text-slate-100 mb-4">บันทึกน้ำหนัก</h3>
      <form onsubmit="submitRecordGrowth(event)">
        <div class="space-y-4">
          <div>
            <label class="text-slate-400 text-sm">น้ำหนักเฉลี่ย (กรัม) *</label>
            <input type="number" name="avgWeight" step="0.1" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
          </div>
          <div>
            <label class="text-slate-400 text-sm">จำนวนตัวอย่าง (ตัว)</label>
            <input type="number" name="sampleCount" value="10" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" onclick="closeBreedingModal()" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl">ยกเลิก</button>
          <button type="submit" class="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium">บันทึก</button>
        </div>
      </form>
    `;

    window.submitRecordGrowth = (e) => {
      e.preventDefault();
      const form = e.target;
      window.nurseryBatchesDb.recordGrowth(
        breedingState.selectedBatch,
        form.avgWeight.value,
        form.sampleCount.value
      );
      closeBreedingModal();
      renderBreedingModule();
    };

    // Record Mortality Modal
    window.showRecordMortalityModal = (batchId) => {
      breedingState.selectedBatch = batchId;
      setBreedingState({ modal: 'record-mortality' });
    };

    const renderRecordMortalityModal = () => `
      <h3 class="text-xl font-bold text-slate-100 mb-4">บันทึกการตาย</h3>
      <form onsubmit="submitRecordMortality(event)">
        <div class="space-y-4">
          <div>
            <label class="text-slate-400 text-sm">จำนวนที่ตาย (ตัว) *</label>
            <input type="number" name="count" required class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
          </div>
          <div>
            <label class="text-slate-400 text-sm">สาเหตุ</label>
            <select name="cause" class="w-full mt-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-slate-100">
              <option value="">ไม่ระบุ</option>
              <option value="disease">โรค</option>
              <option value="water_quality">คุณภาพน้ำ</option>
              <option value="stress">เครียด</option>
              <option value="predator">ศัตรู</option>
              <option value="other">อื่นๆ</option>
            </select>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button type="button" onclick="closeBreedingModal()" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl">ยกเลิก</button>
          <button type="submit" class="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium">บันทึก</button>
        </div>
      </form>
    `;

    window.submitRecordMortality = (e) => {
      e.preventDefault();
      const form = e.target;
      window.nurseryBatchesDb.recordMortality(
        breedingState.selectedBatch,
        form.count.value,
        form.cause.value
      );
      closeBreedingModal();
      renderBreedingModule();
    };

    // Update broodstock status
    window.updateBroodstockStatus = (id, status) => {
      window.broodstockDb.update(id, { status });
      if (window.showToast) window.showToast('อัพเดทสถานะสำเร็จ', 'success');
      renderBreedingModule();
    };

    // Delete confirmations
    window.confirmDeleteBroodstock = (id) => {
      if (confirm('ต้องการลบพ่อแม่พันธุ์นี้?')) {
        window.broodstockDb.delete(id);
        setBreedingState({ currentView: 'broodstock' });
      }
    };

    window.confirmDeleteCustomer = (id) => {
      if (confirm('ต้องการลบลูกค้านี้?')) {
        window.customersDb.delete(id);
        setBreedingState({ currentView: 'customers' });
      }
    };

    // ===== Add to Main Navigation =====
    const addBreedingNav = () => {
      // Create container for breeding module if not exists
      if (!document.getElementById('breeding-module-container')) {
        const container = document.createElement('div');
        container.id = 'breeding-module-container';
        container.style.display = 'none';
        document.getElementById('app').appendChild(container);
      }
    };

    // Open breeding module
    window.openBreedingModule = () => {
      document.getElementById('app').querySelectorAll(':scope > div').forEach(div => {
        if (div.id !== 'breeding-module-container') {
          div.style.display = 'none';
        }
      });
      const container = document.getElementById('breeding-module-container');
      if (container) {
        container.style.display = 'block';
        renderBreedingModule();
      }
    };

    // Close breeding module
    window.closeBreedingModuleAndReturn = () => {
      document.getElementById('breeding-module-container').style.display = 'none';
      // Show main app content
      document.getElementById('app').querySelectorAll(':scope > div').forEach(div => {
        if (div.id !== 'breeding-module-container') {
          div.style.display = 'block';
        }
      });
      if (window.render) window.render();
    };

    addBreedingNav();
    console.log('🎨 Breeding UI ready. Use openBreedingModule() to open.');
  };

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

})();
