// ====== 收益账本 - 成就系统 ======
// 成就定义、检测、弹窗队列
// 在 data-service.js 之后、index.html 之前加载

(function() {
  'use strict';

  // ===================================================================
  // 成就定义
  // ===================================================================
  const ACHIEVEMENTS = [
    // 按弹窗优先级排列（最优先的排前面）
    {key:'record_1',    name:'千里之行', msg:'记账的第一笔，通往自由的第一步',                                  icon:'🏆', check:(v,t,r,a)=>r>=1},
    {key:'account_3',   name:'三足鼎立', msg:'三个账户，三分天下，从容布局',                                      icon:'🏛️', check:(v,t,r,a)=>a>=3},
    {key:'asset_10k',   name:'一勺之始', msg:'「万」事开头难，你已跨出第一步',                                     icon:'💰', check:(v,t,r,a)=>v>=10000},
    {key:'asset_100k',  name:'六位征途', msg:'六位数，是底气也是新的起点',                                        icon:'💰', check:(v,t,r,a)=>v>=100000},
    {key:'asset_500k',  name:'半壁江山', msg:'半百之数，已胜过九成路人',                                          icon:'💰', check:(v,t,r,a)=>v>=500000},
    {key:'profit_1k',   name:'小试牛刀', msg:'赚到第一笔四位数利润，未来可期',                                     icon:'🎯', check:(v,t,r,a)=>t>=1000},
    {key:'asset_1m',    name:'七位人生', msg:'百万不是终点，是自由的门票',                                        icon:'💰', check:(v,t,r,a)=>v>=1000000},
    {key:'profit_10k',  name:'颇有斩获', msg:'万元利润，已超越多数散户',                                           icon:'🎯', check:(v,t,r,a)=>t>=10000},
    {key:'asset_5m',    name:'积土成山', msg:'五百万，时间的朋友你当定了',                                        icon:'💰', check:(v,t,r,a)=>v>=5000000},
    {key:'profit_100k', name:'盆满钵满', msg:'六位数盈利，这是实力的证明',                                        icon:'🎯', check:(v,t,r,a)=>t>=100000},
    {key:'asset_10m',   name:'八荒之外', msg:'千万级玩家，请收下我的膝盖',                                        icon:'💰', check:(v,t,r,a)=>v>=10000000},
    {key:'profit_1m',   name:'富甲一方', msg:'百万利润，你已经财务自由',                                           icon:'🎯', check:(v,t,r,a)=>t>=1000000},
    {key:'profit_10m',  name:'点石成金', msg:'千万盈利——点石成金，莫过于此',                                       icon:'🎯', check:(v,t,r,a)=>t>=10000000},
    {key:'record_100',  name:'百炼成钢', msg:'100 笔记录，你已是资深投资者',                                      icon:'🏆', check:(v,t,r,a)=>r>=100},
    {key:'export_1',    name:'有备无患', msg:'导出备份，数据多一份安心',                                          icon:'💾', check:()=>false},
    {key:'share_1',     name:'立此存照', msg:'截图留念，为努力的自己存一份见证',                                   icon:'📸', check:()=>false},
    {key:'hide_1',      name:'藏之名山', msg:'藏之名山，传之其人——把秘密留给时间',                                 icon:'🗃️', check:()=>false},
    {key:'fund_open',   name:'开基立业', msg:'基业初成，家族基金从今天起航',                                        icon:'🏛️', check:()=>false},
    {key:'inviter_1',   name:'二人同心', msg:'一个篱笆三个桩，一个好汉三个帮',                                        icon:'🤝', check:()=>false},
    {key:'inviter_3',   name:'群策群力', msg:'三人同心，其利断金',                                                    icon:'👥', check:()=>false},
    {key:'inviter_5',   name:'八方来财', msg:'五方汇聚，财源广进',                                                    icon:'🌟', check:()=>false},
  ];

  let _achievementQueue = [];
  let _achieving = false;

  // ===================================================================
  // 检测成就
  // ===================================================================
  window.checkAchievements = function(totalVal, totalRet) {
    const store = window.__store;
    if (!store.currentUser) return;
    const today = new Date().toISOString().substring(0, 10);
    // 计算总记录数
    let totalRecs = 0;
    for (const aid of Object.keys(store.allRecords)) totalRecs += (store.allRecords[aid] || []).length;
    const acctCount = store.accounts.length;

    for (const a of ACHIEVEMENTS) {
      if (!store.achieved[a.key] && a.check(totalVal, totalRet, totalRecs, acctCount)) {
        store.achieved[a.key] = today;
        _achievementQueue.push(a);
      }
    }

    // 翻红检测
    if (store.lastReturnSign === 'negative' && totalRet > 0) {
      store.positiveReturnCount++;
      store.lastReturnSign = 'positive';
      _achievementQueue.push({
        key: 'positive_return', name: '拨云见日',
        msg: '第' + store.positiveReturnCount + '次翻红——守得云开见月明', icon: '🌅'
      });
    } else {
      store.lastReturnSign = totalRet > 0 ? 'positive' : 'negative';
    }

    // 赞助支持检测（异步）
    if (!store.achieved['sponsor_1']) {
      window.cachedQuery('plan_' + store.currentUser.id, () =>
        window.__supabaseClient.from('subscriptions').select('plan').eq('user_id', store.currentUser.id).maybeSingle()
      ).then(d => {
        if (d && d.data && d.data.plan === 'pro' && !store.achieved['sponsor_1']) {
          store.achieved['sponsor_1'] = today;
          _achievementQueue.push({ key: 'sponsor_1', name: '雪中送炭', msg: '感恩你的支持，让这个工具变得更好', icon: '❤️' });
          window.saveAchievements();
          if (!_achieving) _flushAchievement();
        }
      }).catch(() => {});
    }

    if (_achievementQueue.length && !_achieving) _flushAchievement();
  };

  function _flushAchievement() {
    if (!_achievementQueue.length) { _achieving = false; return; }
    _achieving = true;
    _displayAchievement(_achievementQueue.shift());
  }

  function _displayAchievement(a) {
    window.__store.currentAchievement = { icon: a.icon || '🏆', name: a.name, msg: a.msg };
    window.__store.showAchievementModal = true;
  }

  // ===================================================================
  // 公开方法
  // ===================================================================
  window.closeAchievement = function() {
    window.__store.showAchievementModal = false;
    if (_achievementQueue.length) {
      setTimeout(_flushAchievement, 400);
    } else {
      _achieving = false;
    }
  };

  window.shareAchievement = function() {
    const store = window.__store;
    if (store.achieved['share_1']) return;
    store.achieved['share_1'] = new Date().toISOString().substring(0, 10);
    window.saveAchievements();
    if (_achieving) {
      _achievementQueue.push({ key: 'share_1', name: '立此存照', msg: '截图留念，为努力的自己存一份见证', icon: '📸' });
    } else {
      _achieving = true;
      _displayAchievement({ key: 'share_1', name: '立此存照', msg: '截图留念，为努力的自己存一份见证', icon: '📸' });
    }
  };

  window.hideAchievement = function() {
    const store = window.__store;
    if (store.achieved['hide_1']) return;
    store.achieved['hide_1'] = new Date().toISOString().substring(0, 10);
    window.saveAchievements();
    if (_achieving) {
      _achievementQueue.push({ key: 'hide_1', name: '藏之名山', msg: '藏之名山，传之其人——把秘密留给时间', icon: '🗃️' });
    } else {
      _achieving = true;
      _displayAchievement({ key: 'hide_1', name: '藏之名山', msg: '藏之名山，传之其人——把秘密留给时间', icon: '🗃️' });
    }
  };

  // 通用成就触发（用于 export_1 等非自动检测的成就）
  window.triggerAchievement = function(key, name, msg, icon) {
    const store = window.__store;
    if (store.achieved[key]) return;
    store.achieved[key] = new Date().toISOString().substring(0, 10);
    window.saveAchievements();
    if (_achieving) {
      _achievementQueue.push({ key, name, msg, icon: icon || '🏆' });
    } else {
      _achieving = true;
      _displayAchievement({ key, name, msg, icon: icon || '🏆' });
    }
  };

  console.log('[achievement-system] loaded');
})();
