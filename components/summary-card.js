// ====== 收益账本 - 汇总卡片组件 ======

(function() {
  if (typeof Vue === 'undefined' || !window.__store) return;

  const EYE_OPEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_SLASH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  const SummaryCard = {
    template: `
      <div class="summary-card">
        <div class="total-row">
          <div class="v">{{ fmtS(totalVal) }}
            <button class="eye-btn" @click="togglePrivacy" :title="'切换隐私模式'" v-html="privacyMode ? EYE_SLASH : EYE_OPEN"></button>
          </div>
          <div class="l" style="display:flex;align-items:center;gap:6px;justify-content:space-between;">
            <span>总资产 <span class="fund-toggle" @click.stop="toggleFundMode" style="cursor:pointer;font-size:0.7rem;padding:1px 6px;border-radius:8px;border:1px solid var(--border);margin-left:4px;" :style="toggleStyle">{{ toggleLabel }}</span></span>
            <span :class="['sync-indicator', syncClass]" :title="syncTitle" @click="onSyncClick" style="font-size:0.72rem;color:var(--text-muted);cursor:pointer;display:inline-flex;align-items:center;gap:3px;">
              <template v-if="offline">📡 离线</template>
              <template v-else>☁️ {{ syncTime }}
                <span v-if="pendingCount > 0" :class="['sync-badge', hasFailed ? 'warn' : '']" style="display:inline-flex;align-items:center;justify-content:center;background:#f59e0b;color:#fff;font-size:0.65rem;font-weight:700;border-radius:50%;width:16px;height:16px;line-height:16px;margin-left:2px;">{{ pendingCount }}</span>
              </template>
            </span>
          </div>
        </div>
        <div class="sub-row">
          <div class="stat">
            <div class="v" :class="retColorClass">{{ fmtS(totalRet) }}</div>
            <div class="l">累计收益</div>
          </div>
          <div class="stat">
            <div class="v" :class="retColorClass">{{ fmtPct(totalRetPct) }}</div>
            <div class="l">总收益率</div>
          </div>
          <div class="stat">
            <div class="v">{{ totalNavVal.toFixed(4) }}</div>
            <div class="l">净值</div>
          </div>
          <div class="stat" v-if="totalXirr != null && !isNaN(totalXirr)">
            <div class="v" :class="totalXirr >= 0 ? 'profit' : 'loss'">{{ (totalXirr * 100).toFixed(2) + '%' }}</div>
            <div class="l">年化 <span class="xirr">XIRR</span></div>
          </div>
          <div class="stat" v-if="maxDd < 0">
            <div class="v loss">{{ (maxDd * 100).toFixed(2) + '%' }}</div>
            <div class="l">最大回撤</div>
            <div class="sub">{{ ddStart }} ~ {{ ddEnd }}</div>
          </div>
        </div>
      </div>
    `,
    data() {
      return { EYE_OPEN, EYE_SLASH };
    },
    computed: {
      s() { return window.__store; },
      totalVal() { return this.s.totalVal || 0; },
      totalCost() { return this.s.totalCost || 0; },
      totalRet() { return this.s.totalRet || 0; },
      totalRetPct() { return this.s.totalRetPct || 0; },
      totalNavVal() { return this.s.totalNavVal || 1; },
      totalXirr() { return this.s.totalXirr; },
      maxDd() { return this.s.maxDd || 0; },
      ddStart() { return this.s.ddStart || ''; },
      ddEnd() { return this.s.ddEnd || ''; },
      privacyMode() { return this.s.privacyMode; },
      retColorClass() { return this.totalRet >= 0 ? 'profit' : 'loss'; },
      fundMode() { return this.s.fundMode; },
      toggleLabel() { return this.fundMode ? '基金' : '个人'; },
      toggleStyle() {
        return this.fundMode
          ? { background: '#1e40af', color: '#fff', borderColor: '#1e40af' }
          : { background: 'transparent', color: 'var(--text-muted)', borderColor: 'var(--border)' };
      },
      // 同步状态
      ss() { return this.s.syncState; },
      pendingCount() { return this.ss.pendingCount; },
      hasFailed() { return this.ss.lastError != null; },
      offline() { return this.ss.status === 'offline'; },
      lastSyncTime() { return this.ss.lastSyncTime; },
      syncClass() {
        if (this.offline) return 'offline';
        if (this.pendingCount > 0) return this.hasFailed ? 'warning' : 'pending';
        return 'synced';
      },
      syncTitle() {
        if (this.offline) return '网络离线';
        if (this.pendingCount > 0) return this.hasFailed ? this.pendingCount + '条同步失败，点击重试' : this.pendingCount + '条待同步';
        const ts = this.lastSyncTime;
        return '已同步 · ' + (ts ? new Date(ts).toLocaleString('zh-CN') : '尚未同步');
      },
      syncTime() {
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
      fmtS(v) {
        const pm = window.__store.privacyMode;
        const n = Number(v);
        return pm ? '******' : (n == null ? '—' : '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      },
      fmtPct(n) {
        return n == null ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%';
      },
      togglePrivacy() {
        window.__store.privacyMode = !window.__store.privacyMode;
      },
      onSyncClick() {
        if (typeof window.forceSync === 'function') window.forceSync();
      },
      toggleFundMode() {
        if (typeof window.toggleFundMode === 'function') window.toggleFundMode();
      },
    },
  };

  window.__summaryCardComponent = SummaryCard;

  window.mountSummaryCard = function(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) { console.warn('[summary-card] mount target not found:', selector); return; }
    const app = Vue.createApp({});
    app.component('summary-card', SummaryCard);
    app.mount(el);
    console.log('[summary-card] mounted, store accounts:', window.__store?.accounts?.length);
  };

  console.log('[component] summary-card loaded');
})();
