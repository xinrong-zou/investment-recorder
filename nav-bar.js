// 理财收益记录器 - 导航栏 Vue3 组件 (头像+下拉菜单)
// 用法: 在HTML中引入后，执行 mountNavBar('#nav-app')
(function() {
  const SUPABASE_URL = 'https://spb-cl9n18iof0i9qxjh.supabase.opentrust.net';
  const SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsInJlZiI6InNwYi1jbDluMThpb2YwaTlxeGpoIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODA2NjgzNzQsImV4cCI6MjA5NjI0NDM3NH0.t8MDF4zdvV9kpUz-gZpVM-OgFlAow8FlENASpqkUkwk';
  const ADMIN_EMAILS = []; // Worker验证
  const ADMIN_CHECK_CACHE = {}; // 缓存管理员状态

  if (typeof Vue === 'undefined') return;

  // 共享Supabase客户端（避免多页面多个实例的警告）
  if (!window.__supabaseClient) {
    try {
      window.__supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch(e) {}
  }

  const NavBar = {
    props: {
      title: { type: String, default: '收益记录器' },
      logoUrl: { type: String, default: '/' },
      loginUrl: { type: String, default: 'login.html' },
      registerUrl: { type: String, default: 'register.html' },
      dashboardUrl: { type: String, default: '/' },
      adminUrl: { type: String, default: 'admin.html' },
    },
    data() {
      return {
        user: null,
        showMenu: false,
        plan: 'free',
        expiresAt: null,
        client: window.__supabaseClient,
        initializing: true,
        _isAdmin: false,
      };
    },
    computed: {
      avatarLetter() {
        if (!this.user?.email) return '?';
        return this.user.email.charAt(0).toUpperCase();
      },
      isPro() { return this.plan === 'pro'; },
      isAdmin() { return this._isAdmin; },
      proExpires() {
        if (!this.expiresAt) return '';
        const d = new Date(this.expiresAt);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      },
    },
    async mounted() {
      document.addEventListener('click', this.closeMenu);
      await this.initAuth();
    },
    beforeUnmount() {
      document.removeEventListener('click', this.closeMenu);
    },
    methods: {
      closeMenu() { this.showMenu = false; },
      toggleMenu(e) {
        if (e) e.stopPropagation();
        this.showMenu = !this.showMenu;
      },
      async initAuth() {
        if (!this.client) return;
        try {
          const { data: { session } } = await this.client.auth.getSession();
          if (session?.user) {
            this.user = session.user;
            this.initializing = false; // 立即显示头像，不等plan加载
            this.fetchPlan();           // plan异步加载，到了再更新徽章
            this.checkAdmin();          // 异步验证管理员
          } else {
            this.initializing = false;
          }
          // 监听登录状态变化
          this.client.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
              this.user = session.user;
              this.fetchPlan();
            } else {
              this.user = null;
              this.plan = 'free';
              this.expiresAt = null;
            }
          });
        } catch(e) { this.initializing = false; console.log('nav auth err:', e.message); }
      },
      async fetchPlan() {
        if (!this.client || !this.user) return;
        try {
          const { data } = await this.client
            .from('subscriptions')
            .select('plan,expires_at')
            .eq('user_id', this.user.id)
            .maybeSingle();
          if (data) {
            this.plan = data.plan || 'free';
            this.expiresAt = data.expires_at || null;
          }
        } catch(e) {}
      },
      async checkAdmin() {
        if (!this.client || !this.user) return;
        try {
          const { data: { session } } = await this.client.auth.getSession();
          if (!session) return;
          const req = await fetch('/api/admin/users', {
            headers: { 'Authorization': 'Bearer ' + session.access_token }
          });
          this._isAdmin = req.ok;
        } catch(e) { this._isAdmin = false; }
      },
      async logout() {
        this.showMenu = false;
        if (this.client) await this.client.auth.signOut();
        window.location.href = '/';
      },
    },
    template: `
      <nav class="navbar">
        <div class="container">
          <a :href="logoUrl" class="navbar-brand">
            <span class="logo-icon">🕊</span>
            <span>{{ title }}</span>
          </a>
          <div class="navbar-right">
            <div v-if="initializing" class="nav-skeleton"></div>
            <template v-else-if="!user">
              <a :href="loginUrl" class="btn btn-ghost">登录</a>
              <a :href="registerUrl" class="btn btn-primary btn-sm">免费注册</a>
            </template>
            <div v-else class="avatar-dropdown" @click="toggleMenu">
              <button class="avatar-btn" :class="{ 'avatar-pro': isPro }">
                <span class="avatar-letter">{{ avatarLetter }}</span>
                <span v-if="isPro" class="avatar-pro-star">⭐</span>
              </button>
              <transition name="dropdown-fade">
                <div v-if="showMenu" class="dropdown-menu" @click.stop>
                  <div class="dropdown-header">
                    <div class="dropdown-avatar">{{ avatarLetter }}</div>
                    <div class="dropdown-info">
                      <div class="dropdown-email">{{ user.email }}</div>
                      <div class="dropdown-plan-row">
                        <span :class="'plan-badge ' + (isPro ? 'plan-pro' : 'plan-free')">
                          {{ isPro ? '赞助用户' : '访客' }}
                        </span>
                        <span v-if="isPro && expiresAt" class="dropdown-expires">
                          到期 {{ proExpires }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="dropdown-divider"></div>
                  <a href="/about.html" class="dropdown-item">
                    <span class="dropdown-icon">📖</span> 关于
                  </a>
                  <a v-if="isAdmin" :href="adminUrl" class="dropdown-item">
                    <span class="dropdown-icon">⭐</span> 后台管理
                  </a>
                  <div class="dropdown-divider"></div>
                  <button @click="logout" class="dropdown-item dropdown-item-danger">
                    <span class="dropdown-icon">🚪</span> 退出登录
                  </button>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </nav>
    `,
  };

  // 注册全局组件 + 暴露挂载函数
  window.NavBarComponent = NavBar;
  window.mountNavBar = function(selector) {
    const app = Vue.createApp({});
    app.component('nav-bar', NavBar);
    app.mount(selector);
    return app;
  };
})();
