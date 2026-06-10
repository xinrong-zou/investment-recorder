// ====== 收益账本 - 共享折线图组件 ======
// 主页 total-chart 和抽屉 chart 共用此组件
// scope="all": 用 buildSeries 取所有账户数据
// scope="single": 用传入的 records 构建单账户数据

(function() {
  if (typeof Vue === 'undefined' || !window.__store) return;

  const LineChart = {
    props: {
      scope: { type: String, default: 'all' },        // 'all' | 'single'
      records: { type: Array, default: () => [] },
      accountType: { type: String, default: 'investment' },
      height: { type: Number, default: 260 },
      showPie: { type: Boolean, default: false },
      range: { type: String, default: 'all' },
      filterStart: { type: String, default: '' },
      filterEnd: { type: String, default: '' },
    },
    emits: ['update:range'],
    template: `
      <div>
        <div ref="chartEl" :style="{height: height + 'px', display: mode === 'pie' ? 'none' : 'block'}"></div>
        <div v-if="empty && mode !== 'pie'" class="chart-empty">暂无数据</div>
        <div v-if="mode === 'pie'">
          <div ref="pieEl" class="pie-chart-area" :style="{height: Math.min(height, 200) + 'px'}"></div>
          <div v-if="pieEmpty" class="chart-empty">至少2个可见账户才能显示资产配置</div>
        </div>
      </div>
    `,
    data() {
      return {
        mode: 'assets',
        _chart: null,
        _pieChart: null,
        empty: false,
        pieEmpty: false,
      };
    },
    computed: {
      store() { return window.__store; },
      accounts() { return this.store.accounts || []; },
      allRecords() { return this.store.allRecords || {}; },
      csi300Map() { return this.store.csi300Map || {}; },
      csi500Map() { return this.store.csi500Map || {}; },
      showHidden() { return this.store.showHidden; },
    },
    watch: {
      // 外部数据变化自动重绘
      records: { deep: true, handler() { this.$nextTick(() => this.renderChart()); } },
      range() { this.$nextTick(() => this.renderChart()); },
      filterStart() { this.$nextTick(() => this.renderChart()); },
      filterEnd() { this.$nextTick(() => this.renderChart()); },
      // scope=all 时依赖 store 中的数据变化
      accounts() { this.$nextTick(() => this.renderChart()); },
      allRecords: { deep: true, handler() { this.$nextTick(() => this.renderChart()); } },
      csi300Map() { this.$nextTick(() => this.renderChart()); },
      csi500Map() { this.$nextTick(() => this.renderChart()); },
    },
    mounted() {
      // 直接监听 store 变化（比 computed watcher 更可靠）
      this._unwatch300 = this.$watch(() => window.__store.csi300Map, () => { this.scheduleRender(); }, { deep: true });
      this._unwatch500 = this.$watch(() => window.__store.csi500Map, () => { this.scheduleRender(); }, { deep: true });
      this._unwatchAccounts = this.$watch(() => window.__store.accounts, () => { this.scheduleRender(); }, { deep: true });
      this._unwatchRecords = this.$watch(() => window.__store.allRecords, () => { this.scheduleRender(); }, { deep: true });
      this.$nextTick(() => this.renderChart());
    },
    beforeUnmount() {
      if (this._chart) { this._chart.dispose(); this._chart = null; }
      if (this._pieChart) { this._pieChart.dispose(); this._pieChart = null; }
      if (this._unwatch300) this._unwatch300();
      if (this._unwatch500) this._unwatch500();
      if (this._unwatchAccounts) this._unwatchAccounts();
      if (this._unwatchRecords) this._unwatchRecords();
    },
    methods: {
      scheduleRender() { this.$nextTick(() => this.renderChart()); },
      switchMode(m) {
        this.mode = m;
        this.$nextTick(() => this.renderChart());
      },

      renderChart() {
        if (this.mode === 'pie') {
          this.$nextTick(() => this.renderPie());
          return;
        }

        let dates, totalVal, totalCost, nav, cumRet, dailyTransfers;

        if (this.scope === 'all') {
          // 全账户模式
          const data = window.calcUtils.buildSeries(this.accounts, this.allRecords);
          if (!data) { this.empty = true; this.disposeChart(); return; }
          this.empty = false;
          ({ dates, totalVal, totalCost, nav, cumRet, dailyTransfers } = data);
        } else {
          // 单账户模式
          const sorted = window.calcUtils.sortRecords(this.records);
          if (sorted.length < 2) { this.empty = true; this.disposeChart(); return; }
          this.empty = false;
          let value = 0, cost = 0;
          dates = []; totalVal = []; totalCost = []; nav = []; cumRet = []; dailyTransfers = {};
          for (const r of sorted) {
            if (r.action_type === 'transfer_in') { value += Number(r.amount); cost += Number(r.amount); dailyTransfers[r.record_date] = dailyTransfers[r.record_date] || { netIn: 0, netOut: 0 }; dailyTransfers[r.record_date].netIn += Number(r.amount); }
            else if (r.action_type === 'transfer_out') { value -= Number(r.amount); cost -= Number(r.amount); dailyTransfers[r.record_date] = dailyTransfers[r.record_date] || { netIn: 0, netOut: 0 }; dailyTransfers[r.record_date].netOut += Number(r.amount); }
            else if (r.action_type === 'revalue') value = Number(r.amount);
            const navPlot = this.accountType === 'investment' ? (cost > 0 ? value / cost : value) : value;
            dates.push(r.record_date); totalVal.push(value); totalCost.push(cost); nav.push(navPlot); cumRet.push(value - cost);
          }
        }

        // 日期范围截取
        let startIdx = 0, endIdx = dates.length;
        if (this.range === 'thisYear') { const y = new Date().getFullYear(); startIdx = dates.findIndex(d => d >= y + '-01-01'); if (startIdx < 0) startIdx = 0; }
        else if (this.range === '1y') { const c = new Date(); c.setFullYear(c.getFullYear() - 1); const s = c.toISOString().slice(0, 10); startIdx = dates.findIndex(d => d >= s); if (startIdx < 0) startIdx = 0; }
        else if (this.range === '3y') { const c = new Date(); c.setFullYear(c.getFullYear() - 3); const s = c.toISOString().slice(0, 10); startIdx = dates.findIndex(d => d >= s); if (startIdx < 0) startIdx = 0; }
        if (this.filterStart) { const idx = dates.findIndex(d => d >= this.filterStart); if (idx >= 0) startIdx = Math.max(startIdx, idx); }
        if (this.filterEnd) { const idx = dates.findIndex(d => d > this.filterEnd); if (idx >= 0) endIdx = Math.min(endIdx, idx); }
        const sl = (arr) => arr.slice(startIdx, endIdx);
        dates = sl(dates); totalVal = sl(totalVal); totalCost = sl(totalCost); nav = sl(nav); cumRet = sl(cumRet);

        if (dates.length < 2) { this.empty = true; this.disposeChart(); return; }

        const el = this.$refs.chartEl;
        if (!el) return;
        if (this._chart) this._chart.dispose();
        const chart = echarts.init(el);
        this._chart = chart;

        // 红蓝数据点
        const valData = totalVal.map((v, i) => {
          const tf = dailyTransfers[dates[i]];
          if (!tf) return v;
          const net = tf.netIn - tf.netOut;
          if (Math.abs(net) < 0.005) return v;
          return { value: v, symbol: 'circle', symbolSize: this.scope === 'single' ? 4 : 6, itemStyle: { color: net > 0 ? '#dc2626' : '#2563eb', borderColor: net > 0 ? '#dc2626' : '#2563eb' } };
        });

        let option;
        if (this.mode === 'assets') {
          option = {
            tooltip: { z: 800, trigger: 'axis', formatter: (p) => {
              const idx = p[0].dataIndex, date = dates[idx];
              const av = typeof p[0].value === 'object' ? p[0].value.value : p[0].value;
              const cv = typeof p[1].value === 'object' ? p[1].value.value : p[1].value;
              const name = this.scope === 'single' ? '余额' : '总资产';
              const lines = [date, name + ': ¥' + av.toLocaleString(), '净投入: ¥' + cv.toLocaleString()];
              const tf = dailyTransfers[date];
              if (tf) { const net = tf.netIn - tf.netOut; if (Math.abs(net) >= 0.005) lines.push('当日净' + (net > 0 ? '转入: +¥' : '转出: -¥') + Math.abs(net).toLocaleString()); }
              return lines.join('<br/>');
            } },
            legend: { data: [this.scope === 'single' ? '余额' : '总资产', '净投入'], icon: 'rect', itemWidth: 12, itemHeight: 2, top: 0, right: 0, textStyle: { fontSize: 8, color: '#94a3b8' } },
            grid: { left: 42, right: 10, top: 18, bottom: 28 },
            xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 9, rotate: 30, color: '#94a3b8', margin: 4 }, axisLine: { show: false }, axisTick: { show: false } },
            yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, axisLabel: { fontSize: 9, color: '#94a3b8', formatter: v => v >= 10000 ? (v / 10000).toFixed(1) + '万' : v } },
            series: [
              { name: this.scope === 'single' ? '余额' : '总资产', type: 'line', data: valData, smooth: true, showSymbol: true, symbol: 'none', color: '#3b82f6', lineStyle: { width: 1.5, color: '#3b82f6' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.3)' }, { offset: 1, color: 'rgba(59,130,246,0)' }] } } },
              { name: '净投入', type: 'line', data: totalCost, smooth: true, symbol: 'none', color: '#f59e0b', lineStyle: { width: 1, color: '#f59e0b' } }
            ]
          };
        } else if (this.mode === 'nav') {
          // 沪深300归一化（直接从 __store 读取，绕过 computed 追踪）
          const csi300 = window.__store.csi300Map || {};
          const csi500 = window.__store.csi500Map || {};
          let lastV = null;
          const hR = dates.map(d => { const v = csi300[d]; if (v != null) lastV = v; return v; });
          const fg = hR.find(v => v != null);
          const hF = hR.map(v => v != null ? v : (fg || null));
          const base = fg || 1;
          const hN = hF.map(v => v != null ? v / base : null);
          let lastV5 = null;
          const zR = dates.map(d => { const v = csi500[d]; if (v != null) lastV5 = v; return v; });
          const fg5 = zR.find(v => v != null);
          const zF = zR.map(v => v != null ? v : (fg5 || null));
          const base5 = fg5 || 1;
          const zN = zF.map(v => v != null ? v / base5 : null);
          option = {
            tooltip: { z: 800, trigger: 'axis', formatter: (p) => [p[0].axisValue, ...p.map(d => d.seriesName + ': ' + (isNaN(d.value) ? '—' : d.value.toFixed(4)))].join('<br/>') },
            legend: { data: ['净值', '沪深300', '中证500'], selected: { '净值': true, '沪深300': true, '中证500': false }, icon: 'rect', itemWidth: 12, itemHeight: 2, top: 0, right: 0, textStyle: { fontSize: 8, color: '#94a3b8' } },
            grid: { left: 42, right: 10, top: 18, bottom: 28 },
            xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 9, rotate: 30, color: '#94a3b8', margin: 4 }, axisLine: { show: false }, axisTick: { show: false } },
            yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, axisLabel: { fontSize: 9, color: '#94a3b8', formatter: v => v.toFixed(3) } },
            series: [
              { name: '净值', type: 'line', data: nav, smooth: true, symbol: 'none', color: '#1e293b', lineStyle: { width: 1.5, color: '#1e293b' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(30,41,59,0.15)' }, { offset: 1, color: 'rgba(30,41,59,0)' }] } } },
              { name: '沪深300', type: 'line', data: hN, smooth: true, symbol: 'none', color: '#f97316', lineStyle: { width: 1, color: '#f97316' } },
              { name: '中证500', type: 'line', data: zN, smooth: true, symbol: 'none', color: '#22c55e', lineStyle: { width: 1, color: '#22c55e' } }
            ]
          };
        } else {
          option = {
            tooltip: { z: 800, trigger: 'axis', formatter: (p) => {
              const d = p[0], dt = dates[d.dataIndex];
              let lines = [dt, '累计收益: ' + (isNaN(d.value) ? '—' : '¥' + Number(d.value).toLocaleString())];
              const tf = dailyTransfers[dt];
              if (tf) { const net = tf.netIn - tf.netOut; if (Math.abs(net) >= 0.005) lines.push('当日净' + (net > 0 ? '转入: +¥' : '转出: -¥') + Math.abs(net).toLocaleString()); }
              return lines.join('<br/>');
            } },
            legend: { data: ['累计收益'], icon: 'rect', itemWidth: 12, itemHeight: 2, top: 0, right: 0, textStyle: { fontSize: 8, color: '#94a3b8' } },
            grid: { left: 42, right: 10, top: 18, bottom: 28 },
            xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 9, rotate: 30, color: '#94a3b8', margin: 4 }, axisLine: { show: false }, axisTick: { show: false } },
            yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, axisLabel: { fontSize: 9, color: '#94a3b8', formatter: v => v >= 10000 ? (v / 10000).toFixed(1) + '万' : v } },
            series: [{ name: '累计收益', type: 'line', data: cumRet, smooth: true, symbol: 'none', color: '#dc2626', lineStyle: { width: 1.5, color: '#dc2626' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(220,38,38,0.3)' }, { offset: 1, color: 'rgba(220,38,38,0)' }] } } }]
          };
        }
        chart.setOption(option, true);
      },

      renderPie() {
        const el = this.$refs.pieEl;
        if (!el) return;
        if (this._pieChart) { this._pieChart.dispose(); this._pieChart = null; }
        const visible = this.accounts.filter(a => this.showHidden || !a.hidden);
        if (visible.length < 2) { this.pieEmpty = true; return; }
        const data = visible.map(a => {
          const calc = window.calcAccount(a, this.allRecords[a.id] || []);
          return { name: a.name, value: Math.abs(calc.currentValue) };
        }).filter(d => d.value > 0);
        if (data.length < 2) { this.pieEmpty = true; return; }
        this.pieEmpty = false;
        this._pieChart = echarts.init(el);
        this._pieChart.setOption({ tooltip: { trigger: 'item', formatter: '{b}: ¥{c}' }, series: [{ type: 'pie', radius: ['35%', '65%'], center: ['50%', '50%'], data, label: { fontSize: 9, color: '#94a3b8' } }] }, true);
      },

      disposeChart() {
        if (this._chart) { this._chart.dispose(); this._chart = null; }
      },
    },
  };

  window.__lineChartComponent = LineChart;
  console.log('[component] line-chart loaded');
})();
