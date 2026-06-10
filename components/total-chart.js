// ====== 收益账本 - 主图表组件 ======

(function() {
  if (typeof Vue === 'undefined' || !window.__store) return;

  const TotalChart = {
    template: `
      <div class="chart-container">
        <div class="chart-tabs">
          <button v-for="m in modes" :key="m.key" class="chart-tab" :class="{active: mode === m.key}" @click="switchMode(m.key)">{{ m.label }}</button>
        </div>
        <div class="chart-range-btns" v-if="mode !== 'pie'">
          <button v-for="r in ranges" :key="r.key" class="chart-range-btn" :class="{active: range === r.key}" @click="setRange(r.key)">{{ r.label }}</button>
        </div>
        <div v-if="range === 'custom' && mode !== 'pie'" style="margin-bottom:6px;">
          <input type="date" v-model="customStart" @change="renderChart" style="font-size:0.8rem;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
          <span style="color:var(--text-muted);font-size:0.78rem;margin:0 2px;">至</span>
          <input type="date" v-model="customEnd" @change="renderChart" style="font-size:0.8rem;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
          <button class="btn btn-ghost btn-sm" @click="clearCustom">✕ 清除</button>
        </div>
        <div ref="totalChart" class="chart-area" :style="{display: mode !== 'pie' ? 'block' : 'none'}"></div>
        <div v-if="mode === 'pie'" class="chart-area">
          <div ref="pieChart" class="pie-chart-area" style="height:200px;"></div>
          <div v-if="pieEmpty" class="chart-empty">至少2个可见账户才能显示资产配置</div>
        </div>
        <div v-if="chartEmpty && mode !== 'pie'" class="chart-empty">暂无数据</div>
      </div>
    `,
    data() {
      return {
        mode: 'assets',
        range: 'all',
        customStart: '',
        customEnd: '',
        _chart: null,
        _pieChart: null,
        chartEmpty: false,
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
      modes() { return [{key:'assets',label:'总资产'},{key:'nav',label:'净值'},{key:'return',label:'累计收益'},{key:'pie',label:'配置'}]; },
      ranges() { return [{key:'all',label:'全部'},{key:'thisYear',label:'今年'},{key:'1y',label:'近1年'},{key:'3y',label:'近3年'},{key:'custom',label:'自定义'}]; },
    },
    watch: {
      accounts() { this.$nextTick(() => this.renderChart()); },
      allRecords: { deep: true, handler() { this.$nextTick(() => this.renderChart()); } },
      csi300Map() { this.$nextTick(() => this.renderChart()); },
      csi500Map() { this.$nextTick(() => this.renderChart()); },
    },
    mounted() {
      this.$nextTick(() => this.renderChart());
    },
    beforeUnmount() {
      if (this._chart) { this._chart.dispose(); this._chart = null; }
      if (this._pieChart) { this._pieChart.dispose(); this._pieChart = null; }
    },
    methods: {
      switchMode(m) {
        this.mode = m;
        this.$nextTick(() => this.renderChart());
      },
      setRange(r) {
        this.range = r;
        if (r !== 'custom') { this.customStart = ''; this.customEnd = ''; }
        this.$nextTick(() => this.renderChart());
      },
      clearCustom() {
        this.customStart = ''; this.customEnd = '';
        this.range = 'all';
        this.$nextTick(() => this.renderChart());
      },
      computeRangeStart() {
        if (this.range === 'custom') {
          if (this.customStart && this.customEnd && this.customStart <= this.customEnd) return this.customStart;
          if (this.customStart) return this.customStart;
          return '';
        }
        const n = new Date();
        if (this.range === 'thisYear') return new Date(n.getFullYear(), 0, 1).toISOString().slice(0, 10);
        if (this.range === '1y') { n.setFullYear(n.getFullYear() - 1); return n.toISOString().slice(0, 10); }
        if (this.range === '3y') { n.setFullYear(n.getFullYear() - 3); return n.toISOString().slice(0, 10); }
        return '';
      },
      renderChart() {
        const data = window.calcUtils.buildSeries(this.accounts, this.allRecords);
        const totalEl = this.$refs.totalChart;
        const pieEl = this.$refs.pieChart;
        
        if (this.mode === 'pie') {
          if (pieEl) this.renderPieChart(pieEl);
          return;
        }
        
        if (!data) {
          this.chartEmpty = true;
          if (this._chart) { this._chart.dispose(); this._chart = null; }
          return;
        }
        this.chartEmpty = false;
        
        let { dates, totalVal, totalCost, nav, cumRet, dailyTransfers } = data;
        
        // 日期范围截取
        const rangeStart = this.computeRangeStart();
        if (rangeStart) {
          const idx = dates.findIndex(d => d >= rangeStart);
          if (idx > 0) {
            dates = dates.slice(idx);
            totalVal = totalVal.slice(idx);
            totalCost = totalCost.slice(idx);
            nav = nav.slice(idx);
            cumRet = cumRet.slice(idx);
            const newDt = {};
            for (const k of Object.keys(dailyTransfers)) { if (k >= rangeStart) newDt[k] = dailyTransfers[k]; }
            dailyTransfers = newDt;
          }
        }
        if (this.range === 'custom' && this.customEnd) {
          const idx = dates.findIndex(d => d > this.customEnd);
          if (idx >= 0) {
            dates = dates.slice(0, idx);
            totalVal = totalVal.slice(0, idx);
            totalCost = totalCost.slice(0, idx);
            nav = nav.slice(0, idx);
            cumRet = cumRet.slice(0, idx);
          }
        }
        
        if (dates.length < 2) { this.chartEmpty = true; if (this._chart) { this._chart.dispose(); this._chart = null; } return; }
        
        if (!totalEl) return;
        if (this._chart) this._chart.dispose();
        const chart = echarts.init(totalEl);
        this._chart = chart;
        
        let option;
        if (this.mode === 'assets') {
          const assetData = totalVal.map((v, i) => {
            const dt = dates[i], tf = dailyTransfers[dt];
            if (!tf) return v;
            const net = tf.netIn - tf.netOut;
            if (Math.abs(net) < 0.005) return v;
            return { value: v, symbol: 'circle', symbolSize: 6, itemStyle: { color: net > 0 ? '#dc2626' : '#2563eb', borderColor: net > 0 ? '#dc2626' : '#2563eb' } };
          });
          option = {
            tooltip: { z: 800, trigger: 'axis', formatter: (p) => {
              const idx = p[0].dataIndex, date = dates[idx];
              const av = typeof p[0].value === 'object' ? p[0].value.value : p[0].value;
              const cv = typeof p[1].value === 'object' ? p[1].value.value : p[1].value;
              let lines = [date, '总资产: ¥' + av.toLocaleString(), '净投入: ¥' + cv.toLocaleString()];
              const tf = dailyTransfers[date];
              if (tf) { const net = tf.netIn - tf.netOut; if (Math.abs(net) >= 0.005) lines.push('当日净' + (net > 0 ? '转入: +¥' : '转出: -¥') + Math.abs(net).toLocaleString()); }
              return lines.join('<br/>');
            } },
            legend: { data: ['总资产', '净投入'], icon: 'rect', itemWidth: 14, itemHeight: 2.5, textStyle: { fontSize: 10, color: '#94a3b8' } },
            grid: { left: 48, right: 16, top: 28, bottom: 28 },
            xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, color: '#94a3b8', margin: 6, rotate: 30 }, axisLine: { show: false }, axisTick: { show: false } },
            yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, axisLabel: { fontSize: 10, color: '#94a3b8', formatter: v => v >= 10000 ? (v / 10000).toFixed(1) + '万' : v } },
            series: [
              { name: '总资产', type: 'line', data: assetData, smooth: true, showSymbol: true, symbol: 'none', color: '#3b82f6', lineStyle: { width: 1.5, color: '#3b82f6' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.25)' }, { offset: 1, color: 'rgba(59,130,246,0)' }] } } },
              { name: '净投入', type: 'line', data: totalCost, smooth: true, symbol: 'none', color: '#f59e0b', lineStyle: { width: 1, color: '#f59e0b' } }
            ]
          };
        } else if (this.mode === 'nav') {
          let lastV = null;
          const hs300Raw = dates.map(d => { const v = this.csi300Map[d]; if (v != null) lastV = v; return v; });
          const firstGood = hs300Raw.find(v => v != null);
          const hs300Fill = hs300Raw.map(v => v != null ? v : (firstGood || null));
          const base = firstGood || 1;
          const hs300Norm = hs300Fill.map(v => v != null ? v / base : null);
          let lastV5 = null;
          const zz500Raw = dates.map(d => { const v = this.csi500Map[d]; if (v != null) lastV5 = v; return v; });
          const firstGood5 = zz500Raw.find(v => v != null);
          const zz500Fill = zz500Raw.map(v => v != null ? v : (firstGood5 || null));
          const base5 = firstGood5 || 1;
          const zz500Norm = zz500Fill.map(v => v != null ? v / base5 : null);
          option = {
            tooltip: { z: 800, trigger: 'axis', formatter: (p) => [p[0].axisValue, ...p.map(d => d.seriesName + ': ' + (isNaN(d.value) ? '—' : d.value.toFixed(4)))].join('<br/>') },
            legend: { data: ['净值', '沪深300', '中证500'], selected: { '净值': true, '沪深300': true, '中证500': false }, icon: 'rect', itemWidth: 14, itemHeight: 2.5, textStyle: { fontSize: 10, color: '#94a3b8' } },
            grid: { left: 48, right: 16, top: 28, bottom: 28 },
            xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, color: '#94a3b8', margin: 6, rotate: 30 }, axisLine: { show: false }, axisTick: { show: false } },
            yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, axisLabel: { fontSize: 10, color: '#94a3b8', formatter: v => v.toFixed(3) } },
            series: [
              { name: '净值', type: 'line', data: nav, smooth: true, symbol: 'none', color: '#1e293b', lineStyle: { width: 1.5, color: '#1e293b' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(30,41,59,0.1)' }, { offset: 1, color: 'rgba(30,41,59,0)' }] } } },
              { name: '沪深300', type: 'line', data: hs300Norm, smooth: true, symbol: 'none', color: '#f97316', lineStyle: { width: 1, color: '#f97316' } },
              { name: '中证500', type: 'line', data: zz500Norm, smooth: true, symbol: 'none', color: '#22c55e', lineStyle: { width: 1, color: '#22c55e' } }
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
            legend: { data: ['累计收益'], icon: 'rect', itemWidth: 14, itemHeight: 2.5, textStyle: { fontSize: 10, color: '#94a3b8' } },
            grid: { left: 48, right: 16, top: 28, bottom: 28 },
            xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 10, color: '#94a3b8', margin: 6, rotate: 30 }, axisLine: { show: false }, axisTick: { show: false } },
            yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, axisLabel: { fontSize: 10, color: '#94a3b8', formatter: v => v >= 10000 ? (v / 10000).toFixed(1) + '万' : v } },
            series: [{ name: '累计收益', type: 'line', data: cumRet, smooth: true, symbol: 'none', color: '#dc2626', lineStyle: { width: 1.5, color: '#dc2626' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(220,38,38,0.2)' }, { offset: 1, color: 'rgba(220,38,38,0)' }] } } }]
          };
        }
        chart.setOption(option, true);
      },
      renderPieChart(el) {
        const visible = this.accounts.filter(a => this.showHidden || !a.hidden);
        if (this._pieChart) { this._pieChart.dispose(); this._pieChart = null; }
        if (visible.length < 2) { this.pieEmpty = true; return; }
        this.pieEmpty = false;
        const data = visible.map(a => {
          const calc = window.calcAccount(a, this.allRecords[a.id] || []);
          return { name: a.name, value: Math.abs(calc.currentValue) };
        }).filter(d => d.value > 0);
        if (data.length < 2) { this.pieEmpty = true; return; }
        this.pieEmpty = false;
        this._pieChart = echarts.init(el);
        this._pieChart.setOption({
          tooltip: { trigger: 'item', formatter: '{b}: ¥{c}' },
          series: [{ type: 'pie', radius: ['35%', '65%'], center: ['50%', '50%'], data, label: { fontSize: 9, color: '#94a3b8' } }]
        }, true);
      },
    },
  };

  window.__totalChartComponent = TotalChart;
  console.log('[component] total-chart loaded');
})();
