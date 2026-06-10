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
            <!-- 迷你折线图容器 -->
            <div ref="chartEl" :style="{height: '140px', marginBottom: '12px', display: hasChart ? 'block' : 'none'}">
              <div v-if="!hasChart" style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem;">至少2条记录才能显示趋势</div>
            </div>
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
      ranges() { return [{key:'all',label:'全部'},{key:'thisYear',label:'今年'},{key:'1y',label:'近1年'},{key:'3y',label:'近3年'}]; },
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
          this.$nextTick(() => this.renderChart());
        } else {
          // 销毁图表
          this.disposeChart();
        }
      },
      drawerRange() { this.$nextTick(() => this.renderChart()); },
      chartMode() { this.$nextTick(() => this.renderChart()); },
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
        this.disposeChart();
        window.__store.drawerOpen = false;
        if (window.render) window.render();
      },
      action(type) {
        if (window.openRecord) window.openRecord(this.acctId, type);
      },
      edit(r) {
        if (window.editRecord) window.editRecord(r.id, r.account_id, r.action_type, r.amount, r.record_date, r.note || '');
      },
      applyFilter() {
        this.$nextTick(() => this.renderChart());
      },
      switchMode(mode) {
        this.chartMode = mode;
      },
      setRange(range) {
        this.drawerRange = range;
        if (range !== 'custom') this.customDateRange = false;
      },
      renderChart() {
        const el = this.$refs.chartEl;
        if (!el || this.records.length < 2) return;
        // 销毁旧实例
        if (this._chart) { this._chart.dispose(); }
        // 构建时间序列
        const rawRecords = window.calcUtils.sortRecords(this.records);
        let value = 0, cost = 0;
        const dates = [], vals = [], costs = [], navs = [], rets = [];
        const dailyTransfers = {};
        for (const r of rawRecords) {
          if (r.action_type === 'transfer_in') { value += Number(r.amount); cost += Number(r.amount); dailyTransfers[r.record_date] = dailyTransfers[r.record_date] || {netIn: 0, netOut: 0}; dailyTransfers[r.record_date].netIn += Number(r.amount); }
          else if (r.action_type === 'transfer_out') { value -= Number(r.amount); cost -= Number(r.amount); dailyTransfers[r.record_date] = dailyTransfers[r.record_date] || {netIn: 0, netOut: 0}; dailyTransfers[r.record_date].netOut += Number(r.amount); }
          else if (r.action_type === 'revalue') value = Number(r.amount);
          const navPlot = this.isInvestment ? (cost > 0 ? value / cost : value) : value;
          dates.push(r.record_date); vals.push(value); costs.push(cost); navs.push(navPlot); rets.push(value - cost);
        }
        // 日期范围截取
        let startIdx = 0, endIdx = dates.length;
        if (this.drawerRange === 'thisYear') { const y = new Date().getFullYear(); startIdx = dates.findIndex(d => d >= y + '-01-01'); if (startIdx < 0) startIdx = 0; }
        else if (this.drawerRange === '1y') { const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1); const s = cutoff.toISOString().slice(0, 10); startIdx = dates.findIndex(d => d >= s); if (startIdx < 0) startIdx = 0; }
        else if (this.drawerRange === '3y') { const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 3); const s = cutoff.toISOString().slice(0, 10); startIdx = dates.findIndex(d => d >= s); if (startIdx < 0) startIdx = 0; }
        if (this.filterStart) { const idx = dates.findIndex(d => d >= this.filterStart); if (idx >= 0) startIdx = Math.max(startIdx, idx); }
        if (this.filterEnd) { const idx = dates.findIndex(d => d > this.filterEnd); if (idx >= 0) endIdx = Math.min(endIdx, idx); }
        const slice = (arr) => arr.slice(startIdx, endIdx);
        const sDates = slice(dates), sVals = slice(vals), sCosts = slice(costs), sNavs = slice(navs), sRets = slice(rets);
        if (sDates.length < 2) { el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem;">至少2条记录才能显示趋势</div>'; return; }
        // 标记红蓝数据点
        const valData = sVals.map((v, i) => {
          const tf = dailyTransfers[sDates[i]];
          if (!tf) return v;
          const net = tf.netIn - tf.netOut;
          if (Math.abs(net) < 0.005) return v;
          return { value: v, symbol: 'circle', symbolSize: 4, itemStyle: { color: net > 0 ? '#dc2626' : '#2563eb', borderColor: net > 0 ? '#dc2626' : '#2563eb' } };
        });
        // ECharts option
        const chart = echarts.init(el);
        this._chart = chart;
        const mode = this.chartMode;
        let option;
        if (mode === 'assets') {
          option = {
            tooltip: { z: 800, trigger: 'axis', formatter: function (p) { const idx = p[0].dataIndex; const lines = [sDates[idx], ...p.map(d => d.seriesName + ': ' + (isNaN(d.value) ? '—' : '¥' + Number(d.value).toFixed(2)))]; const tf = dailyTransfers[sDates[idx]]; if (tf) { const net = tf.netIn - tf.netOut; if (Math.abs(net) >= 0.005) lines.push('当日净' + (net > 0 ? '转入: +¥' : '转出: -¥') + Math.abs(net).toLocaleString()); } return lines.join('<br/>'); } },
            legend: { data: ['余额', '净投入'], icon: 'rect', itemWidth: 12, itemHeight: 2, top: 0, right: 0, textStyle: { fontSize: 8, color: '#94a3b8' } },
            grid: { left: 42, right: 10, top: 18, bottom: 28 },
            xAxis: { type: 'category', data: sDates, axisLabel: { fontSize: 9, rotate: 30, color: '#94a3b8', margin: 4 }, axisLine: { show: false }, axisTick: { show: false } },
            yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, axisLabel: { fontSize: 9, color: '#94a3b8', formatter: v => v >= 10000 ? (v / 10000).toFixed(1) + '万' : v } },
            series: [
              { name: '余额', type: 'line', data: valData, smooth: true, showSymbol: true, symbol: 'none', color: '#3b82f6', lineStyle: { width: 1.5, color: '#3b82f6' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.3)' }, { offset: 1, color: 'rgba(59,130,246,0)' }] } } },
              { name: '净投入', type: 'line', data: sCosts, smooth: true, symbol: 'none', color: '#f59e0b', lineStyle: { width: 1, color: '#f59e0b' } }
            ]
          };
        } else if (mode === 'nav') {
          option = {
            tooltip: { z: 800, trigger: 'axis', formatter: function (p) { return [p[0].axisValue, ...p.map(d => d.seriesName + ': ' + (isNaN(d.value) ? '—' : d.value.toFixed(4)))].join('<br/>'); } },
            legend: { data: ['净值'], icon: 'rect', itemWidth: 12, itemHeight: 2, top: 0, right: 0, textStyle: { fontSize: 8, color: '#94a3b8' } },
            grid: { left: 42, right: 10, top: 18, bottom: 28 },
            xAxis: { type: 'category', data: sDates, axisLabel: { fontSize: 9, rotate: 30, color: '#94a3b8', margin: 4 }, axisLine: { show: false }, axisTick: { show: false } },
            yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, axisLabel: { fontSize: 9, color: '#94a3b8', formatter: v => v.toFixed(4) } },
            series: [{ name: '净值', type: 'line', data: sNavs, smooth: true, symbol: 'none', color: '#1e293b', lineStyle: { width: 1.5, color: '#1e293b' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(30,41,59,0.15)' }, { offset: 1, color: 'rgba(30,41,59,0)' }] } } }]
          };
        } else {
          option = {
            tooltip: { z: 800, trigger: 'axis', formatter: function (p) { const d = p[0]; return d.axisValue + '<br/>累计收益: ' + (isNaN(d.value) ? '—' : '¥' + Number(d.value).toFixed(2)); } },
            legend: { data: ['累计收益'], icon: 'rect', itemWidth: 12, itemHeight: 2, top: 0, right: 0, textStyle: { fontSize: 8, color: '#94a3b8' } },
            grid: { left: 42, right: 10, top: 18, bottom: 28 },
            xAxis: { type: 'category', data: sDates, axisLabel: { fontSize: 9, rotate: 30, color: '#94a3b8', margin: 4 }, axisLine: { show: false }, axisTick: { show: false } },
            yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, axisLabel: { fontSize: 9, color: '#94a3b8', formatter: v => v >= 10000 ? (v / 10000).toFixed(1) + '万' : v } },
            series: [{ name: '累计收益', type: 'line', data: sRets, smooth: true, symbol: 'none', color: '#dc2626', lineStyle: { width: 1.5, color: '#dc2626' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(220,38,38,0.3)' }, { offset: 1, color: 'rgba(220,38,38,0)' }] } } }]
          };
        }
        chart.setOption(option, true);
      },
      disposeChart() {
        if (this._chart) { this._chart.dispose(); this._chart = null; }
      },
    },
  };

  window.__accountDrawerComponent = AccountDrawer;

  // Also install a direct chart renderer that's easy to call
  if (typeof window !== 'undefined' && !window.renderDrawerChartDirect) {
    // The renderDrawerChartDirect will be defined after this script loads
  }

  console.log('[component] account-drawer loaded');
})();
