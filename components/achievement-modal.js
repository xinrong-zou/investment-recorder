// ====== 收益账本 - 成就弹窗组件 ======

(function() {
  if (typeof Vue === 'undefined' || !window.__store) return;

  const AchievementModal = {
    template: `
      <div class="modal-overlay" :class="{open: visible}" @mousedown="if($event.target===$el) closeAchievement()">
        <div class="achievement-box" @click.stop>
          <div class="achievement-bg" ref="bg"></div>
          <div class="achievement-icon">{{ icon }}</div>
          <div class="achievement-name">{{ name }}</div>
          <div class="achievement-msg">{{ msg }}</div>
          <button class="achievement-close" :style="{display: showClose ? 'flex' : 'none'}" @click="closeAchievement">✕</button>
        </div>
      </div>
    `,
    data() {
      return {
        icon: '🏆',
        name: '',
        msg: '',
        showClose: false,
        closeTimer: null,
      };
    },
    computed: {
      visible() { return window.__store.showAchievementModal || false; },
    },
    watch: {
      visible(val) {
        if (val) {
          const a = window.__store.currentAchievement || {};
          this.icon = a.icon || '🏆';
          this.name = a.name || '';
          this.msg = a.msg || '';
          this.showClose = false;
          this.generateStars();
          // 1.5秒后显示关闭按钮
          this.closeTimer = setTimeout(() => { this.showClose = true; }, 1500);
          window.saveAchievements();
        } else {
          if (this.closeTimer) clearTimeout(this.closeTimer);
          this.closeTimer = null;
        }
      },
    },
    methods: {
      generateStars() {
        this.$nextTick(() => {
          const bg = this.$refs.bg;
          if (!bg) return;
          bg.innerHTML = '';
          for (let i = 0; i < 20; i++) {
            const s = document.createElement('div');
            s.className = 'star-particle';
            s.style.left = Math.random() * 90 + 5 + '%';
            s.style.top = Math.random() * 60 + 10 + '%';
            s.style.animationDelay = Math.random() * 0.8 + 's';
            const size = Math.random() * 4 + 2;
            s.style.width = s.style.height = size + 'px';
            bg.appendChild(s);
          }
        });
      },
      closeAchievement() {
        window.__store.showAchievementModal = false;
        // 队列中还有下一个？
        const achievementQueue = window.__store.achievementQueue || [];
        if (achievementQueue.length) {
          setTimeout(() => {
            window.flushAchievement();
          }, 400);
        } else {
          window.__store.achieving = false;
        }
      },
    },
    beforeUnmount() {
      if (this.closeTimer) clearTimeout(this.closeTimer);
    },
  };

  window.__achievementModalComponent = AchievementModal;
  console.log('[component] achievement-modal loaded');
})();
