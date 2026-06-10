// ====== 收益账本 - 账户卡片网格组件 ======

(function() {
  if (typeof Vue === 'undefined' || !window.__store || !window.calcUtils) return;
  const { calcAccount, calcXIRR, checkNegativeBalance, sortRecords, fmt, fmtPct, fmtS } = calcUtils;

  // 单账户最大回撤（用于卡片内展示）
  function cardDrawdown(acct, records) {
    const sorted = sortRecords(records);
    if (sorted.length < 2) return '—';
    let v = 0, c = 0, peak = 1, ddPct = 0;
    for (const r of sorted) {
      if (r.action_type === 'transfer_in') { v += Number(r.amount); c += Number(r.amount); }
      else if (r.action_type === 'transfer_out') { v -= Number(r.amount); c -= Number(r.amount); }
      else if (r.action_type === 'revalue') v = Number(r.amount);
      const nv = acct.account_type === 'investment' ? (c > 0 ? v / c : v) : v;
      if (nv > peak) peak = nv;
      const dd = (nv - peak) / peak;
      if (dd < ddPct) ddPct = dd;
    }
    return ddPct < 0 ? (ddPct * 100).toFixed(2) + '%' : '—';
  }

  const AccountGrid = {
    template: `
      <div>
        <div class="account-grid">
          <div v-for="a in visibleAccounts" :key="a.id" class="account-card card" @click="showRecords(a.id)">
            <div class="acct-header">
              <span class="acct-name">{{ a.name }}<span v-if="a.hidden" style="font-size:0.7rem;color:var(--text-muted);"> (已隐藏)</span><span v-if="negBalance(a.id)" :title="negBalance(a.id).date+' 余额 '+fmt(negBalance(a.id).balance)+'，查看折线图定位问题'" style="display:inline-flex;align-items:center;gap:3px;font-size:0.72rem;color:#d97706;background:#fef3c7;padding:1px 8px;border-radius:10px;font-weight:500;cursor:help;">⚠ 余额异常</span></span>
              <span :class="['acct-type', a.account_type === 'cash' ? 'type-cash' : 'type-investment']">{{ a.account_type === 'cash' ? '现金' : '投资' }}</span>
            </div>
            <div class="acct-stats">
              <div class="total-val">{{ fmtS(calcVal(a).currentValue, privacyMode) }}</div>
              <div class="total-lbl">当前资产</div>
              <div class="row-main">
                <div class="stat"><div class="v" :style="{color: calcVal(a).totalReturn >= 0 ? '#dc2626' : '#2563eb'}">{{ fmtS(calcVal(a).totalReturn, privacyMode) }}</div><div class="l">累计收益</div></div>
                <div class="stat"><div class="v" :style="{color: xirrColor(a)}">{{ xirrStr(a) }}</div><div class="l">年化 XIRR</div></div>
              </div>
              <div class="row-extra">
                <div class="stat"><div class="v">{{ calcVal(a).nav.toFixed(4) }}</div><div class="l">净值</div></div>
                <div class="stat"><div class="v loss">{{ cardDd(a) }}</div><div class="l">最大回撤</div></div>
              </div>
            </div>
            <div class="acct-actions">
              <button class="btn btn-primary btn-sm" @click.stop="openRecord(a.id, 'transfer_in')">转入</button>
              <button class="btn btn-ghost btn-sm" @click.stop="openRecord(a.id, 'transfer_out')">转出</button>
              <button v-if="a.account_type === 'investment'" class="btn btn-ghost btn-sm" @click.stop="openRecord(a.id, 'revalue')">更新</button>
              <div class="dot-menu">
                <button class="dot-btn" @click.stop="toggleMenu($event)">⋮</button>
                <div class="dot-dropdown" :class="{open: menuOpen === a.id}">
                  <div @click.stop="showRecords(a.id)">📋 查看记录</div>
                  <div @click.stop="a.hidden ? unhideAccount(a.id) : hideAccount(a.id)">{{ a.hidden ? '👁 取消隐藏' : '🙈 隐藏' }}</div>
                  <div class="danger" @click.stop="deleteAccount(a.id)">🗑 删除</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 新用户引导 -->
          <div v-if="isNewUser" style="grid-column:1/-1;text-align:center;padding:32px 20px 20px;background:linear-gradient(135deg,#f0f7ff 0%,#fdf2f8 100%);border-radius:12px;border:1px solid #e0e7ff;">
            <div style="font-size:2.2rem;margin-bottom:6px;">🕊</div>
            <h2 style="font-size:1.15rem;margin-bottom:4px;color:var(--text);">欢迎来到收益账本</h2>
            <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px;line-height:1.5;">你已拥有一个现金账户，只需两步即可开启投资追踪之旅</p>
            <div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px;flex-wrap:wrap;">
              <div style="background:var(--bg);border-radius:10px;padding:14px 18px;text-align:left;flex:1;max-width:220px;min-width:160px;"><div style="font-size:0.75rem;color:var(--primary);font-weight:700;margin-bottom:3px;">第一步</div><div style="font-size:0.85rem;font-weight:600;margin-bottom:2px;">💰 记录第一笔资金</div><div style="font-size:0.78rem;color:var(--text-muted);line-height:1.5;">录入转入或转出，开始积累数据</div></div>
              <div style="background:var(--bg);border-radius:10px;padding:14px 18px;text-align:left;flex:1;max-width:220px;min-width:160px;"><div style="font-size:0.75rem;color:var(--primary);font-weight:700;margin-bottom:3px;">第二步</div><div style="font-size:0.85rem;font-weight:600;margin-bottom:2px;">📈 查看资产走势</div><div style="font-size:0.78rem;color:var(--text-muted);line-height:1.5;">图表自动生成，收益、净值一目了然</div></div>
            </div>
            <button class="btn btn-primary" style="font-size:0.88rem;padding:8px 20px;" @click="openRecord(firstAcctId, 'transfer_in')">💰 录入第一笔记录</button>
          </div>

          <!-- 空状态 -->
          <div v-if="visibleAccounts.length === 0 && !isNewUser" class="empty-guide" style="grid-column:1/-1;">
            <div class="icon-big">📊</div>
            <h2>暂无账户</h2>
            <p>创建一个新账户开始追踪吧</p>
            <button class="btn btn-primary" @click="openAddAccount()">+ 创建账户</button>
            <a href="about.html" class="btn btn-ghost" style="margin-left:8px;">了解更多</a>
          </div>
        </div>
      </div>
    `,
    data() {
      return { menuOpen: null };
    },
    computed: {
      store() { return window.__store; },
      allAccounts() { return this.store.accounts; },
      allRecords() { return this.store.allRecords; },
      privacyMode() { return this.store.privacyMode; },
      showHidden() { return this.store.showHidden; },
      visibleAccounts() {
        return this.allAccounts.filter(a => this.showHidden || !a.hidden);
      },
      isNewUser() {
        const totalRecs = Object.values(this.allRecords).reduce((s, arr) => s + (arr || []).length, 0);
        return this.allAccounts.length === 1 && this.allAccounts[0].account_type === 'cash' && totalRecs === 0;
      },
      firstAcctId() {
        return this.allAccounts.length > 0 ? this.allAccounts[0].id : null;
      },
    },
    methods: {
      calcVal(a) { return calcAccount(a, this.allRecords[a.id] || []); },
      xirrStr(a) {
        const recs = sortRecords(this.allRecords[a.id] || []);
        const x = calcXIRR(recs, a.account_type, this.calcVal(a).currentValue);
        return x != null && !isNaN(x) ? (x * 100).toFixed(2) + '%' : '—';
      },
      xirrColor(a) {
        const recs = sortRecords(this.allRecords[a.id] || []);
        const x = calcXIRR(recs, a.account_type, this.calcVal(a).currentValue);
        return x != null ? (x >= 0 ? '#dc2626' : '#2563eb') : 'var(--text-secondary)';
      },
      cardDd(a) { return cardDrawdown(a, this.allRecords[a.id] || []); },
      negBalance(id) { return checkNegativeBalance(id, this.allAccounts, this.allRecords); },
      fmt(v) { return fmt(v); },
      fmtS(v, pm) { return fmtS(v, pm); },
      toggleMenu(e) {
        const id = e.currentTarget.closest('.account-card').__vueParentComponent?.props?.key || '';
        if (this.menuOpen === id) { this.menuOpen = null; return; }
        // 关闭其他打开的菜单
        this.menuOpen = id;
      },
      openRecord(id, type) { if (window.openRecord) window.openRecord(id, type); },
      showRecords(id) { if (window.showRecords) window.showRecords(id); },
      hideAccount(id) { if (window.hideAccount) window.hideAccount(id); },
      unhideAccount(id) { if (window.unhideAccount) window.unhideAccount(id); },
      deleteAccount(id) { if (window.deleteAccount) window.deleteAccount(id); },
      openAddAccount() { if (window.openAddAccount) window.openAddAccount(); },
    },
    mounted() {
      // 点击其他地方关闭菜单
      document.addEventListener('click', () => { this.menuOpen = null; });
    },
  };

  window.__accountGridComponent = AccountGrid;

  window.mountAccountGrid = function(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) { console.warn('[account-grid] mount target not found:', selector); return; }
    const app = Vue.createApp({});
    app.component('account-grid', AccountGrid);
    app.mount(el);
    console.log('[account-grid] mounted, store accounts:', window.__store?.accounts?.length);
  };

  console.log('[component] account-grid loaded');
})();
