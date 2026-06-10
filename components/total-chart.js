// ====== 收益账本 - 主图表组件（使用共享 line-chart） ======

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
          <input type="date" v-model="customStart" @change="onCustomChange" style="font-size:0.8rem;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
          <span style="color:var(--text-muted);font-size:0.78rem;margin:0 2px;">至</span>
          <input type="date" v-model="customEnd" @change="onCustomChange" style="font-size:0.8rem;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
          <button class="btn btn-ghost btn-sm" @click="clearCustom">✕ 清除</button>
        </div>
        <line-chart ref="chart" scope="all" :height="260" :range="range" :show-pie="true"
          :filter-start="customStart" :filter-end="customEnd"></line-chart>
      </div>
    `,
    data() {
      return {
        mode: 'assets',
        range: 'all',
        customStart: '',
        customEnd: '',
      };
    },
    computed: {
      modes() { return [{key:'assets',label:'总资产'},{key:'nav',label:'净值'},{key:'return',label:'累计收益'},{key:'pie',label:'配置'}]; },
      ranges() { return [{key:'all',label:'全部'},{key:'thisYear',label:'今年'},{key:'1y',label:'近1年'},{key:'3y',label:'近3年'},{key:'custom',label:'自定义'}]; },
    },
    watch: {
      mode(m) { this.$nextTick(() => { const ch = this.$refs.chart; if (ch) ch.switchMode(m); }); },
    },
    methods: {
      switchMode(m) {
        this.mode = m;
      },
      setRange(r) {
        this.range = r;
        if (r !== 'custom') { this.customStart = ''; this.customEnd = ''; }
      },
      onCustomChange() {
        this.range = 'custom';
      },
      clearCustom() {
        this.customStart = ''; this.customEnd = '';
        this.range = 'all';
      },
    },
  };

  window.__totalChartComponent = TotalChart;
  console.log('[component] total-chart (light) loaded');
})();
