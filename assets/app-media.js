/* ============================================================
   app-media.js · 媒体库（Blog / Website 独立资源库）
   - 媒体库（view-media）：全部媒体 / 我的媒体 切换 + PIC 负责人呈现
   - 寻找新的媒体（view-media-find）：公共媒体源，转入媒体库 / 转入我的媒体
   依赖 window.__crmCore（esc/fmt/toast/openModal/closeModal）
        window.__auth（apiGet/apiPost/current/isAdmin）
   ============================================================ */
(function(){
  'use strict';
  const TYPES=['Blog','Media'];
  let LIB=[];        // 媒体库（全部媒体 + 我的媒体）
  let PUB=[];        // 公共媒体源（寻找新的媒体）
  let libLoaded=false, pubLoaded=false;
  let scope='all';   // all | mine
  let q='', fType='', fSort='visits', fRegion='';   // 媒体库：地区分级
  let pq='', pType='', pSort='visits', pRegion='';  // 寻找新的媒体：地区分级

  // 地区归并（与红人库一致的地区分类思路：把细分国家归并为大区）
  function regionGroup(r){
    r=String(r||'').trim();
    if(!r) return 'Other';
    if(/Global|全球|International/i.test(r)) return 'Global';
    if(/USA|United States|US\b|America|Canada|北美/i.test(r)) return 'North America';
    if(/United Kingdom|UK|England|France|Germany|Spain|Italy|Netherlands|Europe|欧洲/i.test(r)) return 'Europe';
    if(/China|Japan|Korea|Asia|Australia|New Zealand|Singapore|亚太|亚洲|澳/i.test(r)) return 'Asia-Pacific';
    return r;
  }

  function C(){ return window.__crmCore||{}; }
  function esc(s){ const f=C().esc; return f?f(s):String(s==null?'':s); }
  function fmt(n){ const f=C().fmt; return f?f(n):String(n||0); }
  function toast(m,ok){ const f=C().toast; if(f) f(m,ok); }
  function api(){ return window.__auth||{}; }
  function me(){ return (api().current&&api().current())||null; }
  function isAdmin(){ return !!(api().isAdmin&&api().isAdmin()); }
  function initials(s){ return String(s||'?').replace(/[^A-Za-z\u4e00-\u9fa5]/g,'').slice(0,2).toUpperCase()||'?'; }
  function picName(id){ const f=window.__crm&&window.__crm.picName; if(f) return f(id);
    const u=(window.__USERS&&window.__USERS[id])||null; if(u) return u.displayName||u.username||'成员';
    const m=me(); if(m&&m.id===id) return m.displayName||m.username||'我'; return '团队成员'; }

  async function loadLib(force){ if(libLoaded&&!force) return;
    try{ LIB=await api().apiGet('/api/media'); libLoaded=true; }
    catch(e){ LIB=[]; toast('加载媒体库失败：'+e.message,false); } }
  async function loadPub(force){ if(pubLoaded&&!force) return;
    try{ PUB=await api().apiGet('/api/media-public'); pubLoaded=true; }
    catch(e){ PUB=[]; toast('加载媒体源失败：'+e.message,false); } }

  /* ---------------- 媒体库（全部媒体 / 我的媒体）---------------- */
  function libFiltered(){
    const m=me();
    let list=LIB.slice();
    if(scope==='mine'){ list=list.filter(i=>m&&i.ownerId===m.id); }
    if(fRegion) list=list.filter(i=>regionGroup(i.region)===fRegion);
    if(fType) list=list.filter(i=>(i.type||'Blog')===fType);
    if(q){ const s=q.toLowerCase(); list=list.filter(i=>((i.name||'')+' '+(i.handle||'')+' '+(i.region||'')+' '+(i.topics||[]).join(' ')).toLowerCase().includes(s)); }
    if(fSort==='visits') list.sort((a,b)=>(b.monthlyVisits||0)-(a.monthlyVisits||0));
    else if(fSort==='da') list.sort((a,b)=>(b.da||0)-(a.da||0));
    return list;
  }
  function countAll(){ return LIB.length; }
  function countMine(){ const m=me(); return LIB.filter(i=>m&&i.ownerId===m.id).length; }
  // 当前范围（全部/我的）下的媒体集合，用于统计地区
  function libScoped(){ const m=me(); return scope==='mine'?LIB.filter(i=>m&&i.ownerId===m.id):LIB.slice(); }
  // 地区分级选项：'' 表示全部地区，按数量排序
  function libRegions(){
    const map={};
    libScoped().forEach(i=>{ const g=regionGroup(i.region); map[g]=(map[g]||0)+1; });
    return Object.keys(map).sort((a,b)=>map[b]-map[a]).map(k=>({key:k,n:map[k]}));
  }

  async function renderLibrary(){
    const el=document.getElementById('view-media'); if(!el) return;
    el.innerHTML=`<div class="empty"><div class="big">⏳</div>正在加载媒体库…</div>`;
    await loadLib();
    const types=[...new Set(LIB.map(i=>i.type||'Blog'))].sort();
    const regions=libRegions();
    // 若当前选中的地区在新范围下不存在，回退到「全部地区」
    if(fRegion && !regions.some(r=>r.key===fRegion)) fRegion='';
    el.innerHTML=`
      <div class="scope-bar" style="margin-bottom:14px">
        <button class="scope-tab ${scope==='all'?'active':''}" data-scope="all">全部媒体<span class="rb-n">${countAll()}</span></button>
        <button class="scope-tab ${scope==='mine'?'active':''}" data-scope="mine">我的媒体<span class="rb-n">${countMine()}</span></button>
      </div>
      <div class="region-bar">
        <span class="rb-title">按地区</span>
        <button class="region-tab ${fRegion===''?'active':''}" data-region="">全部地区<span class="rb-n">${libScoped().length}</span></button>
        ${regions.map(r=>`<button class="region-tab ${fRegion===r.key?'active':''}" data-region="${esc(r.key)}">${esc(r.key)}<span class="rb-n">${r.n}</span></button>`).join('')}
      </div>
      <div class="toolbar">
        <div class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
          <input id="mLibSearch" placeholder="搜索 媒体名 / Handle / 地区 / 主题..." value="${esc(q)}"></div>
        <select class="filter" id="mLibType"><option value="">全部类型</option>${types.map(t=>`<option ${fType===t?'selected':''}>${esc(t)}</option>`).join('')}</select>
        <select class="filter" id="mLibSort">
          <option value="visits" ${fSort==='visits'?'selected':''}>按月访问量</option>
          <option value="da" ${fSort==='da'?'selected':''}>按域名权重 DA</option>
        </select>
      </div>
      <div id="mLibList"></div>`;
    el.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.scope;fRegion='';renderLibrary();});
    el.querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>{fRegion=b.dataset.region;renderLibrary();});
    el.querySelector('#mLibSearch').oninput=e=>{q=e.target.value;renderLibList();};
    el.querySelector('#mLibType').onchange=e=>{fType=e.target.value;renderLibList();};
    el.querySelector('#mLibSort').onchange=e=>{fSort=e.target.value;renderLibList();};
    renderLibList();
  }

  function renderLibList(){
    const box=document.getElementById('mLibList'); if(!box) return;
    const list=libFiltered();
    if(!list.length){
      box.innerHTML=`<div class="empty"><div class="big">📰</div>${scope==='mine'?'你还没有把任何媒体加入「我的媒体」。去「寻找新的媒体」转入，或在「全部媒体」里点「转入我的媒体」。':'媒体库还是空的。去「寻找新的媒体」把 Blog / Website 转入媒体库。'}</div>`;
      return;
    }
    box.innerHTML=`<div class="inf-grid">`+list.map(libCard).join('')+`</div>`;
    box.querySelectorAll('[data-claimcard]').forEach(b=>b.onclick=e=>{e.stopPropagation();claimCard(b.dataset.claimcard);});
    box.querySelectorAll('[data-editm]').forEach(b=>b.onclick=e=>{e.stopPropagation();form(b.dataset.editm);});
    box.querySelectorAll('[data-delm]').forEach(b=>b.onclick=e=>{e.stopPropagation();delMedia(b.dataset.delm);});
  }

  function typeChip(t){ const c=t==='Media'?'#5b7cff':'#0ec4a3'; return `<span class="badge" style="background:${c}1a;color:${c}">${esc(t||'Blog')}</span>`; }

  function picFooter(i){
    const m=me();
    if(i.ownerId){
      const mine=m&&i.ownerId===m.id;
      return `<span class="pic-owned">👤 PIC：${esc(picName(i.ownerId))}</span>${mine?'<span class="pic-me">我的</span>':''}`;
    }
    return `<button class="btn primary sm pic-claim" data-claimcard="${i.id}">⭐ 转入我的媒体</button>`;
  }

  function libCard(i){
    const canEdit=isAdmin()||(me()&&i.ownerId===me().id);
    return `<div class="inf-card">
      <div class="ic-head">
        <span class="avatar avatar-fallback">${initials(i.name||i.handle)}</span>
        <div style="flex:1;min-width:0">
          <div class="ic-name">${i.url?`<a class="ic-link" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.name||i.handle)} ↗</a>`:esc(i.name||i.handle)}</div>
          <div class="ic-handle">${esc(i.region||'—')} · ${esc(i.language||'')}</div>
        </div>
        ${typeChip(i.type)}
      </div>
      <div class="ic-stats">
        <div class="s"><div class="v">${fmt(i.monthlyVisits)}</div><div class="l">月访问量</div></div>
        <div class="s"><div class="v">${i.da||'—'}</div><div class="l">域名权重 DA</div></div>
        <div class="s"><div class="v" style="font-size:12px">${esc((i.topics||[])[0]||'—')}</div><div class="l">核心主题</div></div>
      </div>
      <div class="tags">${(i.topics||[]).slice(0,3).map(v=>`<span class="tag v">${esc(v)}</span>`).join('')}</div>
      <div class="ic-foot">
        <span class="muted" style="font-size:11px">${esc(i.email||'无公开邮箱')}</span>
        ${canEdit?`<span class="lib-acts"><button class="icon-btn" data-editm="${i.id}" title="编辑">✎</button><button class="icon-btn" data-delm="${i.id}" title="删除">🗑</button></span>`:''}
      </div>
      <div class="ic-pic">${picFooter(i)}</div>
    </div>`;
  }

  async function claimCard(id){
    try{
      const m=await api().apiPost('/api/media/'+id+'/claim',{});
      const idx=LIB.findIndex(x=>x.id===id); if(idx>=0) LIB[idx]=m;
      toast('已转入我的媒体：'+(m.name||m.handle||''));
      renderLibrary();
    }catch(e){ toast('转入失败：'+e.message,false); }
  }

  async function delMedia(id){
    const i=LIB.find(x=>x.id===id); if(!i) return;
    if(!confirm('确认删除媒体「'+(i.name||i.handle)+'」？')) return;
    try{ await api().apiPost; await api().apiGet; await fetch('/api/media/'+id,{method:'DELETE',credentials:'same-origin'}).then(r=>r.json());
      LIB=LIB.filter(x=>x.id!==id); toast('已删除'); renderLibrary();
    }catch(e){ toast('删除失败：'+e.message,false); }
  }

  /* ---------------- 新增 / 编辑 媒体表单 ---------------- */
  function form(id){
    const core=window.__crmCore; if(!core||!core.openModal) return;
    const i=id?LIB.find(x=>x.id===id):null;
    const v=i||{type:'Blog',region:'',language:'English',topics:[]};
    core.openModal(id?'编辑媒体':'新增媒体', `
      <div class="form-grid">
        <div class="field"><label>媒体名称 *</label><input id="mfName" value="${esc(v.name||'')}" placeholder="如 CyclingTips"></div>
        <div class="field"><label>Handle / 标识</label><input id="mfHandle" value="${esc(v.handle||'')}" placeholder="如 cyclingtips"></div>
        <div class="field full"><label>主页 URL</label><input id="mfUrl" value="${esc(v.url||'')}" placeholder="https://..."></div>
        <div class="field"><label>类型</label><select id="mfType">${TYPES.map(t=>`<option ${v.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label>地区 / 市场</label><input id="mfRegion" value="${esc(v.region||'')}" placeholder="如 USA / Global"></div>
        <div class="field"><label>月访问量</label><input id="mfVisits" type="number" value="${v.monthlyVisits||''}" placeholder="如 500000"></div>
        <div class="field"><label>域名权重 DA</label><input id="mfDa" type="number" value="${v.da||''}" placeholder="0-100"></div>
        <div class="field"><label>内容语言</label><input id="mfLang" value="${esc(v.language||'')}" placeholder="如 English"></div>
        <div class="field"><label>联系邮箱</label><input id="mfEmail" value="${esc(v.email||'')}" placeholder="email@..."></div>
        <div class="field full"><label>核心主题（逗号分隔）</label><input id="mfTopics" value="${esc((v.topics||[]).join(', '))}" placeholder="Road Cycling, Gear Review"></div>
      </div>`,
      `<button class="btn ghost" onclick="window.__crm.closeModal()">取消</button><button class="btn primary" id="mfSave">${id?'保存':'添加媒体'}</button>`);
    document.getElementById('mfSave').onclick=async()=>{
      const payload={
        name:val('mfName'), handle:val('mfHandle'), url:val('mfUrl'), type:val('mfType'),
        region:val('mfRegion'), monthlyVisits:Number(val('mfVisits'))||0, da:Number(val('mfDa'))||0,
        language:val('mfLang'), email:val('mfEmail'),
        topics:val('mfTopics').split(',').map(s=>s.trim()).filter(Boolean),
      };
      if(!payload.name){ toast('请填写媒体名称',false); return; }
      try{
        if(id){ const m=await api().apiPut?api().apiPut('/api/media/'+id,payload):putMedia(id,payload); }
        else { await api().apiPost('/api/media',payload); }
        await loadLib(true); core.closeModal(); renderLibrary(); toast(id?'已保存':'已新增媒体');
      }catch(e){ toast('保存失败：'+e.message,false); }
    };
  }
  function val(id){ const e=document.getElementById(id); return e?e.value.trim():''; }
  async function putMedia(id,body){ return fetch('/api/media/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)}).then(r=>r.json()); }

  /* ---------------- 寻找新的媒体（公共媒体源）---------------- */
  function markStates(){
    const m=me();
    PUB.forEach(p=>{
      const refs=LIB.filter(x=>x.publicRef===p.id);
      p.__inLib=refs.length>0;
      p.__mine=!!(m&&refs.some(x=>x.ownerId===m.id));
    });
  }
  function pubFiltered(){
    let list=PUB.slice();
    if(pRegion) list=list.filter(i=>regionGroup(i.region)===pRegion);
    if(pType) list=list.filter(i=>(i.type||'Blog')===pType);
    if(pq){ const s=pq.toLowerCase(); list=list.filter(i=>((i.name||'')+' '+(i.handle||'')+' '+(i.region||'')+' '+(i.topics||[]).join(' ')).toLowerCase().includes(s)); }
    if(pSort==='visits') list.sort((a,b)=>(b.monthlyVisits||0)-(a.monthlyVisits||0));
    else if(pSort==='da') list.sort((a,b)=>(b.da||0)-(a.da||0));
    return list;
  }
  function pubTypes(){ return [...new Set(PUB.map(i=>i.type||'Blog'))].sort(); }
  // 寻找新的媒体：地区分级选项
  function pubRegions(){
    const map={};
    PUB.forEach(i=>{ const g=regionGroup(i.region); map[g]=(map[g]||0)+1; });
    return Object.keys(map).sort((a,b)=>map[b]-map[a]).map(k=>({key:k,n:map[k]}));
  }

  async function renderFind(){
    const el=document.getElementById('view-media-find'); if(!el) return;
    el.innerHTML=`<div class="empty"><div class="big">⏳</div>正在加载媒体源…</div>`;
    await loadPub(); await loadLib();
    if(!PUB.length){
      el.innerHTML=`<div class="empty"><div class="big">🌐</div>暂无可发现的媒体源。${isAdmin()?'点击右上角「🕷 立即抓取媒体」拉取一批公路骑行垂直媒体。':'请联系管理员触发抓取。'}</div>`;
      return;
    }
    const regions=pubRegions();
    if(pRegion && !regions.some(r=>r.key===pRegion)) pRegion='';
    const types=pubTypes();
    el.innerHTML=`
      <div class="region-bar">
        <span class="rb-title">按地区</span>
        <button class="region-tab ${pRegion===''?'active':''}" data-pregion="">全部地区<span class="rb-n">${PUB.length}</span></button>
        ${regions.map(r=>`<button class="region-tab ${pRegion===r.key?'active':''}" data-pregion="${esc(r.key)}">${esc(r.key)}<span class="rb-n">${r.n}</span></button>`).join('')}
      </div>
      <div class="toolbar">
        <div class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
          <input id="mFindSearch" placeholder="搜索 媒体名 / 地区 / 主题..." value="${esc(pq)}"></div>
        <select class="filter" id="mFindType"><option value="">全部类型</option>${types.map(t=>`<option ${pType===t?'selected':''}>${esc(t)}</option>`).join('')}</select>
        <select class="filter" id="mFindSort">
          <option value="visits" ${pSort==='visits'?'selected':''}>按月访问量</option>
          <option value="da" ${pSort==='da'?'selected':''}>按域名权重 DA</option>
        </select>
      </div>
      <div id="mFindList"></div>`;
    el.querySelectorAll('[data-pregion]').forEach(b=>b.onclick=()=>{pRegion=b.dataset.pregion;renderFind();});
    el.querySelector('#mFindSearch').oninput=e=>{pq=e.target.value;renderFindList();};
    el.querySelector('#mFindType').onchange=e=>{pType=e.target.value;renderFindList();};
    el.querySelector('#mFindSort').onchange=e=>{pSort=e.target.value;renderFindList();};
    renderFindList();
  }

  function renderFindList(){
    const box=document.getElementById('mFindList'); if(!box) return;
    markStates();
    const list=pubFiltered();
    if(!list.length){ box.innerHTML=`<div class="empty">该类型下没有匹配的媒体，试试调整筛选条件。</div>`; return; }
    box.innerHTML=`<div class="inf-grid">`+list.map(pubCard).join('')+`</div>`;
    box.querySelectorAll('[data-addlib]').forEach(b=>b.onclick=()=>addToLib(b.dataset.addlib));
    box.querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>claim(b.dataset.claim));
  }

  function pubCard(i){
    return `<div class="inf-card">
      <div class="ic-head">
        <span class="avatar avatar-fallback">${initials(i.name||i.handle)}</span>
        <div style="flex:1;min-width:0">
          <div class="ic-name">${i.url?`<a class="ic-link" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.name||i.handle)} ↗</a>`:esc(i.name||i.handle)}</div>
          <div class="ic-handle">${esc(i.region||'—')} · ${esc(i.language||'')}</div>
        </div>
        ${typeChip(i.type)}
      </div>
      <div class="ic-stats">
        <div class="s"><div class="v">${fmt(i.monthlyVisits)}</div><div class="l">月访问量</div></div>
        <div class="s"><div class="v">${i.da||'—'}</div><div class="l">域名权重 DA</div></div>
        <div class="s"><div class="v" style="font-size:12px">${esc((i.topics||[])[0]||'—')}</div><div class="l">核心主题</div></div>
      </div>
      <div class="tags">${(i.topics||[]).slice(0,3).map(v=>`<span class="tag v">${esc(v)}</span>`).join('')}</div>
      <div class="ic-foot">
        <span class="muted" style="font-size:11px">${esc(i.email||'无公开邮箱')}</span>
        <span class="lib-acts">
          <button class="btn ghost sm" data-addlib="${i.id}" ${i.__inLib||i.__mine?'disabled':''}>${i.__inLib||i.__mine?'已在媒体库':'📥 转入媒体库'}</button>
          <button class="btn primary sm" data-claim="${i.id}" ${i.__mine?'disabled':''}>${i.__mine?'已转入我的媒体':'⭐ 转入我的媒体'}</button>
        </span>
      </div>
    </div>`;
  }

  async function addToLib(id){
    try{ const m=await api().apiPost('/api/media-public/'+id+'/add-to-library',{});
      await loadLib(true); toast('已转入媒体库（全部媒体）：'+(m.name||m.handle||'')); renderFindList();
    }catch(e){ toast('转入失败：'+e.message,false); }
  }
  async function claim(id){
    try{ const m=await api().apiPost('/api/media-public/'+id+'/claim',{});
      await loadLib(true); toast('已转入我的媒体：'+(m.name||m.handle||'')); renderFindList();
    }catch(e){ toast('转入失败：'+e.message,false); }
  }

  async function crawl(){
    toast('正在抓取公路骑行垂直媒体…');
    try{ const r=await api().apiPost('/api/media-public/crawl',{});
      await loadPub(true); renderFind();
      toast(`抓取完成：新增 ${r.added} 个，共 ${r.total} 个媒体源`);
    }catch(e){ toast('抓取失败：'+e.message,false); }
  }

  window.__mediaModule={ renderLibrary, renderFind, form, crawl,
    reload:()=>{ loadLib(true); loadPub(true); } };
})();
