// ====== 收益账本 - 数据服务层 ======
// 封装所有数据持久化操作：Supabase CRUD、同步队列、指数数据缓存
// 在 app-state.js 之后、index.html 之前加载

(function() {
  'use strict';

  // ===================================================================
  // 查询缓存
  // ===================================================================
  const _queryCache = {};

  window.cachedQuery = function(key, fn) {
    if (_queryCache[key] !== undefined) return Promise.resolve(_queryCache[key]);
    return fn().then(r => { _queryCache[key] = r; return r; });
  };

  window.clearCache = function() {
    for (const k in _queryCache) delete _queryCache[k];
  };

  // ===================================================================
  // 工具
  // ===================================================================
  let _tempIdCounter = Date.now();
  window.genTempId = function() { return '_temp_' + (++_tempIdCounter); };
  window.isTempId = function(id) { return typeof id === 'string' && id.startsWith('_temp_'); };

  // ===================================================================
  // 指数数据持久化
  // ===================================================================
  const INDEX_CACHE_KEY = 'hermes_index_cache_v1';

  window.loadIndexCache = function() {
    try { const d = localStorage.getItem(INDEX_CACHE_KEY); return d ? JSON.parse(d) : {}; } catch(e) { return {}; }
  };

  window.saveIndexCache = function(cache) {
    try { localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(cache)); } catch(e) {}
  };

  function _cacheLatestDate(map) {
    let latest = '';
    for (const d of Object.keys(map)) if (d > latest) latest = d;
    return latest;
  }

  function _formatDateOffset(days) {
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  window.fetchIndexData = async function(code) {
    const today = new Date();
    const cache = window.loadIndexCache();
    const cached = cache[code] || {};
    const latest = _cacheLatestDate(cached);
    // 如果有缓存且最近日期在昨天及以内，直接返回
    if (latest && latest >= _formatDateOffset(-1)) return cached;
    try {
      const apiBase = window.__API_BASE || '';
      const r = await fetch(apiBase + '/api/index-data?code=' + code, { cache: 'no-store' });
      if (!r.ok) return cached;
      const d = await r.json();
      const fresh = d.data || {};
      const merged = { ...cached };
      for (const k of Object.keys(fresh)) merged[k] = fresh[k];
      cache[code] = merged;
      window.saveIndexCache(cache);
      return merged;
    } catch(e) { return cached; }
  };

  // ===================================================================
  // 乐观写入同步队列
  // ===================================================================
  const SYNC_QUEUE_KEY = 'hermes_sync_queue_v1';

  function _getSyncQueue() {
    try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]'); } catch(e) { return []; }
  }

  function _saveSyncQueue(q) { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q)); }

  let _syncQueueTimer = null;

  function _updateSyncUI() {
    const q = _getSyncQueue();
    const pending = q.filter(o => o.status !== 'done').length;
    const failed = q.some(o => o.status === 'failed');
    window.__store.syncState.pendingCount = pending;
    window.__store.syncState.lastError = failed ? 'failed' : null;
  }

  function _genOpId() { return window.genTempId() + '_op'; }

  window.enqueueOp = function(type, payload) {
    const queue = _getSyncQueue();
    const op = {
      syncId: _genOpId(),
      type: type,        // 'create_record' | 'update_record' | 'delete_record' | 'create_account' | 'delete_account' | 'update_account'
      payload: payload,
      status: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
      lastError: null,
    };
    queue.push(op);
    _saveSyncQueue(queue);
    _updateSyncUI();
    // 立即尝试消费
    if (!_syncQueueTimer) _syncQueueTimer = setTimeout(consumeSyncQueue, 100);
    return op;
  };

  window.removeSyncOp = function(syncId) {
    const q = _getSyncQueue().filter(o => o.syncId !== syncId);
    _saveSyncQueue(q);
    _updateSyncUI();
  };

  /**
   * 弹出冲突确认框，让用户选择覆盖或保留。
   * 可被 hook 覆盖（测试或 UI 自定义）。
   */
  window._showSyncConflict = async function(recordId, op) {
    const msg = '检测到数据冲突：其他设备可能已修改了此记录。\n\n点击「确定」将重新拉取最新数据覆盖本地。';
    if (confirm(msg)) {
      op.status = 'done';
      _saveSyncQueue(_getSyncQueue());
      await loadData();
      window.toast('已同步服务器数据', 'success');
    } else {
      op.status = 'failed';
      _saveSyncQueue(_getSyncQueue());
      window.toast('已保留本地修改，稍后重试', 'warning');
    }
  };

  async function _executeSyncOp(op) {
    const p = op.payload;
    const client = window.__supabaseClient;
    const store = window.__store;

    if (op.type === 'create_record') {
      const { data, error } = await client.from('investment_records').insert(p.record).select('id,account_id,record_date,action_type,amount,note,investor_id,paired_id,updated_at').single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('插入返回空');
      data.amount = data.amount / 100;
      // 如果有配对记录，插入并关联
      if (p.pairedRecord) {
        const { data: d2, error: e2 } = await client.from('investment_records').insert({...p.pairedRecord, paired_id: data.id}).select('id,account_id,record_date,action_type,amount,note,investor_id,paired_id,updated_at').single();
        if (e2) throw new Error(e2.message);
        d2.amount = d2.amount / 100;
        await client.from('investment_records').update({paired_id: d2.id}).eq('id', data.id);
        data.paired_id = d2.id;
        // 替换本地配对记录（temp ID）
        if (p.pairedLocalAcct && store.allRecords[p.pairedLocalAcct]) {
          const pairIdx = store.allRecords[p.pairedLocalAcct].findIndex(r => window.isTempId(r.id));
          if (pairIdx >= 0) Object.assign(store.allRecords[p.pairedLocalAcct][pairIdx], d2);
        }
      }
      // 替换本地主记录（temp ID）
      if (p.localAcct && store.allRecords[p.localAcct]) {
        const idx = store.allRecords[p.localAcct].findIndex(r => window.isTempId(r.id));
        if (idx >= 0) Object.assign(store.allRecords[p.localAcct][idx], data);
      }
      return data;
    }

    if (op.type === 'update_record') {
      const { error, count } = await client.from('investment_records')
        .update(p.updates)
        .eq('id', p.recordId)
        .eq('updated_at', p.version);
      if (error) throw new Error(error.message);
      if (count === 0) throw new Error('CONFLICT:' + p.recordId);
      // 同步更新配对记录
      if (p.pairedId) {
        const e = await client.from('investment_records').update(p.pairedUpdates || p.updates).eq('id', p.pairedId);
        if (e.error) console.warn('配对记录同步失败:', e.error.message);
      }
    }

    if (op.type === 'delete_record') {
      if (p.pairedId) await client.from('investment_records').delete().eq('id', p.pairedId);
      const { error, count } = await client.from('investment_records')
        .delete()
        .eq('id', p.recordId);
      if (error) throw new Error(error.message);
      if (count === 0) throw new Error('CONFLICT:' + p.recordId);
    }

    if (op.type === 'create_account') {
      const { data, error } = await client.from('investment_accounts').insert(p.account).select().single();
      if (error) throw new Error(error.message);
      const localIdx = store.accounts.findIndex(a => window.isTempId(a.id));
      if (localIdx >= 0) Object.assign(store.accounts[localIdx], data);
    }

    if (op.type === 'delete_account') {
      await client.from('investment_records').delete().eq('account_id', p.accountId);
      const { error } = await client.from('investment_accounts').delete().eq('id', p.accountId);
      if (error) throw new Error(error.message);
    }

    if (op.type === 'update_account') {
      const { error } = await client.from('investment_accounts').update(p.updates).eq('id', p.accountId);
      if (error) throw new Error(error.message);
    }
  }

  window.consumeSyncQueue = async function() {
    _syncQueueTimer = null;
    let q = _getSyncQueue();
    // 清理已完成条目和无效条目
    let changed = false;
    q = q.filter(o => {
      if (o.status === 'done') { changed = true; return false; }
      if (o.type === 'delete_record' || o.type === 'update_record') {
        const rid = o.payload?.recordId;
        if (rid === null || rid === undefined || rid === 'NaN' || rid === '' || (typeof rid === 'number' && isNaN(rid))) {
          changed = true; return false;
        }
      }
      return true;
    });
    if (changed) _saveSyncQueue(q);

    const pending = q.filter(o => o.status === 'pending' || o.status === 'failed');
    if (pending.length === 0) { _updateSyncUI(); return; }

    // 逐条消费（串行保证顺序）
    for (const op of pending) {
      if (op.status === 'done') continue;
      op.status = 'syncing';
      _saveSyncQueue(q);
      _updateSyncUI();
      try {
        await _executeSyncOp(op);
        op.status = 'done';
        op.lastError = null;
        window.__store.syncState.lastSyncTime = Date.now();
        _saveSyncQueue(q);
        _updateSyncUI();
      } catch(e) {
        op.status = 'failed';
        op.retryCount++;
        op.lastError = e.message;
        _saveSyncQueue(q);
        _updateSyncUI();
        // 冲突 → 停止队列，等待用户处理
        if (e.message.startsWith('CONFLICT:')) {
          window._showSyncConflict(e.message.replace('CONFLICT:', ''), op);
          return;
        }
        // 指数退避重试
        const delay = Math.min(5000 * Math.pow(2, op.retryCount - 1), 60000);
        _syncQueueTimer = setTimeout(window.consumeSyncQueue, delay);
        return;
      }
    }
    // 全部完成，清理已完成的条目
    q.filter(o => o.status === 'done').forEach(o => window.removeSyncOp(o.syncId));
  };

  // 主动触发全量同步
  window.forceSync = function() {
    const q = _getSyncQueue();
    const pending = q.filter(o => o.status !== 'done');
    if (pending.length === 0) {
      loadData();
      window.toast('已刷新数据', 'success');
      return;
    }
    if (!_syncQueueTimer) window.consumeSyncQueue();
  };

  // ===================================================================
  // 联网状态与可见性监听
  // ===================================================================
  window.addEventListener('online', () => { _updateSyncUI(); window.consumeSyncQueue(); });
  window.addEventListener('offline', () => { window.__store.syncState.status = 'offline'; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) window.consumeSyncQueue(); });

  // ===================================================================
  // Auth 退出监听
  // ===================================================================
  const USER_CLEAR_KEYS = ['hermes_sync_queue_v1', 'privacy_mode'];
  (function() {
    const client = window.__supabaseClient;
    if (!client) return;
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        USER_CLEAR_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch(e) {} });
        const store = window.__store;
        store.currentUser = null;
        store.accounts = [];
        store.allRecords = {};
        store.settings = null;
        store.syncState = { status: 'synced', lastSyncTime: null, pendingCount: 0, lastError: null };
        window.clearCache();
      }
    });
  })();

  // ===================================================================
  // 成就持久化
  // ===================================================================
  window.saveAchievements = async function() {
    try {
      const store = window.__store;
      const client = window.__supabaseClient;
      if (!store.currentUser || !client) return;
      await client.from('user_settings').upsert({
        user_id: store.currentUser.id,
        achieved: store.achieved,
        last_return_sign: store.lastReturnSign,
        positive_return_count: store.positiveReturnCount,
      }, { onConflict: 'user_id' });
    } catch(e) {}
  };

  // ===================================================================
  // 家族基金 — 计算投资人权益
  // ===================================================================
  /**
   * 实时扫描所有有 investor_id 的记录，按当日 NAV（交易前）折算份额。
   * 不依赖申赎表，始终与流水表保持同步。
   * 返回: [{ id, name, shares, totalInvested, currentValue, return, returnPct }]
   */
  window.calcFundMembers = function() {
    const store = window.__store;
    const accounts = store.accounts || [];
    const allRecords = store.allRecords || {};
    const investors = store.investors || [];
    if (!investors.length) return [];

    // 收集所有投资人相关记录
    const recs = [];
    for (const aid of Object.keys(allRecords)) {
      for (const r of (allRecords[aid] || [])) {
        if (r.investor_id && (r.action_type === 'transfer_in' || r.action_type === 'transfer_out')) {
          recs.push(r);
        }
      }
    }
    if (!recs.length) return [];
    const invRecIds = new Set(recs.map(r => r.id));

    // 全量记录排序（与 buildSeries 一致）
    const allSorted = [];
    for (const aid of Object.keys(allRecords)) {
      for (const r of (allRecords[aid] || [])) allSorted.push(r);
    }
    allSorted.sort((a, b) => {
      const d = new Date(a.record_date) - new Date(b.record_date);
      if (d !== 0) return d;
      const order = { transfer_in: 0, transfer_out: 1, revalue: 2 };
      return (order[a.action_type] || 0) - (order[b.action_type] || 0);
    });

    // 增量扫描
    const acctState = {};
    for (const a of accounts) acctState[a.id] = { cost: 0, lastRevalue: null };
    const memberShares = {};   // { investorId: totalShares }
    const memberInvested = {}; // { investorId: totalCash }

    for (const r of allSorted) {
      const st = acctState[r.account_id];
      const acct = accounts.find(a => a.id === r.account_id);
      const isCash = acct ? acct.account_type === 'cash' : false;

      // 处理此条记录前的 NAV
      const beforeV = isCash ? st.cost : (st.lastRevalue != null ? st.lastRevalue : st.cost);
      const beforeC = st.cost;
      const beforeNav = beforeC > 0 ? beforeV / beforeC : 1.0;

      // 投资人记录：按交易前 NAV 折算份额
      if (invRecIds.has(r.id)) {
        const amt = Number(r.amount);
        if (r.action_type === 'transfer_in') {
          const shares = amt / beforeNav;
          memberShares[r.investor_id] = (memberShares[r.investor_id] || 0) + shares;
          memberInvested[r.investor_id] = (memberInvested[r.investor_id] || 0) + amt;
        } else if (r.action_type === 'transfer_out') {
          const shares = amt / beforeNav;
          memberShares[r.investor_id] = (memberShares[r.investor_id] || 0) - shares;
          memberInvested[r.investor_id] = (memberInvested[r.investor_id] || 0) - amt;
        }
      }

      // 更新组合状态
      if (r.action_type === 'transfer_in') {
        st.cost += Number(r.amount);
        if (st.lastRevalue != null) st.lastRevalue += Number(r.amount);
      } else if (r.action_type === 'transfer_out') {
        st.cost -= Number(r.amount);
        if (st.lastRevalue != null) st.lastRevalue -= Number(r.amount);
      } else if (r.action_type === 'revalue') {
        st.lastRevalue = Number(r.amount);
      }
    }

    // 当前组合总市值、成本、NAV
    let curV = 0, curC = 0;
    for (const a of accounts) {
      const st = acctState[a.id];
      const isCash = a.account_type === 'cash';
      curV += isCash ? st.cost : (st.lastRevalue != null ? st.lastRevalue : st.cost);
      curC += st.cost;
    }
    const curNav = curC > 0 ? curV / curC : 1.0;

    return investors.map(inv => {
      const shares = memberShares[inv.id] || 0;
      const invested = memberInvested[inv.id] || 0;
      const val = shares * curNav;
      const ret = val - invested;
      return {
        id: inv.id,
        name: inv.name,
        shares,
        totalInvested: invested,
        currentValue: val,
        return: ret,
        returnPct: invested > 0 ? (ret / invested) * 100 : 0,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  };

  console.log('[data-service] loaded');
})();
