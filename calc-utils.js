// ====== 收益账本 - 纯函数工具集 ======
// 无 DOM 操作、无 API 调用、无 Vue 依赖
// 所有函数接收数据作为参数，不读全局变量

(function() {

  // -------------------------------------------------------------------
  // 金额格式化
  // -------------------------------------------------------------------
  function fmt(n) {
    return n == null ? '—' : '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtPct(n) {
    return n == null ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%';
  }
  function fmtS(v, privacyMode) {
    return privacyMode ? '******' : fmt(v);
  }

  // -------------------------------------------------------------------
  // 记录排序：date ASC → transfer_in(0) → transfer_out(1) → revalue(2) → id ASC
  // -------------------------------------------------------------------
  function sortRecords(records) {
    return [...records].sort((a, b) => {
      const d = new Date(a.record_date) - new Date(b.record_date);
      if (d !== 0) return d;
      const order = { transfer_in: 0, transfer_out: 1, revalue: 2 };
      const ao = (order[a.action_type] || 0) - (order[b.action_type] || 0);
      if (ao !== 0) return ao;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
  }

  // -------------------------------------------------------------------
  // 单账户计算：成本、当前值、收益、收益率、净值
  // -------------------------------------------------------------------
  function calcAccount(acct, records) {
    const sorted = sortRecords(records);
    let cost = 0, lastRevalue = null;
    sorted.forEach(r => {
      if (r.action_type === 'transfer_in') {
        cost += Number(r.amount);
        if (lastRevalue != null) lastRevalue += Number(r.amount);
      } else if (r.action_type === 'transfer_out') {
        cost -= Number(r.amount);
        if (lastRevalue != null) lastRevalue -= Number(r.amount);
      } else if (r.action_type === 'revalue') {
        lastRevalue = Number(r.amount);
      }
    });
    const isCash = acct.account_type === 'cash';
    const val = isCash ? cost : (lastRevalue != null ? lastRevalue : cost);
    const ret = val - cost;
    const retPct = cost > 0 ? (ret / cost) * 100 : 0;
    const nav = cost > 0 ? val / cost : 1;
    return { costBasis: cost, currentValue: val, totalReturn: ret, returnPct: retPct, nav };
  }

  // -------------------------------------------------------------------
  // XIRR 年化收益率（牛顿法）
  // -------------------------------------------------------------------
  function calcXIRR(records, accountType, currentValue) {
    const flows = records.filter(r => r.action_type !== 'revalue').map(r => ({
      amount: r.action_type === 'transfer_in' ? -Number(r.amount) : Number(r.amount),
      date: new Date(r.record_date)
    }));
    if (flows.length < 2) return null;
    flows.sort((a, b) => a.date - b.date);
    if (currentValue != null && currentValue !== 0) {
      let lastDate = flows[flows.length - 1].date;
      records.forEach(r => { const d = new Date(r.record_date); if (!isNaN(d) && d > lastDate) lastDate = d; });
      flows.push({ amount: currentValue, date: lastDate });
    }
    const startDate = flows[0].date;
    const days = flows.map(f => (f.date - startDate) / 86400000);
    const amounts = flows.map(f => f.amount);
    const guesses = [0.1, -0.1, 0.3, -0.3, 0.5, -0.5, 0.01, -0.01, 0.001, -0.001, 0.99];
    for (let g of guesses) {
      let rate = g;
      for (let iter = 0; iter < 100; iter++) {
        let f = 0, fp = 0;
        for (let i = 0; i < amounts.length; i++) {
          const exp = days[i] / 365;
          const denom = Math.pow(1 + rate, exp);
          f += amounts[i] / denom;
          fp -= exp * amounts[i] / (denom * (1 + rate));
        }
        if (Math.abs(f) < 1e-7) return rate;
        if (fp === 0) break;
        const newRate = rate - f / fp;
        if (newRate < -0.9999 || newRate > 10) break;
        rate = newRate;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------
  // 构建图表时序数据（增量 O(n) 算法）
  // -------------------------------------------------------------------
  function buildSeries(accounts, allRecords) {
    const dset = new Set();
    accounts.forEach(a => { (allRecords[a.id] || []).forEach(r => dset.add(r.record_date)); });
    const dates = [...dset].sort();
    if (dates.length < 2) return null;

    // 每日净转入/净转出
    const dailyTransfers = {};
    for (const aid of Object.keys(allRecords)) {
      for (const r of (allRecords[aid] || [])) {
        if (r.action_type === 'transfer_in' || r.action_type === 'transfer_out') {
          if (!dailyTransfers[r.record_date]) dailyTransfers[r.record_date] = { netIn: 0, netOut: 0 };
          if (r.action_type === 'transfer_in') dailyTransfers[r.record_date].netIn += Number(r.amount);
          else dailyTransfers[r.record_date].netOut += Number(r.amount);
        }
      }
    }
    for (const d of Object.keys(dailyTransfers)) {
      if (Math.abs(dailyTransfers[d].netIn - dailyTransfers[d].netOut) < 0.005) delete dailyTransfers[d];
    }

    // 增量计算
    const acctState = {};
    for (const a of accounts) {
      const recs = sortRecords(allRecords[a.id] || []);
      acctState[a.id] = { ptr: 0, cost: 0, lastRevalue: null, records: recs };
    }

    const totalValArr = [], totalCostArr = [], navArr = [], cumRetArr = [];
    for (const d of dates) {
      for (const a of accounts) {
        const st = acctState[a.id];
        while (st.ptr < st.records.length && st.records[st.ptr].record_date <= d) {
          const r = st.records[st.ptr];
          if (r.action_type === 'transfer_in') {
            st.cost += Number(r.amount);
            if (st.lastRevalue != null) st.lastRevalue += Number(r.amount);
          } else if (r.action_type === 'transfer_out') {
            st.cost -= Number(r.amount);
            if (st.lastRevalue != null) st.lastRevalue -= Number(r.amount);
          } else if (r.action_type === 'revalue') {
            st.lastRevalue = Number(r.amount);
          }
          st.ptr++;
        }
      }
      let v = 0, c = 0;
      for (const a of accounts) {
        const st = acctState[a.id];
        const isCash = a.account_type === 'cash';
        const val = isCash ? st.cost : (st.lastRevalue != null ? st.lastRevalue : st.cost);
        v += val; c += st.cost;
      }
      totalValArr.push(v); totalCostArr.push(c);
      navArr.push(c > 0 ? v / c : 1); cumRetArr.push(v - c);
    }
    return { dates, totalVal: totalValArr, totalCost: totalCostArr, nav: navArr, cumRet: cumRetArr, dailyTransfers };
  }

  // -------------------------------------------------------------------
  // 最大回撤
  // -------------------------------------------------------------------
  function calcMaxDrawdown(accounts, allRecords) {
    const data = buildSeries(accounts, allRecords);
    if (!data || data.nav.length < 2) return { maxDd: 0, ddStart: '', ddEnd: '' };
    let peak = data.nav[0], peakIdx = 0, maxDd = 0, ddStart = 0, ddEnd = 0;
    for (let i = 1; i < data.nav.length; i++) {
      if (data.nav[i] > peak) { peak = data.nav[i]; peakIdx = i; }
      const dd = (data.nav[i] - peak) / peak;
      if (dd < maxDd) { maxDd = dd; ddStart = peakIdx; ddEnd = i; }
    }
    return { maxDd, ddStart: data.dates[ddStart], ddEnd: data.dates[ddEnd] };
  }

  // -------------------------------------------------------------------
  // 单账户最大回撤（用于抽屉详情）
  // -------------------------------------------------------------------
  function calcDrawerMaxDrawdown(acct, records) {
    const sorted = sortRecords(records);
    if (sorted.length < 2) return { maxDd: 0, ddStart: '', ddEnd: '' };
    let val = 0, cost = 0, peak = 1, peakIdx = 0, ddVal = 0, ddStart = 0, ddEnd = 0;
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      if (r.action_type === 'transfer_in') { val += Number(r.amount); cost += Number(r.amount); }
      else if (r.action_type === 'transfer_out') { val -= Number(r.amount); cost -= Number(r.amount); }
      else if (r.action_type === 'revalue') { val = Number(r.amount); }
      const nav = acct.account_type === 'investment' ? (cost > 0 ? val / cost : val) : val;
      if (nav > peak) { peak = nav; peakIdx = i; }
      const dd = (nav - peak) / peak;
      if (dd < ddVal) { ddVal = dd; ddStart = peakIdx; ddEnd = i; }
    }
    if (ddVal < 0) return { maxDd: ddVal, ddStart: sorted[ddStart].record_date, ddEnd: sorted[ddEnd].record_date };
    return { maxDd: 0, ddStart: '', ddEnd: '' };
  }

  // -------------------------------------------------------------------
  // 检查现金账户余额是否出现负数
  // -------------------------------------------------------------------
  function checkNegativeBalance(accountId, accounts, allRecords) {
    const acct = accounts.find(a => a.id === accountId);
    if (!acct || acct.account_type !== 'cash') return null;
    const records = sortRecords(allRecords[accountId] || []);
    let bal = 0;
    for (const r of records) {
      if (r.action_type === 'transfer_in') bal += Number(r.amount);
      else if (r.action_type === 'transfer_out') bal -= Number(r.amount);
      if (bal < 0) return { date: r.record_date, balance: bal };
    }
    return null;
  }

  // -------------------------------------------------------------------
  // 导出
  // -------------------------------------------------------------------
  const calcUtils = {
    fmt, fmtPct, fmtS,
    sortRecords,
    calcAccount,
    calcXIRR,
    buildSeries,
    calcMaxDrawdown,
    calcDrawerMaxDrawdown,
    checkNegativeBalance,
  };

  // 兼容现有的全局函数名（逐步迁移用）
  // 新代码建议用 calcUtils.xxx()，旧函数名暂时保留

  if (typeof window !== 'undefined') {
    // 旧函数名保留（避免立即 break 现有代码）
    // window.sortRecords = calcUtils.sortRecords; 等组件迁移后再替换
    window.calcUtils = calcUtils;
  }

  console.log('[calc-utils] loaded');
})();
