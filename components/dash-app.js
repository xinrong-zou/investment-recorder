// ====== 收益账本 - 根 Vue 应用 ======
// 所有 dashboard 组件共享同一个 Vue 应用实例

(function() {
  if (typeof Vue === 'undefined' || !window.__store) return;

  // 创建根应用，注册所有组件
  const app = Vue.createApp({});
  
  // 注册已加载的组件
  if (window.__syncStatusComponent) app.component('sync-status', window.__syncStatusComponent);
  if (window.__summaryCardComponent) app.component('summary-card', window.__summaryCardComponent);
  if (window.__encourageTextComponent) app.component('encourage-text', window.__encourageTextComponent);
  if (window.__accountGridComponent) app.component('account-grid', window.__accountGridComponent);
  if (window.__recordModalComponent) app.component('record-modal', window.__recordModalComponent);
  if (window.__editModalComponent) app.component('edit-modal', window.__editModalComponent);
  if (window.__achievementModalComponent) app.component('achievement-modal', window.__achievementModalComponent);
  if (window.__accountDrawerComponent) app.component('account-drawer', window.__accountDrawerComponent);
  if (window.__totalChartComponent) app.component('total-chart', window.__totalChartComponent);
  if (window.__lineChartComponent) app.component('line-chart', window.__lineChartComponent);
  
  // 挂载到 #app 容器
  app.mount('#app');
  console.log('[dash-app] mounted with all components');
})();
