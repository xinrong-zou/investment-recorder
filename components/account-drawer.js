// ====== 收益账本 - 抽屉详情组件 ======

(function() {
  if (typeof Vue === 'undefined' || !window.__store) return;

  const AccountDrawer = {
    template: `
      <div>
        <!-- 遮罩 -->
        <div class="drawer-overlay" :class="{open: open}" @mousedown="onOverlayClick"></div>
        <!-- 抽屉 -->
        <div class="drawer" :class="{open: open}">
          <div class="drawer-header">
            <h2>{{ acctName }}</h2>
            <button class="drawer-close" @click="close">✕</button>
          </div>
          <div class="drawer-actions">
            <button class="btn btn-primary" @click="action('transfer_in')">💰 转入</button>
            <button class="btn btn-ghost" @click="action('transfer_out')">💸 转出</button>
            <button v-if="isInvestment" class="btn btn-ghost" @click="action('revalue')">📊 更新市值</button>
          </div>
          <div class="drawer-body">
            <!-- 汇总 -->
            <div class="drawer-summary">
              <div class="total-row"><div class="v">{{ fmtS(currentValue) }}</div><div class="l">当前资产</div></div>
              <div class="row">
                <div class="stat"><div class="v" :style="{color: totalReturn >= 0 ? '#dc2626' : '#2563eb'}">{{ fmtS(totalReturn) }}</div><div class="l">累计收益</div></div>
                <div class="stat"><div class="v" :style="{color: xirrColor}">{{ xirrText }}</div><div class="l">年化 <span class="xirr">XIRR</span></div></div>
                <div class="stat"><div class="v">{{ nav.toFixed(4) }}</div><div class="l">净值</div></div>
                <div class="stat"><div class="v loss">{{ ddText }}</div><div class="l">最大回撤</div></div>
              </div>
            </div>
            <!-- 图表 tabs -->
            <div class="drawer-chart-tabs" v-if="hasChart">
              <button v-for="m in chartModes" :key="m.key" class="drawer-chart-tab" :class="{active: chartMode === m.key}" @click="switchMode(m.key)">{{ m.label }}</button>
            </div>
            <!-- 日期范围 -->
            <div class="drawer-range-btns" v-if="hasChart">
              <button v-for="r in ranges" :key="r.key" class="chart-range-btn" :class="{active: drawerRange === r.key}" @click="setRange(r.key)">{{ r.label }}</button>
            </div>
            <!-- 迷你折线图 -->
            <div v-if="hasChart" style="margin-bottom:12px;">
              <line-chart ref="chart" scope="single" :records="records" :account-type="acct.account_type" height="140"
                :range="drawerRange" :filter-start="filterStart" :filter-end="filterEnd"></line-chart>
            </div>
            <div v-else style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem;">至少2条记录才能显示趋势</div>
            <!-- 筛选 -->
            <div class="drawer-filter">
              <select v-model="filterType" @change="applyFilter">
                <option value="">全部操作</option>
                <option value="transfer_in">转入</option>
                <option value="transfer_out">转出</option>
                <option value="revalue">更新市值</option>
              </select>
              <input type="date" v-model="filterStart" @change="applyFilter">
              <input type="date" v-model="filterEnd" @change="applyFilter">
            </div>
            <!-- 记录表格 -->
            <h3 style="font-size:0.9rem;margin-bottom:8px;">操作记录</h3>
            <table class="record-table" v-if="filteredRecords.length > 0">
              <thead><tr><th>日期</th><th>类型</th><th>金额</th><th>备注</th><th style="width:32px;"></th></tr></thead>
              <tbody>
                <tr v-for="r in filteredRecords" :key="r.id" @click="edit(r)" style="cursor:pointer;">
                  <td>{{ r.record_date }}</td>
                  <td><span :class="tagClass(r)">{{ tagLabel(r) }}</span></td>
                  <td :style="{color: amtColor(r), fontWeight:600}">{{ amtPrefix(r) }}{{ fmt(r.amount) }}</td>
                  <td style="color:var(--text-muted);font-size:0.8rem;">{{ r.note || '' }}</td>
                  <td style="text-align:center;font-size:0.85rem;" :title="syncTitle(r)" @click.stop>{{ syncIcon(r) }}</td>
                </tr>
              </tbody>
            </table>
            <div v-else style="text-align:center;padding:32px;color:var(--text-muted);">暂无记录</div>
          </div>
        </div>
      </div>
    `,
    data() {
      return {
        chartMode: 'assets',
        drawerRange: 'all',
        filterType: '',
        filterStart: '',
        filterEnd: '',
        customDateRange: false,
      };
    },
    computed: {
      open() { return window.__store.drawerOpen || false; },
      store() { return window.__store; },
      acctId() { return this.store.drawerAccountId; },
      allAccounts() { return this.store.accounts || []; },
      allRecords() { return this.store.allRecords || {}; },
      acct() { return this.allAccounts.find(a => a.id === this.acctId); },
      records() { return this.acctId ? (this.allRecords[this.acctId] || []) : []; },
      acctName() { return this.acct ? this.acct.name : '账户详情'; },
      isInvestment() { return this.acct ? this.acct.account_type === 'investment' : false; },
      failedRecordIds() {
        // 从 sync queue 中收集失败的记录 ID
        try {
          const q = JSON.parse(localStorage.getItem('hermes_sync_queue_v1') || '[]');
          const ids = {};
          q.forEach(op => {
            if (op.status === 'failed' && op.payload) {
              if (op.payload.recordId) ids[op.payload.recordId] = true;
              if (op.payload.pairedId) ids[op.payload.pairedId] = true;
            }
          });
          return ids;
        } catch (e) { return {}; }
      },
      calc() {
        if (!this.acct) return { currentValue: 0, totalReturn: 0, nav: 1 };
        return window.calcAccount(this.acct, this.records);
      },
      currentValue() { return this.calc.currentValue; },
      totalReturn() { return this.calc.totalReturn; },
      nav() { return this.calc.nav; },
      // XIRR
      xirrVal() {
        const recs = window.calcUtils.sortRecords(this.records);
        return window.calcXIRR(recs, this.acct ? this.acct.account_type : 'investment', this.currentValue);
      },
      xirrText() {
        return this.xirrVal != null && !isNaN(this.xirrVal) ? (this.xirrVal * 100).toFixed(2) + '%' : '—';
      },
      xirrColor() {
        return this.xirrVal != null ? (this.xirrVal >= 0 ? '#dc2626' : '#2563eb') : 'var(--text-secondary)';
      },
      // 最大回撤
      ddResult() {
        if (!this.acct) return { maxDd: 0 };
        return window.calcUtils.calcDrawerMaxDrawdown(this.acct, this.records);
      },
      ddText() {
        const dd = this.ddResult.maxDd;
        return dd < 0 ? (dd * 100).toFixed(2) + '%' : '—';
      },
      // 图表数据
      hasChart() { return this.records.length >= 2; },
      chartModes() { return [{key:'assets',label:'资产'},{key:'nav',label:'净值'},{key:'return',label:'收益'}]; },
      ranges() { return [{key:'all',label:'全部'},{key:'thisYear',label:'今年'},{key:'1y',label:'近1年'},{key:'3y',label:'近3年'},{key:'custom',label:'自定义'}]; },
      // 筛选
      filteredRecords() {
        let f = [...this.records].sort((a, b) => {
          const d = new Date(b.record_date) - new Date(a.record_date);
          return d !== 0 ? d : (b.id || 0) - (a.id || 0);
        });
        if (this.filterType) f = f.filter(r => r.action_type === this.filterType);
        if (this.filterStart) f = f.filter(r => r.record_date >= this.filterStart);
        if (this.filterEnd) f = f.filter(r => r.record_date <= this.filterEnd);
        return f;
      },
    },
    watch: {
      open(val) {
        if (val) {
          // 初始化日期范围
          if (!this.filterStart && this.records.length) {
            const sorted = [...this.records].sort((a, b) => a.record_date < b.record_date ? -1 : 1);
            this.filterStart = sorted[0].record_date;
            const t = new Date();
            this.filterEnd = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
          }
        }
      },
    },
    methods: {
      onOverlayClick(e) { if (e.target === e.currentTarget) this.close(); },
      syncIcon(r) {
        if (window.isTempId && window.isTempId(r.id)) return '⏳';
        if (this.failedRecordIds[r.id]) return '❌';
        return '✅';
      },
      syncTitle(r) {
        if (window.isTempId && window.isTempId(r.id)) return '待同步';
        if (this.failedRecordIds[r.id]) return '同步失败';
        return '已同步';
      },
      fmt(v) { return window.calcUtils.fmt(v); },
      fmtS(v) {
        const pm = this.store.privacyMode;
        return pm ? '******' : this.fmt(v);
      },
      tagClass(r) {
        return r.action_type === 'transfer_in' ? 'tag-in' : r.action_type === 'transfer_out' ? 'tag-out' : 'tag-revalue';
      },
      tagLabel(r) {
        return r.action_type === 'transfer_in' ? '转入' : r.action_type === 'transfer_out' ? '转出' : '更新';
      },
      amtColor(r) {
        return r.action_type === 'transfer_in' ? '#dc2626' : r.action_type === 'transfer_out' ? '#2563eb' : '#64748b';
      },
      amtPrefix(r) {
        return r.action_type === 'transfer_out' ? '-' : '';
      },
      close() {
        window.__store.drawerOpen = false;
        if (window.render) window.render();
      },
      action(type) {
        if (window.openRecord) window.openRecord(this.acctId, type);
      },
      edit(r) {
        if (window.editRecord) window.editRecord(r.id, r.account_id, r.action_type, r.amount, r.record_date, r.note || '', r.investor_id || '');
      },
      applyFilter() {
        // line-chart watches filterStart/filterEnd automatically
      },
      switchMode(mode) {
        this.chartMode = mode;
        // 通知 line-chart 切换模式
        this.$nextTick(() => {
          if (this.$refs.chart) this.$refs.chart.switchMode(mode);
        });
      },
      setRange(range) {
        this.drawerRange = range;
        if (range !== 'custom') this.customDateRange = false;
      },
    },
  };

  window.__accountDrawerComponent = AccountDrawer;
  console.log('[component] account-drawer loaded');
})();
