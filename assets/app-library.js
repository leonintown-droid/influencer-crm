/* ============================================================
   app-library.js · 公共红人库（功能4 平台分菜单 / 功能5 预计播放量 / 功能6 CPTV 报价）
   依赖 window.__crmCore（esc/fmt/toast/openModal/closeModal/route）
        window.__auth（apiGet/apiPost）
   ============================================================ */
(function(){
  'use strict';
  const PLAT_CATS=['YouTube','Instagram','TikTok','Facebook','Reddit','Twitter','Blog'];
  let DATA=[];            // 公共库全量
  let curPlat='YouTube'; // 当前平台二级菜单
  let q='', fRegion='', fTier='', fSort='quote';
  let loaded=false;

  function C(){ return window.__crmCore||{}; }
  function esc(s){ const f=C().esc; return f?f(s):String(s==null?'':s); }
  function fmt(n){ const f=C().fmt; return f?f(n):String(n||0); }
  function toast(m,ok){ const f=C().toast; if(f) f(m,ok); }
  function api(){ return window.__auth||{}; }

  // 量级（与主库一致的粗分）
  function tierOf(f){ f=Number(f)||0; if(f>=1e6)return'Tier-1'; if(f>=5e5)return'Macro'; if(f>=1e5)return'Mid-tier'; return'Micro'; }
  function initials(s){ return String(s||'?').replace(/[^A-Za-z\u4e00-\u9fa5]/g,'').slice(0,2).toUpperCase()||'?'; }

  async function ensureLoaded(force){
    if(loaded && !force) return;
    try{
      DATA = await api().apiGet('/api/public-library');
      loaded=true;
    }catch(e){ DATA=[]; toast('加载红人数据失败：'+e.message,false); }
  }

  function platCount(p){ return DATA.filter(i=>(i.platformCat||i.platform)===p).length; }

  function filtered(){
    let list=DATA.filter(i=>(i.platformCat||i.platform)===curPlat);
    if(fRegion) list=list.filter(i=>(i.region||'')===fRegion);
    if(fTier) list=list.filter(i=>tierOf(i.followers)===fTier);
    if(q){ const s=q.toLowerCase(); list=list.filter(i=>((i.handle||'')+' '+(i.realname||'')+' '+(i.region||'')).toLowerCase().includes(s)); }
    if(fSort==='quote') list.sort((a,b)=>(b.quoteHigh||0)-(a.quoteHigh||0));
    else if(fSort==='views') list.sort((a,b)=>(b.estViews||0)-(a.estViews||0));
    else if(fSort==='followers') list.sort((a,b)=>(b.followers||0)-(a.followers||0));
    return list;
  }

  function regionOptions(){
    const set=[...new Set(DATA.filter(i=>(i.platformCat||i.platform)===curPlat).map(i=>i.region).filter(Boolean))];
    return set.sort();
  }

  async function render(){
    const el=document.getElementById('view-library'); if(!el) return;
    el.innerHTML=`<div class="empty"><div class="big">⏳</div>正在加载红人数据…</div>`;
    await ensureLoaded();
    if(!DATA.length){
      el.innerHTML=`<div class="empty"><div class="big">🌐</div>暂无可发现的红人。${(api().isAdmin&&api().isAdmin())?'点击右上角「🕷 立即抓取更新」拉取一批 Road Cycling KOL。':'请联系管理员触发每日爬虫。'}</div>`;
      return;
    }
    const regions=regionOptions();
    el.innerHTML=`
      <div class="region-bar">
        <span class="rb-title">按平台</span>
        ${PLAT_CATS.map(p=>`<button class="region-tab ${curPlat===p?'active':''}" data-plat="${p}">${esc(p)}<span class="rb-n">${platCount(p)}</span></button>`).join('')}
      </div>
      <div class="toolbar">
        <div class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
          <input id="libSearch" placeholder="搜索 Handle / 名称 / 地区..." value="${esc(q)}"></div>
        <select class="filter" id="libRegion"><option value="">全部地区</option>${regions.map(r=>`<option ${fRegion===r?'selected':''}>${esc(r)}</option>`).join('')}</select>
        <select class="filter" id="libTier"><option value="">全部量级</option>${['Tier-1','Macro','Mid-tier','Micro'].map(t=>`<option ${fTier===t?'selected':''}>${esc(t)}</option>`).join('')}</select>
        <select class="filter" id="libSort">
          <option value="quote" ${fSort==='quote'?'selected':''}>按报价排序</option>
          <option value="views" ${fSort==='views'?'selected':''}>按预计播放量</option>
          <option value="followers" ${fSort==='followers'?'selected':''}>按粉丝数</option>
        </select>
      </div>
      <div id="libList"></div>`;
    el.querySelectorAll('.region-tab').forEach(b=>b.onclick=()=>{curPlat=b.dataset.plat;fRegion='';render();});
    el.querySelector('#libSearch').oninput=e=>{q=e.target.value;renderList();};
    el.querySelector('#libRegion').onchange=e=>{fRegion=e.target.value;renderList();};
    el.querySelector('#libTier').onchange=e=>{fTier=e.target.value;renderList();};
    el.querySelector('#libSort').onchange=e=>{fSort=e.target.value;renderList();};
    renderList();
  }

  // 根据私有库（RimeLynx 全部红人）标记每条公共红人的状态：
  //  __inLib：已存在于 RimeLynx「全部红人」（含无归属与他人归属）
  //  __mine ：已被当前用户加入「我的红人」
  function markStates(){
    const core=window.__crmCore;
    const me=(window.__auth&&window.__auth.current&&window.__auth.current())||null;
    // 始终取最新数组（DB 在登录后会被整体重新赋值，core.getInfluencers() 总指向当前 DB）
    const infs=(core&&core.getInfluencers)?(core.getInfluencers()||[])
      :((core&&core.DB&&Array.isArray(core.DB.influencers))?core.DB.influencers:[]);
    DATA.forEach(p=>{
      const refs=infs.filter(x=>x.publicRef===p.id);
      p.__inLib=refs.length>0;
      p.__mine=!!(me&&refs.some(x=>x.ownerId===me.id));
    });
  }

  function renderList(){
    const box=document.getElementById('libList'); if(!box) return;
    markStates();
    const list=filtered();
    if(!list.length){ box.innerHTML=`<div class="empty">该平台下没有匹配的红人，试试调整筛选条件。</div>`; return; }
    box.innerHTML=`<div class="inf-grid">`+list.map(card).join('')+`</div>`;
    box.querySelectorAll('[data-addlib]').forEach(b=>b.onclick=()=>addToLib(b.dataset.addlib));
    box.querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>claim(b.dataset.claim));
    box.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>detail(b.dataset.detail));
  }

  function avatar(i){
    if(i.avatar) return `<img class="avatar" src="${esc(i.avatar)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="avatar avatar-fallback" style="display:none">${initials(i.realname||i.handle)}</span>`;
    return `<span class="avatar avatar-fallback">${initials(i.realname||i.handle)}</span>`;
  }

  function card(i){
    const tier=tierOf(i.followers);
    const nameHtml=i.url
      ? `<a class="ic-link" href="${esc(i.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="打开 ${esc(i.url)}">${esc(i.handle)} ↗</a>`
      : esc(i.handle);
    return `<div class="inf-card" data-detail="${i.id}" style="cursor:pointer">
      <div class="ic-head">
        ${avatar(i)}
        <div style="flex:1;min-width:0">
          <div class="ic-name">${nameHtml} <span class="tier-chip t-${tier.toLowerCase().replace(/[^a-z0-9]/g,'')}">${esc(tier)}</span></div>
          <div class="ic-handle">${esc(i.realname||'')} · ${esc(i.region||'—')}</div>
        </div>
        <span class="badge" style="background:#eef3ff;color:#3b6cff">${esc(i.platformCat||i.platform)}</span>
      </div>
      <div class="ic-stats">
        <div class="s"><div class="v">${fmt(i.followers)}</div><div class="l">Followers</div></div>
        <div class="s"><div class="v">${fmt(i.estViews)}</div><div class="l">预计播放量</div></div>
        <div class="s"><div class="v" style="color:#1a9d5a">${esc(i.quoteRange||'—')}</div><div class="l">CPTV 报价区间</div></div>
      </div>
      <div class="tags">${(i.verticals||[]).slice(0,3).map(v=>`<span class="tag v">${esc(v)}</span>`).join('')}</div>
      <div class="ic-foot">
        <span class="muted" style="font-size:11px">True Views ${fmt(i.trueViews)} · 抓取 ${esc(i.fetchedAt||i.crawledAt||'')}</span>
        <span class="lib-acts" data-stop onclick="event.stopPropagation()">
          <button class="btn ghost sm" data-addlib="${i.id}" ${i.__inLib||i.__mine?'disabled':''}>${i.__inLib||i.__mine?'已在红人库':'📥 转入红人库'}</button>
          <button class="btn primary sm" data-claim="${i.id}" ${i.__mine?'disabled':''}>${i.__mine?'已转入我的库':'⭐ 转入我的库'}</button>
        </span>
      </div>
    </div>`;
  }

  // 转入后从后端重新拉取红人并刷新 RimeLynx 视图（确保「全部红人/我的红人」立即可见）
  async function syncIntoDB(inf){
    const core=window.__crmCore;
    if(!core) return;
    if(core.reloadInfluencers){ await core.reloadInfluencers(); return; }
    // 兜底：旧逻辑原地写入
    if(core.DB&&Array.isArray(core.DB.influencers)){
      const arr=core.DB.influencers, idx=arr.findIndex(x=>x.id===inf.id);
      if(idx>=0) arr[idx]=inf; else arr.unshift(inf);
      if(core.refreshInfluencersIfActive) core.refreshInfluencersIfActive();
    }
  }

  // 转入红人库：仅进 RimeLynx「全部红人」（无归属 owner）
  async function addToLib(id){
    const i=DATA.find(x=>x.id===id); if(!i) return;
    try{
      const inf=await api().apiPost('/api/public-library/'+id+'/add-to-library',{});
      await syncIntoDB(inf);
      toast('已转入红人库（全部红人）：'+(inf.handle||''));
      renderList();
    }catch(e){ toast('转入失败：'+e.message,false); }
  }

  // 转入我的库：进「全部红人」并归属当前用户（同时出现在「我的红人」）
  async function claim(id){
    const i=DATA.find(x=>x.id===id); if(!i) return;
    try{
      const inf=await api().apiPost('/api/public-library/'+id+'/claim',{});
      await syncIntoDB(inf);
      toast('已转入我的红人库：'+(inf.handle||''));
      renderList();
    }catch(e){ toast('转入失败：'+e.message,false); }
  }

  function detail(id){
    const i=DATA.find(x=>x.id===id); if(!i) return;
    const core=window.__crmCore; if(!core||!core.openModal) return;
    const views=(i.recentViews||[]).map(v=>fmt(v)).join('、')||'—';
    core.openModal('红人详情', `
      <div class="detail-head">
        ${avatar(i)}
        <div style="flex:1"><h3>${esc(i.handle)}</h3><div class="muted">${esc(i.realname||'')} · ${esc(i.platformCat||i.platform)} · ${esc(i.region||'—')}</div></div>
      </div>
      <div class="tags" style="margin-bottom:6px">${(i.verticals||[]).map(v=>`<span class="tag v">${esc(v)}</span>`).join('')}</div>
      <div class="kv">
        <div><div class="k">Followers</div><div class="vv">${fmt(i.followers)}</div></div>
        <div><div class="k">互动率</div><div class="vv">${(Number(i.engagement)||0).toFixed(1)}%</div></div>
        <div><div class="k">预计商单播放量</div><div class="vv">${fmt(i.estViews)}</div></div>
        <div><div class="k">等效 True Views</div><div class="vv">${fmt(i.trueViews)}</div></div>
        <div><div class="k">CPTV 合理报价区间</div><div class="vv" style="color:#1a9d5a;font-weight:700">${esc(i.quoteRange||'—')}</div></div>
        <div><div class="k">主页</div><div class="vv">${i.url?`<a href="${esc(i.url)}" target="_blank">访问 ↗</a>`:'—'}</div></div>
      </div>
      <div class="field full" style="margin-top:12px"><label>近 10 条视频播放量（爬虫抓取）</label>
        <div class="panel" style="font-size:12px;line-height:1.7">${views}</div>
        <div class="muted" style="font-size:11px;margin-top:4px">预计播放量算法：剔除最高/最低异常值后取均值 × 保守系数；报价 = 等效 True Views × 平均 CPTV，并 ±25% 给出区间。</div>
      </div>
    `, `<button class="btn ghost" onclick="window.__crm.closeModal()">关闭</button><button class="btn ghost" id="dAddLib">📥 转入红人库</button><button class="btn primary" id="dClaim">⭐ 转入我的库</button>`);
    const dc=document.getElementById('dClaim');
    if(dc) dc.onclick=()=>{ claim(id); core.closeModal(); };
    const da=document.getElementById('dAddLib');
    if(da) da.onclick=()=>{ addToLib(id); core.closeModal(); };
  }

  async function crawl(){
    toast('正在抓取最新 Road Cycling KOL…');
    try{
      const r=await api().apiPost('/api/public-library/crawl',{perPlatform:3});
      await ensureLoaded(true);
      render();
      toast(`抓取完成：新增 ${r.added} 位，共 ${r.total} 位`);
    }catch(e){ toast('抓取失败：'+e.message,false); }
  }

  window.__libraryModule={ render, crawl, reload:()=>ensureLoaded(true) };
})();
