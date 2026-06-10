// ====== 收益账本 - 通用页脚组件 ======
// 用法: 在HTML中引入，执行 mountAppFooter('#footer-app')
// 显示导航按钮 + GitHub 开源链接
(function() {
  if (typeof Vue === 'undefined') return;

  const AppFooter = {
    template: `
      <footer style="border-top:1px solid var(--border);padding:20px;margin-top:24px;">
        <div style="max-width:600px;margin:0 auto;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:12px;">
          <a href="/" class="btn btn-ghost btn-sm">🏠 首页</a>
          <a href="/about.html" class="btn btn-ghost btn-sm">📖 关于</a>
          <a href="/feedback.html" class="btn btn-ghost btn-sm">💬 反馈</a>
          <a href="https://github.com/xinrong-zou/investment-recorder" target="_blank" class="btn btn-ghost btn-sm" rel="noopener">📦 开源</a>
        </div>
        <div style="text-align:center;font-size:0.72rem;color:var(--text-muted);">
          <a href="https://github.com/xinrong-zou/investment-recorder" target="_blank" rel="noopener" style="color:var(--text-muted);text-decoration:none;">收益账本 · 开源 · MIT License</a>
        </div>
      </footer>
    `,
  };

  window.__appFooterComponent = AppFooter;

  window.mountAppFooter = function(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    const app = Vue.createApp({});
    app.component('app-footer', AppFooter);
    app.mount(el);
  };

  console.log('[component] app-footer loaded');
})();
