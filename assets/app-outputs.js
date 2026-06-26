/* ============================================================
   视频产出（Outputs）模块
   维度：初稿 / 二稿 / 定稿（可上传 Word/PDF/链接）、审核反馈、AI 分析
   发布链接（手动）+ 模拟爬虫（发布日期/评论数/点赞数/播放量）+ 刷新按钮
   与红人库关联：红人详情内展示其全部产出，可按 Campaign 筛选
   ============================================================ */
(function(){
  const C = window.__crmCore;
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  // 产出阶段定义
  const DRAFT_KEYS = [
    {key:'v1',    label:'初稿'},
    {key:'v2',    label:'二稿'},
    {key:'final', label:'定稿'}
  ];
  const REVIEW_STATES = [
    {key:'pending', label:'待审核', cls:'pending'},
    {key:'revise',  label:'需修改', cls:'revise'},
    {key:'approved',label:'已通过', cls:'approved'}
  ];
  const reviewObj = k => REVIEW_STATES.find(r=>r.key===k) || REVIEW_STATES[0];

  /* ---------- 列表筛选状态 ---------- */
  let fCampaign='', fInfluencer='', fSearch='';

  /* ====================== 主视图渲染 ====================== */
  function render(){
    const el = $('#view-outputs');
    const outs = C.DB.outputs || [];
    // campaign / 红人 下拉选项
    const campOpts = C.DB.campaigns.map(c=>`<option value="${c.id}" ${fCampaign===c.id?'selected':''}>${C.esc(c.name)}</option>`).join('');
    const infOpts  = C.DB.influencers.filter(i=>outs.some(o=>o.infId===i.id))
      .map(i=>`<option value="${i.id}" ${fInfluencer===i.id?'selected':''}>${C.esc(i.handle)}</option>`).join('');

    el.innerHTML = `
      <div class="out-toolbar">
        <div class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
          <input id="outSearch" placeholder="搜索产出标题 / 红人..." value="${C.esc(fSearch)}"></div>
        <select class="filter" id="outFilterCamp"><option value="">全部 Campaign</option>${campOpts}</select>
        <select class="filter" id="outFilterInf"><option value="">全部红人</option>${infOpts}</select>
        <span class="muted" style="font-size:12px;margin-left:auto">共 ${outs.length} 条产出</span>
      </div>
      <div id="outList"></div>`;

    $('#outSearch').oninput   = e=>{ fSearch=e.target.value; renderList(); };
    $('#outFilterCamp').onchange = e=>{ fCampaign=e.target.value; renderList(); };
    $('#outFilterInf').onchange  = e=>{ fInfluencer=e.target.value; renderList(); };
    renderList();
  }

  function filtered(){
    const q=fSearch.toLowerCase();
    return (C.DB.outputs||[]).filter(o=>{
      if(fCampaign && o.campId!==fCampaign) return false;
      if(fInfluencer && o.infId!==fInfluencer) return false;
      if(q){ const inf=C.getInf(o.infId); const hay=(o.title+' '+(inf?inf.handle:'')).toLowerCase(); if(!hay.includes(q)) return false; }
      return true;
    }).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  }

  function renderList(){
    const box=$('#outList'); const list=filtered();
    if(!list.length){ box.innerHTML=`<div class="empty"><div class="big">🎬</div>暂无视频产出记录。${(C.DB.outputs||[]).length?'试试调整筛选条件':'点击右上角「新增产出」开始'}</div>`; return; }
    box.innerHTML = list.map(o=>outCard(o)).join('');
    bindCardEvents(box);
  }

  /* ====================== 产出卡片 ====================== */
  function outCard(o){
    const inf=C.getInf(o.infId); const camp=o.campId?C.getCamp(o.campId):null;
    const m=o.metrics||{};
    const drafts=o.drafts||{};
    const stageHtml = DRAFT_KEYS.map(d=>{
      const dr=drafts[d.key];
      const filled=dr && (dr.url||dr.name||dr.text);
      let src='';
      if(dr){
        if(dr.type==='link'&&dr.url) src=`<a href="${C.esc(dr.url)}" target="_blank" class="sb-src">🔗 ${C.esc(dr.url)}</a>`;
        else if(dr.type==='file'&&dr.name) src=`<span class="sb-src">📄 ${C.esc(dr.name)}</span>`;
        else if(dr.text) src=`<span class="muted" style="font-size:12px">已录入文本</span>`;
      }
      const ai = dr&&dr.summary ? `<div class="sb-ai">${C.esc(dr.summary)}</div>` : (filled?`<div class="sb-ai muted">尚未生成 AI 摘要</div>`:'');
      return `<div class="stage-box">
        <div class="sb-h">${d.label}<span class="sb-state ${filled?'done':'empty'}">${filled?'已上传':'待上传'}</span></div>
        ${src||'<span class="muted" style="font-size:12px">—</span>'}
        ${ai}
      </div>`;
    }).join('');

    const rv=o.review||{status:'pending'}; const ro=reviewObj(rv.status);
    const reviewHtml=`<div class="review-box">
      <div class="rb-h">📝 审核反馈 <span class="review-tag ${ro.cls}">${ro.label}</span></div>
      <div>${rv.feedback?C.esc(rv.feedback):'<span class="muted">暂无审核意见</span>'}</div>
      ${rv.by?`<div class="muted" style="font-size:11px;margin-top:4px">— ${C.esc(rv.by)}${rv.at?' · '+C.esc(rv.at):''}</div>`:''}
    </div>`;

    const fetched = m.fetchedAt;
    const metricsHtml=`<div class="metrics-bar">
      <span class="pub-link">${o.publishUrl?`🌐 <a href="${C.esc(o.publishUrl)}" target="_blank">${C.esc(o.publishUrl)}</a>`:'<span class="muted">未填写发布链接</span>'}</span>
      <div class="metric"><div class="mv">${m.publishDate?C.esc(m.publishDate):'—'}</div><div class="ml">发布日期</div></div>
      <div class="metric live"><div class="mv">${m.views!=null&&m.views!==0?C.fmt(m.views):'—'}</div><div class="ml">播放量</div></div>
      <div class="metric live"><div class="mv">${m.likes!=null&&m.likes!==0?C.fmt(m.likes):'—'}</div><div class="ml">点赞数</div></div>
      <div class="metric live"><div class="mv">${m.comments!=null&&m.comments!==0?C.fmt(m.comments):'—'}</div><div class="ml">评论数</div></div>
      <button class="btn-refresh" data-refresh="${o.id}" ${o.publishUrl?'':'disabled title=请先填写发布链接'}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        刷新爬虫数据
      </button>
      ${fetched?`<span class="muted" style="font-size:11px">上次抓取：${C.esc(fetched)}</span>`:'<span class="muted" style="font-size:11px">尚未抓取（模拟爬虫·Demo）</span>'}
    </div>`;

    return `<div class="out-card" data-card="${o.id}">
      <div class="oc-head">
        <div class="avatar">${C.esc(C.initials(inf?inf.handle:'?'))}</div>
        <div style="flex:1;min-width:0">
          <div class="oc-title">${C.esc(o.title||'未命名产出')}</div>
          <div class="oc-meta">
            <span>👤 ${C.esc(inf?inf.handle:'未知红人')}</span>
            ${camp?`<span class="chip-camp">🎯 ${C.esc(camp.name)}</span>`:'<span class="muted">未关联 Campaign</span>'}
            <span>· ${C.esc(o.createdAt||'')}</span>
          </div>
        </div>
        <span data-stop>
          <button class="icon-btn" data-edit="${o.id}" title="编辑">✎</button>
          <button class="icon-btn" data-del="${o.id}" title="删除" style="margin-left:4px">🗑</button>
        </span>
      </div>
      <div class="stage-track">${stageHtml}</div>
      ${reviewHtml}
      ${metricsHtml}
    </div>`;
  }

  function bindCardEvents(box){
    $$('[data-edit]',box).forEach(b=>b.onclick=()=>form(b.dataset.edit));
    $$('[data-del]',box).forEach(b=>b.onclick=()=>delOutput(b.dataset.del));
    $$('[data-refresh]',box).forEach(b=>{ if(!b.disabled) b.onclick=()=>runScraper(b.dataset.refresh,b); });
  }

  /* ====================== 新增 / 编辑 产出 表单 ====================== */
  function form(id, presetInfId){
    const edit = !!id;
    const o = edit ? C.getOutput(id) : null;
    const v = o || {title:'',infId:presetInfId||'',campId:'',publishUrl:'',
      drafts:{v1:{},v2:{},final:{}}, review:{status:'pending',feedback:'',by:''}, metrics:{}};

    const infOpts = C.DB.influencers.map(i=>`<option value="${i.id}" ${v.infId===i.id?'selected':''}>${C.esc(i.handle)}${i.realname?' · '+C.esc(i.realname):''}</option>`).join('');
    const campOpts= C.DB.campaigns.map(c=>`<option value="${c.id}" ${v.campId===c.id?'selected':''}>${C.esc(c.name)}</option>`).join('');

    const draftField = (dk)=>{
      const d=(v.drafts&&v.drafts[dk.key])||{};
      const type=d.type||'link';
      return `<div class="field full draft-field" data-draft="${dk.key}">
        <label>${dk.label}（上传 Word/PDF 或填链接）</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
          <select class="filter draft-type" style="max-width:120px"><option value="link" ${type==='link'?'selected':''}>链接</option><option value="file" ${type==='file'?'selected':''}>上传文件</option></select>
          <input class="draft-url" placeholder="https:// 内容链接（Google Doc / Notion / YouTube 等）" value="${C.esc(d.url||'')}" style="flex:1;min-width:160px;${type==='file'?'display:none':''}">
          <div class="draft-file-wrap" style="${type==='link'?'display:none':''};flex:1;min-width:160px">
            <input type="file" class="draft-file" accept=".doc,.docx,.pdf,.txt,.md">
            ${d.name?`<span class="muted" style="font-size:11px">已存：${C.esc(d.name)}</span>`:''}
          </div>
        </div>
        <textarea class="draft-text" placeholder="或直接粘贴文稿正文（用于 AI 摘要分析）..." style="min-height:54px">${C.esc(d.text||'')}</textarea>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <button type="button" class="btn-refresh draft-ai">✨ AI 分析提炼</button>
          <span class="draft-ai-out muted" style="font-size:11px;flex:1">${d.summary?C.esc(d.summary):'上传/粘贴内容后点击「AI 分析提炼」自动生成摘要'}</span>
        </div>
      </div>`;
    };

    const rv=v.review||{status:'pending'};
    C.openModal(`${edit?'编辑':'新增'}视频产出`, `
      <div class="form-grid">
        <div class="field full"><label>产出标题 <span class="req">*</span></label><input id="o_title" value="${C.esc(v.title)}" placeholder="如：Garmin 新款码表深度评测"></div>
        <div class="field"><label>关联红人 <span class="req">*</span></label><select id="o_inf"><option value="">选择红人...</option>${infOpts}</select></div>
        <div class="field"><label>关联 Campaign</label><select id="o_camp"><option value="">不关联</option>${campOpts}</select></div>
        ${draftField(DRAFT_KEYS[0])}
        ${draftField(DRAFT_KEYS[1])}
        ${draftField(DRAFT_KEYS[2])}
        <div class="field"><label>审核状态</label><select id="o_review_status">${REVIEW_STATES.map(r=>`<option value="${r.key}" ${rv.status===r.key?'selected':''}>${r.label}</option>`).join('')}</select></div>
        <div class="field"><label>审核人</label><input id="o_review_by" value="${C.esc(rv.by||'')}" placeholder="如：品牌方 / 运营"></div>
        <div class="field full"><label>审核反馈意见</label><textarea id="o_review_fb" placeholder="审核意见、修改要求...">${C.esc(rv.feedback||'')}</textarea></div>
        <div class="field full"><label>发布链接（手动填入，用于爬虫抓取数据）</label><input id="o_puburl" value="${C.esc(v.publishUrl||'')}" placeholder="https:// 视频/文章发布地址"></div>
      </div>
    `, `<button class="btn ghost" onclick="window.__crm.closeModal()">取消</button><button class="btn primary" id="saveOut">${edit?'保存修改':'添加产出'}</button>`);

    // 绑定每个 draft 字段的交互
    $$('.draft-field').forEach(ff=>{
      const typeSel=$('.draft-type',ff), urlIn=$('.draft-url',ff), fileWrap=$('.draft-file-wrap',ff), aiBtn=$('.draft-ai',ff), aiOut=$('.draft-ai-out',ff), txt=$('.draft-text',ff);
      typeSel.onchange=()=>{ const t=typeSel.value; urlIn.style.display=t==='link'?'':'none'; fileWrap.style.display=t==='file'?'':'none'; };
      // 文件选择后读取文本
      const fileIn=$('.draft-file',ff);
      fileIn.onchange=()=>{ const f=fileIn.files[0]; if(!f) return; ff.dataset.fileName=f.name;
        readFileText(f).then(text=>{ if(text){ txt.value=text.slice(0,4000); C.toast('已读取文件文本，可点击 AI 分析'); } else { C.toast('该文件类型无法在浏览器解析全文，请粘贴正文或填链接',false); } });
      };
      aiBtn.onclick=()=>{ const content=txt.value.trim(); if(!content){ C.toast('请先上传/粘贴文稿正文',false); return; }
        aiOut.textContent='AI 分析中...'; setTimeout(()=>{ const s=aiSummarize(content, ff.dataset.draft); aiOut.textContent=s; ff.dataset.summary=s; C.toast('AI 摘要已生成'); }, 600);
      };
    });

    $('#saveOut').onclick=()=>{
      const title=$('#o_title').value.trim(); const infId=$('#o_inf').value;
      if(!title){ C.toast('请填写产出标题',false); return; }
      if(!infId){ C.toast('请选择关联红人',false); return; }
      const drafts={};
      $$('.draft-field').forEach(ff=>{
        const key=ff.dataset.draft; const type=$('.draft-type',ff).value;
        const url=$('.draft-url',ff).value.trim(); const text=$('.draft-text',ff).value.trim();
        const name=ff.dataset.fileName || ((v.drafts&&v.drafts[key]&&v.drafts[key].name)||'');
        const prev=(v.drafts&&v.drafts[key])||{};
        const summary=ff.dataset.summary || prev.summary || '';
        drafts[key]={type, url:type==='link'?url:'', name:type==='file'?name:'', text, summary, analyzedAt:summary?C.today():(prev.analyzedAt||'')};
      });
      const data={
        title, infId, campId:$('#o_camp').value,
        drafts,
        review:{status:$('#o_review_status').value, feedback:$('#o_review_fb').value.trim(), by:$('#o_review_by').value.trim(), at:C.today()},
        publishUrl:$('#o_puburl').value.trim(),
        metrics: (o&&o.metrics) || {}
      };
      if(edit){ Object.assign(o,data); C.toast('已保存修改'); }
      else { C.DB.outputs.unshift({id:C.uid('out'),createdAt:C.today(),...data}); C.toast('已添加产出'); }
      C.save(); C.closeModal();
      C.refreshOutputsIfActive(); C.refreshDashboardIfActive();
    };
  }

  function delOutput(id){
    const o=C.getOutput(id); if(!o) return;
    C.openConfirm(`确认删除产出「${C.esc(o.title)}」？`,'该操作不可撤销。',()=>{
      C.DB.outputs=C.DB.outputs.filter(x=>x.id!==id); C.save(); C.closeModal();
      C.refreshOutputsIfActive(); C.refreshDashboardIfActive(); C.toast('已删除产出');
    });
  }

  /* ====================== AI 分析（启发式文本提炼） ====================== */
  function aiSummarize(text, draftKey){
    const label = (DRAFT_KEYS.find(d=>d.key===draftKey)||{}).label || '稿件';
    const clean=text.replace(/\s+/g,' ').trim();
    // 句子切分
    const sents=clean.split(/(?<=[。！？!?.])\s*/).filter(s=>s.length>4);
    const wordCount=clean.length;
    // 关键词提取（按词频，过滤停用词）
    const stop=new Set(['的','了','和','与','在','是','我','你','他','这','那','也','就','都','而','及','或','一个','可以','进行','以及','通过','对于','the','a','an','and','or','of','to','in','on','for','is','are','this','that','with','as']);
    const tokens=clean.toLowerCase().match(/[a-z]{3,}|[\u4e00-\u9fa5]{2,4}/g)||[];
    const freq={}; tokens.forEach(t=>{ if(!stop.has(t)) freq[t]=(freq[t]||0)+1; });
    const keys=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,5).map(e=>e[0]);
    // 取前两句作为核心内容
    const lead=sents.slice(0,2).join(' ').slice(0,90);
    return `【AI 摘要·${label}】核心内容：${lead}${lead.length>=90?'…':''} 关键词：${keys.join('、')||'—'}。全文约 ${wordCount} 字${sents.length?`，${sents.length} 句`:''}。`;
  }

  /* ====================== 模拟爬虫（发布数据抓取） ====================== */
  // 说明：纯前端无后端，浏览器受跨域(CORS)限制无法真实抓取第三方平台数据。
  // 此处实现「模拟爬虫」：根据发布链接确定性生成合理的发布日期/播放/点赞/评论，
  // 每次刷新会带轻微波动以模拟数据增长，并记录抓取时间。生产环境应替换为后端爬虫接口。
  function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return Math.abs(h); }
  function runScraper(id, btn){
    const o=C.getOutput(id); if(!o||!o.publishUrl) return;
    btn.classList.add('spin'); const old=btn.innerHTML;
    btn.innerHTML=btn.innerHTML.replace('刷新爬虫数据','抓取中...');
    setTimeout(()=>{
      const h=hashStr(o.publishUrl);
      const url=o.publishUrl.toLowerCase();
      // 不同平台量级不同
      let base=20000; if(url.includes('youtube')||url.includes('youtu.be')) base=120000;
      else if(url.includes('tiktok')) base=300000; else if(url.includes('instagram')) base=60000;
      else if(url.includes('bilibili')) base=80000;
      const prev=o.metrics||{};
      const grow = prev.views ? 1 + ((h%7)+1)/100 : 1; // 已有数据则模拟增长 1%-7%
      const views = prev.views ? Math.round(prev.views*grow) : base + (h%base);
      const likes = Math.round(views*(0.03 + (h%50)/1000));      // 3%-8% 点赞率
      const comments = Math.round(likes*(0.04 + (h%30)/1000));   // 评论约为点赞 4%-7%
      // 发布日期：首次抓取时确定，之后保持
      let publishDate=prev.publishDate;
      if(!publishDate){ const d=new Date(); d.setDate(d.getDate()-(h%45)); publishDate=d.toISOString().slice(0,10); }
      o.metrics={publishDate, views, likes, comments, fetchedAt:fmtNow()};
      C.save();
      btn.classList.remove('spin'); btn.innerHTML=old;
      C.toast('已刷新爬虫数据（模拟）');
      C.refreshOutputsIfActive(); C.refreshDashboardIfActive();
      // 若在红人详情里刷新，重渲染该红人产出区
      const sec=document.querySelector('#infOutputsSection[data-inf]');
      if(sec) renderForInfluencer('#infOutputsSection', sec.dataset.inf);
    }, 900);
  }
  function fmtNow(){ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }

  /* ====================== 文件文本读取 ====================== */
  function readFileText(file){
    return new Promise(resolve=>{
      const name=file.name.toLowerCase();
      // 纯文本类直接读
      if(name.endsWith('.txt')||name.endsWith('.md')){
        const r=new FileReader(); r.onload=()=>resolve(r.result||''); r.onerror=()=>resolve(''); r.readAsText(file); return;
      }
      // docx：解压 word/document.xml 取文本（轻量实现，无第三方库则降级）
      if(name.endsWith('.docx')){
        // 浏览器无内置解压，尝试以文本粗读（多数为乱码）→ 降级提示
        resolve(''); return;
      }
      // pdf / doc：浏览器无法直接解析全文 → 降级
      resolve('');
    });
  }

  /* ====================== 红人详情内：关联产出展示（按 Campaign 筛选） ====================== */
  function renderForInfluencer(sel, infId){
    const host=document.querySelector(sel); if(!host) return;
    host.dataset.inf=infId;
    const all=C.outputsOf(infId);
    // 该红人涉及的 campaign 列表
    const camps=[...new Set(all.map(o=>o.campId).filter(Boolean))].map(cid=>C.getCamp(cid)).filter(Boolean);
    const cur = host.dataset.campFilter||'';
    const list = cur ? all.filter(o=>o.campId===cur) : all;

    const filterBar = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <span class="k muted" style="font-size:11px;font-weight:600">视频产出（${all.length}）</span>
      ${camps.length?`<select class="filter inf-out-campfilter" style="max-width:200px;margin-left:auto">
        <option value="">全部 Campaign</option>
        ${camps.map(c=>`<option value="${c.id}" ${cur===c.id?'selected':''}>${C.esc(c.name)}</option>`).join('')}
      </select>`:''}
    </div>`;

    const body = list.length ? `<div class="inf-out-list">`+list.map(o=>{
      const camp=o.campId?C.getCamp(o.campId):null; const m=o.metrics||{};
      const done=DRAFT_KEYS.filter(d=>{const dr=(o.drafts||{})[d.key];return dr&&(dr.url||dr.name||dr.text);}).length;
      const ro=reviewObj((o.review||{}).status);
      return `<div class="inf-out-item">
        <div class="ioi-h"><span>🎬 ${C.esc(o.title)}</span><span class="review-tag ${ro.cls}">${ro.label}</span></div>
        <div class="ioi-sub">
          ${camp?`<span class="chip-camp" style="padding:1px 8px;border-radius:10px;background:#e7edfe;color:#2a4bd0;font-weight:700">${C.esc(camp.name)}</span>`:'<span>未关联 Campaign</span>'}
          <span>稿件 ${done}/3</span>
          ${m.publishDate?`<span>📅 ${C.esc(m.publishDate)}</span>`:''}
          ${m.views?`<span>▶ ${C.fmt(m.views)}</span>`:''}
          ${m.likes?`<span>👍 ${C.fmt(m.likes)}</span>`:''}
          ${m.comments?`<span>💬 ${C.fmt(m.comments)}</span>`:''}
          <button class="link-mini" data-open-out="${o.id}" style="background:none;border:none;color:var(--accent);font-weight:700;cursor:pointer;font-size:11px;margin-left:auto">查看/编辑 ↗</button>
        </div>
      </div>`;
    }).join('')+`</div>` : '<div class="muted" style="margin-top:6px">该红人暂无视频产出记录</div>';

    host.innerHTML = filterBar + body;
    const cf=host.querySelector('.inf-out-campfilter');
    if(cf) cf.onchange=()=>{ host.dataset.campFilter=cf.value; renderForInfluencer(sel,infId); };
    $$('[data-open-out]',host).forEach(b=>b.onclick=()=>{ C.closeModal(); setTimeout(()=>form(b.dataset.openOut),60); });
  }

  /* ====================== 注册模块 ====================== */
  window.__outputsModule = { render, form, renderForInfluencer };
  // 若当前已在 outputs 视图（刷新场景），主动渲染一次
  if(document.querySelector('#view-outputs.active')) render();
})();
