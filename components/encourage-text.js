// ====== 收益账本 - 鼓励语组件 ======

(function() {
  if (typeof Vue === 'undefined') return;

  const QUOTES = [
    '💰 投资是一场马拉松，不是百米冲刺。坚持定投，时间会给你答案。',
    '📈 市场有起有落，长期持有优质资产是最好的策略。',
    '🌱 今天存下的每一分钱，都是未来自由的种子。',
    '🧠 最好的投资是投资自己——学习、健康、眼界。',
    '⏰ 复利是世界第八大奇迹。早点开始，耐心等待。',
    '🎯 不要试图择时，待在市场里的时间比 timing 更重要。',
    '📊 投资纪律比投资技巧更重要——定投、分散、长期。',
    '💡 牛市赚钱，熊市赚股。下跌时买的每一份都是未来的利润。',
    '🌊 市场短期是投票机，长期是称重机。——本杰明·格雷厄姆',
    '🏔️ 别人贪婪时恐惧，别人恐惧时贪婪。——沃伦·巴菲特',
  ];

  const EncourageText = {
    template: `<div class="encourage-text">{{ text }}</div>`,
    data() {
      return { text: QUOTES[Math.floor(Math.random() * QUOTES.length)] };
    },
  };

  window.__encourageTextComponent = EncourageText;

  window.mountEncourageText = function(selector) {
    const container = document.querySelector(selector);
    if (!container) return;
    const app = Vue.createApp({});
    app.component('encourage-text', EncourageText);
    app.mount(selector);
  };

  console.log('[component] encourage-text loaded');
})();
