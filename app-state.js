// ====== 收益账本 - 全局响应式状态 ======
// 用法: 在 index.html 中 <script src="app-state.js"></script>
// 所有组件通过 window.__store 读写状态

(function() {
  if (typeof Vue === 'undefined') { console.warn('app-state: Vue not loaded'); return; }

  // -------------------------------------------------------------------
  // 响应式状态
  // -------------------------------------------------------------------
  const store = Vue.reactive({
    // ---- 用户 ----
    currentUser: null,
    settings: null,

    // ---- 数据 ----
    accounts: [],
    allRecords: {},          // { accountId: [record, ...] }
    queryCache: {},

    // ---- 指数数据 ----
    csi300Map: {},
    csi500Map: {},

    // ---- 成就 ----
    achieved: {},
    lastReturnSign: 'negative',
    positiveReturnCount: 0,

    // ---- 界面状态 ----
    privacyMode: false,
    showHidden: false,
    chartMode: 'assets',
    chartRange: 'all',
    drawerAccountId: null,
    drawerChartMode: 'assets',

    // ---- 同步状态 ----
    syncState: { status: 'synced', lastSyncTime: null, pendingCount: 0, lastError: null },

    // ---- 编辑状态 ----
    editingRecordId: null,
    editingPairedId: null,
    recordAccountId: null,

    // ---- ECharts 实例 ----
    chartInstance: null,
    drawerChartInstance: null,

    // ---- 其他 ----
    deferredPrompt: null,
    syncQueueTimer: null,
  });

  window.__store = store;

  // -------------------------------------------------------------------
  // 辅助方法（挂到 store 上方便组件调用，纯函数进 calc-utils.js）
  // -------------------------------------------------------------------

  // 清空 queryCache
  store.clearCache = function() {
    for (const k in store.queryCache) delete store.queryCache[k];
  };

  // 重置用户数据（退出登录时调用）
  store.resetUserData = function() {
    store.currentUser = null;
    store.accounts = [];
    store.allRecords = {};
    store.settings = null;
    store.achieved = {};
    store.lastReturnSign = 'negative';
    store.positiveReturnCount = 0;
    store.clearCache();
  };

  // 重置所有（刷新时调用）
  store.resetAll = function() {
    store.chartInstance = null;
    store.drawerChartInstance = null;
    store.drawerAccountId = null;
    store.editingRecordId = null;
    store.editingPairedId = null;
    store.recordAccountId = null;
  };

  console.log('[app-state] initialized');
})();
