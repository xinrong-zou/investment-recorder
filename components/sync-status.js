// ====== 收益账本 - 同步状态组件 ======
// 右下角云图标，显示同步状态、待同步数量、最后同步时间

(function() {
  if (typeof Vue === 'undefined' || !window.__store) return;

  const SyncStatus = {
    template: `
      <div class="sync-icon" :class="iconClass" :title="iconTitle"
           @click="onClick"
           style="position:fixed;bottom:54px;right:20px;z-index:1999;cursor:pointer;font-size:0.82rem;background:var(--bg-card);border:1px solid var(--border);border-radius:20px;padding:4px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);display:flex;align-items:center;gap:4px;transition:all 0.2s;user-select:none;">
        <template v-if="offline">📡 <span style="color:#ef4444;">离线</span></template>
        <template v-else>
          ☁️
          <span v-if="pendingCount > 0" :class="['sync-badge', hasFailed ? 'warn' : '']">{{ pendingCount }}</span>
          <span class="sync-ts">{{ timeText }}</span>
        </template>
      </div>
    `,
    computed: {
      ss() { return window.__store.syncState; },
      pendingCount() { return this.ss.pendingCount; },
      hasFailed() { return this.ss.lastError != null; },
      offline() { return this.ss.status === 'offline'; },
      lastSyncTime() { return this.ss.lastSyncTime; },
      iconClass() {
        if (this.offline) return 'offline';
        if (this.pendingCount > 0) return this.hasFailed ? 'warning' : 'pending';
        return 'synced';
      },
      iconTitle() {
        if (this.offline) return '网络离线';
        if (this.pendingCount > 0) return this.hasFailed ? this.pendingCount + '条同步失败，点击重试' : this.pendingCount + '条待同步';
        const ts = this.lastSyncTime;
        return '已同步 · ' + (ts ? new Date(ts).toLocaleString('zh-CN') : '尚未同步');
      },
      timeText() {
        const ts = this.lastSyncTime;
        if (!ts) return '—';
        const diff = (Date.now() - ts) / 1000;
        if (diff < 10) return '刚刚';
        if (diff < 60) return Math.floor(diff) + '秒前';
        if (diff < 3600) return Math.floor(diff/60) + '分钟前';
        if (diff < 86400) return Math.floor(diff/3600) + '小时前';
        return new Date(ts).toLocaleDateString('zh-CN', {month:'short',day:'numeric'});
      },
    },
    methods: {
      onClick() {
        if (typeof window.forceSync === 'function') window.forceSync();
      },
    },
  };

  // 注册到全局，供主 app 使用
  window.__syncStatusComponent = SyncStatus;

  // 自安装模式（独立挂载）
  window.mountSyncStatus = function(selector) {
    const container = document.querySelector(selector);
    if (!container) return;
    const app = Vue.createApp({});
    app.component('sync-status', SyncStatus);
    app.mount(selector);
  };

  console.log('[component] sync-status loaded');
})();
