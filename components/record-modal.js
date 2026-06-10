// ====== 收益账本 - 新增记录弹窗组件 ======

(function() {
  if (typeof Vue === 'undefined' || !window.__store) return;

  const RecordModal = {
    template: `
      <div class="modal-overlay" :class="{open: visible}" @mousedown="onOverlayClick">
        <div class="modal-box" @click.stop>
          <h2>{{ title }}</h2>
          <p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:12px;">{{ accountName }}</p>
          
          <div class="input-group"><label>操作类型</label>
            <select class="input" v-model="recordType" @change="onTypeChange">
              <option value="transfer_in">转入</option>
              <option value="transfer_out">转出</option>
              <option value="revalue">更新市值</option>
            </select>
          </div>
          
          <div class="input-group" v-if="recordType==='transfer_in'">
            <label>来源账户</label>
            <select class="input" v-model="srcId">
              <option value="">外部资金（从外部转入）</option>
              <option v-for="a in otherAccounts" :key="a.id" :value="a.id">{{ a.name }}{{ a.account_type==='cash'?' (现金)':' (投资)' }}</option>
            </select>
          </div>
          
          <div class="input-group" v-if="showInvestor">
            <label>投资人（选填）</label>
            <select class="input" v-model="investorId">
              <option value="">管理人名下</option>
              <option v-for="inv in investors" :key="inv.id" :value="inv.id">{{ inv.name }}</option>
            </select>
          </div>
          
          <div class="input-group" v-if="recordType==='transfer_out'">
            <label>转出至</label>
            <select class="input" v-model="destId">
              <option value="">消费支出（不转入任何账户）</option>
              <option v-for="a in otherAccounts" :key="a.id" :value="a.id">{{ a.name }}{{ a.account_type==='cash'?' (现金)':' (投资)' }}</option>
            </select>
          </div>
          
          <div class="input-group"><label>金额</label>
            <input type="number" class="input" v-model.number="amount" placeholder="0.00" step="0.01" min="0">
          </div>
          <div class="input-group"><label>日期</label>
            <input type="date" class="input" v-model="recordDate">
          </div>
          <div class="input-group"><label>备注</label>
            <input type="text" class="input" v-model="note" placeholder="选填" maxlength="50">
          </div>
          
          <div v-if="recordType==='revalue'" style="margin-top:8px;padding:8px 12px;background:#f0fdf4;border-radius:8px;font-size:0.76rem;color:#059669;line-height:1.5;">
            💡 更新市值代表当天<strong>最终</strong>市值。如有同一天的转入/转出，请<strong>先录入转入转出</strong>，最后再录入更新市值。
          </div>
          <div v-if="hasRevalueToday" style="margin-top:6px;padding:8px 12px;background:#fef3c7;border-radius:8px;font-size:0.76rem;color:#d97706;line-height:1.5;">
            <template v-if="recordType==='revalue'">⚠️ 当天已有一条更新市值记录，继续录入将覆盖前面的值。如需修改建议编辑已有记录。</template>
            <template v-else>💡 当天已有一条更新市值记录。新增的转入/转出会更新成本，当天的最终市值仍以最后一条更新市值记录为准。</template>
          </div>
          
          <div class="form-actions">
            <button class="btn btn-ghost" @click="close">取消</button>
            <button class="btn btn-primary" @click="save">保存</button>
          </div>
        </div>
      </div>
    `,
    data() {
      return {
        recordType: 'transfer_in',
        amount: null,
        recordDate: '',
        note: '',
        srcId: '',
        destId: '',
        investorId: '',
      };
    },
    computed: {
      visible() { return window.__store.showRecordModal || false; },
      targetId() { return window.__store.recordTargetId; },
      targetType() { return window.__store.recordTargetType || 'transfer_in'; },
      store() { return window.__store; },
      allAccounts() { return this.store.accounts || []; },
      investors() { return this.store.investors || []; },
      showInvestor() {
        // 仅在基金模式+外部资金时显示投资人选择
        if (!window.__store.fundMode) return false;
        if (this.recordType === 'transfer_in' && !this.srcId) return true;
        if (this.recordType === 'transfer_out' && !this.destId) return true;
        return false;
      },
      title() {
        const acct = this.allAccounts.find(a => a.id === this.targetId);
        return (acct ? acct.name : '') + ' — 录入操作';
      },
      accountName() {
        const acct = this.allAccounts.find(a => a.id === this.targetId);
        return acct ? (acct.account_type === 'cash' ? '现金账户' : '投资账户') : '';
      },
      otherAccounts() {
        return this.allAccounts.filter(a => a.id !== this.targetId);
      },
      hasRevalueToday() {
        const recs = this.store.allRecords[this.targetId] || [];
        return recs.some(r => r.record_date === this.recordDate && r.action_type === 'revalue');
      },
    },
    watch: {
      targetType(val) { this.recordType = val || 'transfer_in'; },
      visible(val) { if (val) { this.$nextTick(() => {
        this.recordType = this.targetType || 'transfer_in';
        this.amount = null;
        this.recordDate = new Date().toISOString().substring(0,10);
        this.note = '';
        this.investorId = '';
        // 默认选中现金账户
        const cash = this.allAccounts.find(a => a.account_type === 'cash' && a.id !== this.targetId);
        this.srcId = cash ? cash.id : '';
        this.destId = cash ? cash.id : '';
      }); } },
    },
    methods: {
      onOverlayClick(e) { if (e.target === e.currentTarget) this.close(); },
      close() { window.__store.showRecordModal = false; },
      async save() {
        // Validate
        const amtYuan = this.amount;
        const type = this.recordType;
        if (type === 'revalue') {
          if (isNaN(amtYuan) || amtYuan < 0) { toast('请输入有效市值','error'); return; }
        } else {
          if (!amtYuan || amtYuan <= 0) { toast('请输入有效金额','error'); return; }
        }
        const date = this.recordDate || new Date().toISOString().substring(0,10);
        const note = this.note.trim() || '';
        const acctId = this.targetId;
        if (!acctId) { toast('系统错误：缺少账户信息','error'); return; }

        // Plan check
        const plan = await window.getUserPlan();
        if (plan !== 'pro') {
          if (window.isFrozenAccount(acctId)) { toast('该账户已超出免费额度，操作被冻结','error'); return; }
          if (this.srcId && window.isFrozenAccount(this.srcId)) { toast('来源账户已超出免费额度','error'); return; }
          if (this.destId && window.isFrozenAccount(this.destId)) { toast('目标账户已超出免费额度','error'); return; }
        }

        // Build records and enqueue
        const amount = Math.round(amtYuan * 100);
        if (type === 'transfer_in') {
          if (this.srcId) {
            const srcCalc = window.calcAccount(
              this.allAccounts.find(a => a.id === this.srcId),
              (this.store.allRecords[this.srcId] || []).filter(r => r.record_date <= date)
            );
            if (srcCalc.currentValue < amtYuan) toast('警告：来源账户在 '+date+' 余额不足（'+window.calcUtils.fmt(srcCalc.currentValue)+'），已保存但建议检查','warning');
            const r1Id = genTempId(), r2Id = genTempId();
            const r1 = {id:r1Id,account_id:this.srcId,action_type:'transfer_out',amount:amtYuan,record_date:date,note:note||'转至 '+(this.allAccounts.find(a=>a.id===acctId)?.name||'其他账户'),paired_id:null};
            const r2 = {id:r2Id,account_id:acctId,action_type:'transfer_in',amount:amtYuan,record_date:date,note:note||'来自 '+(this.allAccounts.find(a=>a.id===this.srcId)?.name||'其他账户'),paired_id:null};
            if (!this.store.allRecords[this.srcId]) this.store.allRecords[this.srcId] = [];
            if (!this.store.allRecords[acctId]) this.store.allRecords[acctId] = [];
            this.store.allRecords[this.srcId].push(r1);
            this.store.allRecords[acctId].push(r2);
            enqueueOp('create_record',{
              record:{account_id:this.srcId,action_type:'transfer_out',amount,record_date:date,note:r1.note},
              pairedRecord:{account_id:acctId,action_type:'transfer_in',amount,record_date:date,note:r2.note},
              localAcct:this.srcId, pairedLocalAcct:acctId,
            });
          } else {
            const rId = genTempId();
            const r = {id:rId,account_id:acctId,action_type:'transfer_in',amount:amtYuan,record_date:date,note:note||'外部转入',investor_id: this.investorId || null, paired_id:null};
            if (!this.store.allRecords[acctId]) this.store.allRecords[acctId] = [];
            this.store.allRecords[acctId].push(r);
            enqueueOp('create_record',{record:{account_id:acctId,action_type:'transfer_in',amount,record_date:date,note:r.note,investor_id: this.investorId || null},localAcct:acctId});
          }
        } else if (type === 'transfer_out') {
          const outCalc = window.calcAccount(
            this.allAccounts.find(a => a.id === acctId),
            (this.store.allRecords[acctId] || []).filter(r => r.record_date <= date)
          );
          if (outCalc.currentValue < amtYuan) toast('警告：账户在 '+date+' 余额不足（'+window.calcUtils.fmt(outCalc.currentValue)+'），已保存但建议检查','warning');
          if (this.destId) {
            const r1Id = genTempId(), r2Id = genTempId();
            const r1 = {id:r1Id,account_id:acctId,action_type:'transfer_out',amount:amtYuan,record_date:date,note:note||'转出',paired_id:null};
            const r2 = {id:r2Id,account_id:this.destId,action_type:'transfer_in',amount:amtYuan,record_date:date,note:note||'来自 '+(this.allAccounts.find(a=>a.id===acctId)?.name||'其他账户'),paired_id:null};
            if (!this.store.allRecords[acctId]) this.store.allRecords[acctId] = [];
            if (!this.store.allRecords[this.destId]) this.store.allRecords[this.destId] = [];
            this.store.allRecords[acctId].push(r1);
            this.store.allRecords[this.destId].push(r2);
            enqueueOp('create_record',{
              record:{account_id:acctId,action_type:'transfer_out',amount,record_date:date,note:r1.note},
              pairedRecord:{account_id:this.destId,action_type:'transfer_in',amount,record_date:date,note:r2.note},
              localAcct:acctId, pairedLocalAcct:this.destId,
            });
          } else {
            const rId = genTempId();
            const r = {id:rId,account_id:acctId,action_type:'transfer_out',amount:amtYuan,record_date:date,note:note||'转出',investor_id: this.investorId || null,paired_id:null};
            if (!this.store.allRecords[acctId]) this.store.allRecords[acctId] = [];
            this.store.allRecords[acctId].push(r);
            enqueueOp('create_record',{record:{account_id:acctId,action_type:'transfer_out',amount,record_date:date,note:r.note,investor_id: this.investorId || null},localAcct:acctId});
          }
        } else {
          // revalue
          const rId = genTempId();
          const r = {id:rId,account_id:acctId,action_type:'revalue',amount:amtYuan,record_date:date,note,paired_id:null};
          if (!this.store.allRecords[acctId]) this.store.allRecords[acctId] = [];
          this.store.allRecords[acctId].push(r);
          enqueueOp('create_record',{record:{account_id:acctId,action_type:'revalue',amount,record_date:date,note},localAcct:acctId});
        }
        // Clear cache and close
        if (window.queryCache && window.queryCache['recs_'+acctId] !== undefined) delete window.queryCache['recs_'+acctId];
        this.close();
        toast('记录已保存（同步中）','success');
        window.render();
      },
    },
  };

  window.__recordModalComponent = RecordModal;
  console.log('[component] record-modal loaded');
})();
