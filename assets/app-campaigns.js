/* ============================================================
   Campaign 活动模块
   依赖 window.__crmCore（由 app.js 暴露）
   功能：创建活动 · 加入红人 · 自动汇总合作进度 · 阶段更新
   ============================================================ */
(function(){
'use strict';
const C=window.__crmCore;
const $  = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];

/* ---------- 列表视图 ---------- */
function render(){
  const el=$('#view-campaigns'), camps=C.DB.campaigns;
  if(!camps.length){
    el.innerHTML=`<div class="empty"><div class="big">🚀</div>还没有 Campaign。<br>点击右上角「创建 Campaign」，再选择红人加入，系统会自动跟踪合作进度。</div>`;
    return;
  }
  el.innerHTML=`<div class="camp-grid">`+camps.map(c=>{
    const p=C.campProgress(c), st=C.campStatus(c);
    const members=c.members.map(m=>C.getInf(m.infId)).filter(Boolean);
    const av=members.slice(0,5).map(m=>`<div class="avatar" title="${C.esc(m.handle)}">${C.esc(C.initials(m.handle))}</div>`).join('');
    const more=members.length>5?`<div class="more">+${members.length-5}</div>`:'';
    const reach=members.reduce((a,m)=>a+(Number(m.followers)||0),0);
    return `<div class="camp-card" data-cd="${c.id}">
      <div class="ch"><div><div class="cn">${C.esc(c.name)}</div><div class="cmeta">${C.esc(c.brand||'—')} · ${C.esc(c.startDate||'')}${c.endDate?' → '+C.esc(c.endDate):''}</div></div>
        <span class="badge ${st.cls}">${st.t}</span></div>
      <div class="cstats">
        <div><div class="v">${c.members.length}</div><div class="l">红人</div></div>
        <div><div class="v">${C.fmt(reach)}</div><div class="l">覆盖 Reach</div></div>
        <div><div class="v">$${C.fmt(c.budget||0)}</div><div class="l">预算</div></div>
      </div>
      <div class="prog-label"><span class="muted">合作进度（自动）</span><span style="font-weight:700">${p}%</span></div>
      <div class="progress"><span style="width:${p}%"></span></div>
      <div class="avatars">${av||'<span class="muted" style="font-size:12px">尚未加入红人</span>'}${more}</div>
    </div>`;
  }).join('')+`</div>`;
  $$('[data-cd]',el).forEach(c=>c.onclick=()=>detail(c.dataset.cd));
}

/* ---------- 创建 / 编辑 活动 ---------- */
function form(id){
  const c=id?C.getCamp(id):null, edit=!!c;
  const v=c||{name:'',brand:'',goal:'',budget:'',startDate:C.today(),endDate:''};
  C.openModal(`${edit?'编辑':'创建'} Campaign`, `
    <div class="form-grid">
      <div class="field full"><label>活动名称 <span class="req">*</span></label><input id="c_name" value="${C.esc(v.name)}" placeholder="如 2026 春季新品评测"></div>
      <div class="field"><label>品牌 / 客户</label><input id="c_brand" value="${C.esc(v.brand||'')}" placeholder="如 Garmin"></div>
      <div class="field"><label>预算 (USD)</label><input id="c_budget" type="number" value="${v.budget}" placeholder="总预算"></div>
      <div class="field"><label>开始日期</label><input id="c_start" type="date" value="${C.esc(v.startDate||'')}"></div>
      <div class="field"><label>结束日期</label><input id="c_end" type="date" value="${C.esc(v.endDate||'')}"></div>
      <div class="field full"><label>活动目标 / 说明</label><textarea id="c_goal" placeholder="本次活动的目标、交付物要求等...">${C.esc(v.goal||'')}</textarea></div>
    </div>
  `, `<button class="btn ghost" onclick="window.__crm.closeModal()">取消</button><button class="btn primary" id="saveCamp">${edit?'保存':'创建并选择红人'}</button>`);
  $('#saveCamp').onclick=()=>{
    const name=$('#c_name').value.trim();
    if(!name){ C.toast('请填写活动名称',false); $('#c_name').focus(); return; }
    const data={name,brand:$('#c_brand').value.trim(),budget:Number($('#c_budget').value)||0,
      startDate:$('#c_start').value,endDate:$('#c_end').value,goal:$('#c_goal').value.trim()};
    if(edit){ Object.assign(c,data); C.save(); C.closeModal(); render(); C.toast('已保存活动'); }
    else { const nc={id:C.uid('camp'),createdAt:C.today(),members:[],...data}; C.DB.campaigns.unshift(nc);
      C.save(); C.closeModal(); render(); C.toast('已创建活动'); detail(nc.id); }
  };
}

/* ---------- 活动详情（含加入红人 / 阶段更新 / 自动进度） ---------- */
function detail(id){
  const c=C.getCamp(id); if(!c) return;
  const p=C.campProgress(c), st=C.campStatus(c);
  const members=c.members.map(m=>({...m,inf:C.getInf(m.infId)})).filter(m=>m.inf);
  const reach=members.reduce((a,m)=>a+(Number(m.inf.followers)||0),0);
  const cost=members.reduce((a,m)=>a+(Number(m.inf.rate)||0),0);

  C.openModal(C.esc(c.name), `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
      <span class="badge ${st.cls}">${st.t}</span>
      <span class="muted">${C.esc(c.brand||'—')} · ${C.esc(c.startDate||'')}${c.endDate?' → '+C.esc(c.endDate):''}</span>
    </div>
    ${c.goal?`<p class="muted" style="line-height:1.6;margin-bottom:14px">${C.esc(c.goal)}</p>`:''}
    <div class="stat-grid" style="grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
      <div class="stat"><div class="label">红人数</div><div class="num" style="font-size:22px">${members.length}</div></div>
      <div class="stat"><div class="label">覆盖 Reach</div><div class="num" style="font-size:22px">${C.fmt(reach)}</div></div>
      <div class="stat"><div class="label">预估成本</div><div class="num" style="font-size:22px">$${C.fmt(cost)}</div><div class="delta flat">预算 $${C.fmt(c.budget||0)}</div></div>
      <div class="stat"><div class="label">合作进度</div><div class="num" style="font-size:22px">${p}%</div></div>
    </div>
    <div class="prog-label"><span class="muted">整体进度（由各红人阶段自动汇总）</span><span style="font-weight:700">${p}%</span></div>
    <div class="progress" style="margin-bottom:18px"><span style="width:${p}%"></span></div>

    <div class="panel-head"><h2>活动红人（${members.length}）</h2><button class="btn sm primary" id="addMember">＋ 加入红人</button></div>
    <div id="memberList">${renderMembers(members)}</div>
  `, `<button class="btn danger" id="delCamp">删除活动</button><div style="flex:1"></div><button class="btn ghost" onclick="window.__crm.closeModal()">关闭</button><button class="btn" id="editCamp">编辑信息</button>`, true);

  $('#addMember').onclick=()=>openPicker(id);
  $('#editCamp').onclick=()=>form(id);
  $('#delCamp').onclick=()=>C.openConfirm(`删除活动「${C.esc(c.name)}」？`,'此操作不可撤销（红人本身不会被删除）。',()=>{
    C.DB.campaigns=C.DB.campaigns.filter(x=>x.id!==id); C.save(); C.closeModal(); render(); C.refreshDashboardIfActive(); C.toast('已删除活动');
  });
  bindMemberEvents(id);
}

function renderMembers(members){
  if(!members.length) return '<div class="empty" style="padding:30px"><div class="big">👥</div>还没有红人，点击「加入红人」从红人库选择</div>';
  return members.map(m=>{
    const idx=C.STAGES.indexOf(m.stage);
    const pipe=C.STAGES.map((s,i)=>`<span class="stage-pill ${i<idx?'done':i===idx?'current':''}">${C.esc(s)}</span>`).join('');
    return `<div class="member-row" data-mid="${m.infId}">
      <div class="avatar">${C.esc(C.initials(m.inf.handle))}</div>
      <div style="flex:1;min-width:0">
        <div class="mname">${C.esc(m.inf.handle)} <span class="muted" style="font-weight:400">· ${C.fmt(m.inf.followers)} fans</span></div>
        <div class="pipeline">${pipe}</div>
      </div>
      <select class="stage-select" data-stage="${m.infId}">${C.STAGES.map(s=>`<option ${m.stage===s?'selected':''}>${C.esc(s)}</option>`).join('')}</select>
      <button class="icon-btn" data-remove="${m.infId}" title="移出活动">✕</button>
    </div>`;
  }).join('');
}

function bindMemberEvents(campId){
  $$('[data-stage]').forEach(sel=>sel.onchange=e=>{
    const c=C.getCamp(campId); const m=c.members.find(x=>x.infId===sel.dataset.stage);
    if(m){ m.stage=e.target.value; m.updatedAt=C.today(); C.save(); detail(campId); C.refreshDashboardIfActive(); C.toast('已更新合作阶段，进度自动刷新'); }
  });
  $$('[data-remove]').forEach(b=>b.onclick=()=>{
    const c=C.getCamp(campId); c.members=c.members.filter(x=>x.infId!==b.dataset.remove);
    C.save(); detail(campId); C.refreshDashboardIfActive(); C.toast('已移出活动');
  });
}

/* ---------- 加入红人 选择器 ---------- */
function openPicker(campId){
  const c=C.getCamp(campId);
  const inIds=new Set(c.members.map(m=>m.infId));
  const candidates=C.DB.influencers.filter(i=>!inIds.has(i.id));
  let sel=new Set();
  C.openModal('从红人库加入红人', `
    <div class="search" style="margin-bottom:14px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="pkSearch" placeholder="搜索红人..."></div>
    <div class="picker" id="pkList">${candidates.length?candidates.map(i=>pkItem(i)).join(''):'<div class="empty" style="padding:30px">红人库中所有红人都已加入该活动</div>'}</div>
  `, `<button class="btn ghost" onclick="window.__crm.closeModal()">取消</button><button class="btn primary" id="pkAdd">加入选中（<span id="pkCount">0</span>）</button>`);

  const refreshList=q=>{
    const list=candidates.filter(i=>!q||(i.handle+' '+(i.realname||'')).toLowerCase().includes(q.toLowerCase()));
    $('#pkList').innerHTML=list.length?list.map(i=>pkItem(i,sel.has(i.id))).join(''):'<div class="empty" style="padding:24px">无匹配红人</div>';
    bindPk();
  };
  const bindPk=()=>$$('#pkList .picker-item').forEach(it=>it.onclick=()=>{
    const id=it.dataset.pk; if(sel.has(id))sel.delete(id);else sel.add(id);
    it.classList.toggle('sel',sel.has(id)); it.querySelector('.pcheck').innerHTML=sel.has(id)?'✓':''; $('#pkCount').textContent=sel.size;
  });
  bindPk();
  $('#pkSearch').oninput=e=>refreshList(e.target.value);
  $('#pkAdd').onclick=()=>{
    if(!sel.size){ C.toast('请至少选择一位红人',false); return; }
    sel.forEach(id=>c.members.push({infId:id,stage:C.STAGES[0],addedAt:C.today(),updatedAt:C.today()}));
    C.save(); detail(campId); C.refreshDashboardIfActive(); C.toast(`已加入 ${sel.size} 位红人`);
  };
}
function pkItem(i,on){
  return `<div class="picker-item ${on?'sel':''}" data-pk="${i.id}">
    <div class="pcheck">${on?'✓':''}</div>
    <div class="avatar" style="width:36px;height:36px;font-size:14px">${C.esc(C.initials(i.handle))}</div>
    <div style="flex:1"><div style="font-weight:600">${C.esc(i.handle)}</div><div class="muted" style="font-size:12px">${C.esc(i.platform)} · ${C.fmt(i.followers)} fans</div></div>
  </div>`;
}

/* ---------- 注册到全局，供 app.js 调用 ---------- */
window.__campaignsModule={render,form,detail};
})();
