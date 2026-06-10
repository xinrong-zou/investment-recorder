// ====== 收益账本 - 编辑/删除记录弹窗组件 ======

(function() {
  if (typeof Vue === 'undefined' || !window.__store) return;

  const EditModal = {
    template: `
        <div class="modal-overlay" :class="{open: visible}" @mousedown="onOverlayClick">
        <div class="modal-box" @click.stop>
          <h2>{{ title }}</h2>
          <div class="input-group"><label>操作类型</label><div style="font-size:0.9rem;font-weight:600;color:var(--text);">{{ actionLabel }}</div></div>
          <div class="input-group"><label>金额</label><input type="number" class="input" v-model.number="editAmount" step="0.01" min="0"></div>
          <div class="input-group"><label>日期</label><input type="date" class="input" v-model="editDate"></div>
          <div class="input-group"><label>备注</label><input type="text" class="input" v-model="editNote" placeholder="选填" maxlength="50"></div>
          <div class="input-group" v-if="showInvestorEdit"><label>投资人</label>
            <select class="input" v-model="editInvestorId">
              <option value="">管理人名下</option>
              <option v-for="inv in investors" :key="inv.id" :value="inv.id">{{ inv.name }}</option>
            </select>
          </div>
          <div class="form-actions">
            <button class="btn btn-ghost" @click="close">取消</button>
            <button class="btn btn-danger" @click="remove">🗑 删除</button>
            <button class="btn btn-primary" @click="save">💾 保存</button>
          </div>
        </div>
      </div>
    `,
    data() {
      return {
        editAmount: null,
        editDate: '',
        editNote: '',
        editingRecordId: null,
        editingPairedId: null,
        editingAccountId: null,
        editingActionType: null,
        editingOriginalDate: null,
        editInvestorId: '',
      };
    },
    computed: {
      visible() { return window.__store.showEditModal || false; },
      store() { return window.__store; },
      editId() { return this.store.editRecordId; },
      allAccounts() { return this.store.accounts || []; },
      allRecords() { return this.store.allRecords || {}; },
      title() {
        const acct = this.allAccounts.find(a => a.id === this.editingAccountId);
        return (acct ? acct.name : '') + ' — 编辑记录';
      },
      actionLabel() {
        return { transfer_in: '转入', transfer_out: '转出', revalue: '更新市值' }[this.editingActionType] || '';
      },
      investors() { return this.store.investors || []; },
      showInvestorEdit() {
        return window.__store.fundMode
          && (this.editingActionType === 'transfer_in' || this.editingActionType === 'transfer_out')
          && this.investors.length > 0;
      },
    },
    watch: {
      editId(val) {
        if (!val) return;
        // Load record data from store
        const parts = val.split('|');
        const id = parts[0];
        const accountId = parts[1];
        const actionType = parts[2];
        const amount = parseFloat(parts[3]);
        const date = parts[4];
        const note = parts[5] || '';
        const invId = parts[6] || '';
        
        this.editingRecordId = id;
        this.editingAccountId = accountId;
        this.editingActionType = actionType;
        this.editingOriginalDate = date;
        this.editAmount = amount;
        this.editDate = date;
        this.editNote = note === '' ? '' : note;
        this.editInvestorId = invId || '';
        
        // Find paired_id
        this.editingPairedId = null;
        for (const aid of Object.keys(this.allRecords)) {
          for (const r of (this.allRecords[aid] || [])) {
            if (r.id === id && r.paired_id) { this.editingPairedId = r.paired_id; break; }
          }
        }
      },
    },
    methods: {
      onOverlayClick(e) { if (e.target === e.currentTarget) this.close(); },
      close() { window.__store.showEditModal = false; },
      async save() {
        const amt = this.editAmount;
        const actionType = this.editingActionType;
        let amtCents = Math.round(amt * 100);
        if (actionType === 'revalue') {
          if (isNaN(amt) || amt < 0) { toast('请输入有效市值', 'error'); return; }
        } else {
          if (!amt || amt <= 0) { toast('请输入有效金额', 'error'); return; }
        }
        const newDate = this.editDate || this.editingOriginalDate;

        // Plan check
        const ePlan = await window.getUserPlan();
        if (ePlan !== 'pro') {
          if (window.isFrozenAccount(this.editingAccountId)) { toast('该账户已超出免费额度，无法修改', 'error'); return; }
          if (this.editingPairedId) {
            try {
              // Find the paired record's account from local data
              for (const aid of Object.keys(this.allRecords)) {
                for (const r of (this.allRecords[aid] || [])) {
                  if (r.id === this.editingPairedId) {
                    if (window.isFrozenAccount(aid)) { toast('关联账户已超出免费额度', 'error'); return; }
                    break;
                  }
                }
              }
            } catch (e) {}
          }
        }

        // Balance validation
        const allTestRecords = {};
        for (const aid of Object.keys(this.allRecords)) {
          allTestRecords[aid] = (this.allRecords[aid] || []).filter(r => r.id !== this.editingRecordId && r.id !== this.editingPairedId);
        }
        if (!allTestRecords[this.editingAccountId]) allTestRecords[this.editingAccountId] = [];
        allTestRecords[this.editingAccountId].push({ action_type: actionType, amount: amt, record_date: newDate });
        if (this.editingPairedId) {
          for (const aid of Object.keys(this.allRecords)) {
            for (const r of (this.allRecords[aid] || [])) {
              if (r.id === this.editingPairedId) {
                const pairAction = r.action_type === 'transfer_out' ? 'transfer_in' : 'transfer_out';
                if (!allTestRecords[aid]) allTestRecords[aid] = [];
                allTestRecords[aid].push({ action_type: pairAction, amount: amt, record_date: newDate });
                break;
              }
            }
          }
        }
        for (const aid of Object.keys(allTestRecords)) {
          const acct = this.allAccounts.find(a => a.id === aid);
          if (acct && acct.account_type === 'cash' && window.calcAccount(acct, allTestRecords[aid]).currentValue < 0) {
            toast('警告：修改后现金账户「' + acct.name + '」余额将为负数，已保存但建议检查', 'warning');
          }
        }

        const upd = { amount: amt, record_date: newDate, note: (this.editNote || '').trim() };
        if (this.editingActionType !== 'revalue') upd.investor_id = this.editInvestorId || null;
        
        // Get version
        let version = null;
        for (const aid of Object.keys(this.allRecords)) {
          for (const r of (this.allRecords[aid] || [])) {
            if (r.id === this.editingRecordId) { version = r.updated_at; break; }
          }
        }

        // Optimistic local update
        const updateRec = (rid, vals) => {
          for (const a of Object.keys(this.allRecords)) {
            for (let i = 0; i < (this.allRecords[a] || []).length; i++) {
              if (this.allRecords[a][i].id === rid) {
                Object.assign(this.allRecords[a][i], vals);
                if (vals.amount !== undefined) this.allRecords[a][i].amount = vals.amount;
                return;
              }
            }
          }
        };
        updateRec(this.editingRecordId, upd);
        if (this.editingPairedId) updateRec(this.editingPairedId, { amount: amt, record_date: newDate });

        // Enqueue sync
        window.enqueueOp('update_record', {
          recordId: this.editingRecordId,
          updates: { amount: amtCents, record_date: newDate, note: upd.note, investor_id: upd.investor_id || null },
          version: version,
          pairedId: this.editingPairedId,
          pairedUpdates: this.editingPairedId ? { amount: amtCents, record_date: newDate } : null,
        });

        this.close();
        window.render();
        toast('已修改（同步中）', 'success');
      },
      async remove() {
        if (!confirm('确定删除此记录？')) return;

        // Get version
        let version = null;
        for (const aid of Object.keys(this.allRecords)) {
          for (const r of (this.allRecords[aid] || [])) {
            if (r.id === this.editingRecordId) { version = r.updated_at; break; }
          }
        }

        // Optimistic local delete
        const removeRec = (rid) => {
          for (const aid of Object.keys(this.allRecords)) {
            if (this.allRecords[aid]) this.allRecords[aid] = this.allRecords[aid].filter(r => r.id !== rid);
          }
        };
        removeRec(this.editingRecordId);
        if (this.editingPairedId) removeRec(this.editingPairedId);

        // Enqueue sync
        window.enqueueOp('delete_record', { recordId: this.editingRecordId, pairedId: this.editingPairedId, version });

        this.close();
        window.render();
        toast('已删除（同步中）', 'success');
      },
    },
  };

  window.__editModalComponent = EditModal;
  console.log('[component] edit-modal loaded');
})();
