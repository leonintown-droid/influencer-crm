/* ============================================================
   app-email.js · 外联邮件（功能1）
   在红人详情弹窗内挂载：邮件模板选择 + 占位符渲染 + Gmail 发送 + 往来时间线 + 同步回复
   依赖 window.__crmCore（getInf/esc/toast）与 window.__auth（apiGet/apiPost）
   ============================================================ */
(function(){
  'use strict';
  function C(){ return window.__crmCore||{}; }
  function esc(s){ const f=C().esc; return f?f(s):String(s==null?'':s); }
  function toast(m,ok){ const f=C().toast; if(f) f(m,ok); }
  function api(){ return window.__auth||{}; }
  function getInf(id){ const f=C().getInf; return f?f(id):null; }

  async function mount(sel,infId){
    const host=document.querySelector(sel); if(!host) return;
    const inf=getInf(infId)||{};
    host.innerHTML=`<div class="k muted" style="font-size:11px;font-weight:600">外联邮件 Outreach</div>
      <div id="emWrap" style="margin-top:8px"></div>`;
    const wrap=host.querySelector('#emWrap');
    let templates=[];
    try{ templates=await api().apiGet('/api/email/templates'); }catch(_){ templates=[]; }

    wrap.innerHTML=`
      <div class="panel" style="padding:12px">
        <div class="form-grid" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>收件人</label><input id="emTo" value="${esc(inf.email||'')}" placeholder="该红人未填写邮箱"></div>
          <div class="field"><label>选择模板（按真名生成）</label>
            <select id="emTpl"><option value="">— 选择模板 —</option>${templates.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field full"><label>主题</label><input id="emSub" placeholder="邮件主题，支持 {{本名}} {{平台}} {{我的名字}}"></div>
        <div class="field full"><label>正文</label><textarea id="emBody" rows="6" placeholder="正文，支持占位符 {{本名}} 等，将按红人真名自动替换"></textarea></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn" id="emPreview">👁 预览渲染</button>
          <button class="btn primary" id="emSend">✉ 发送邮件</button>
          <button class="btn ghost" id="emManageTpl">＋ 新建模板</button>
          <button class="btn ghost" id="emSync">↻ 同步回复</button>
          <span class="muted" id="emHint" style="font-size:11px"></span>
        </div>
      </div>
      <div style="margin-top:14px"><div class="k muted" style="font-size:11px;font-weight:600">往来时间线</div>
        <div id="emTimeline" style="margin-top:6px"></div></div>`;

    const $=s=>wrap.querySelector(s);
    // 选模板即拉预览填充
    $('#emTpl').onchange=async e=>{
      const tid=e.target.value; if(!tid) return;
      try{
        const p=await api().apiPost('/api/email/preview',{templateId:tid,infId});
        $('#emSub').value=p.subject||''; $('#emBody').value=p.body||'';
        if(p.to&&!$('#emTo').value) $('#emTo').value=p.to;
      }catch(ex){ toast('预览失败：'+ex.message,false); }
    };
    $('#emPreview').onclick=async()=>{
      try{
        const p=await api().apiPost('/api/email/preview',{infId,subject:$('#emSub').value,body:$('#emBody').value});
        $('#emSub').value=p.subject||''; $('#emBody').value=p.body||'';
        toast('已按红人真名渲染占位符');
      }catch(ex){ toast('预览失败：'+ex.message,false); }
    };
    $('#emSend').onclick=async()=>{
      if(!$('#emTo').value){ toast('请先填写收件人邮箱（可在「编辑」里补充）',false); return; }
      if(!$('#emSub').value&&!$('#emBody').value){ toast('主题或正文不能为空',false); return; }
      $('#emSend').disabled=true; $('#emHint').textContent='发送中…';
      try{
        const r=await api().apiPost('/api/email/send',{infId,subject:$('#emSub').value,body:$('#emBody').value});
        if(r.sent){ toast('邮件已通过 Gmail 发送'); }
        else{ toast('已记录邮件（Gmail 未授权，标记为待手动发送）'); }
        $('#emBody').value=''; $('#emSub').value=''; $('#emTpl').value='';
        // 同步推进的红人状态进前端 DB
        const core=window.__crmCore; if(core&&core.DB){ const it=core.DB.influencers.find(x=>x.id===infId); if(it&&it.status==='prospect') it.status='contacted'; }
        await renderTimeline();
      }catch(ex){ toast('发送失败：'+ex.message,false); }
      finally{ $('#emSend').disabled=false; $('#emHint').textContent=''; }
    };
    $('#emSync').onclick=async()=>{
      $('#emHint').textContent='同步中…';
      try{ const r=await api().apiPost('/api/email/sync',{infId});
        toast(r.synced?`已同步 ${r.synced} 封新邮件`:(r.note||'暂无新邮件'));
        await renderTimeline();
      }catch(ex){ toast('同步失败：'+ex.message,false); }
      finally{ $('#emHint').textContent=''; }
    };
    $('#emManageTpl').onclick=()=>openTplForm(()=>mount(sel,infId));

    async function renderTimeline(){
      const tl=$('#emTimeline'); if(!tl) return;
      let list=[];
      try{ list=await api().apiGet('/api/email/threads?infId='+encodeURIComponent(infId)); }catch(_){ list=[]; }
      if(!list.length){ tl.innerHTML=`<div class="muted" style="font-size:12px">尚无往来邮件。选择模板 → 发送，即可开始记录沟通链。</div>`; return; }
      tl.innerHTML=list.map(e=>{
        const out=e.direction==='out';
        return `<div class="member-row" style="align-items:flex-start;border-left:3px solid ${out?'#3b6cff':'#1a9d5a'};padding-left:10px;margin-bottom:8px">
          <div style="flex:1">
            <div class="mname">${out?'↗ 发出':'↘ 收到'} · ${esc(e.subject||'(无主题)')} <span class="badge" style="font-size:10px">${esc(e.status||'')}</span></div>
            <div class="mhandle" style="white-space:pre-wrap">${esc(e.snippet||'')}</div>
            <div class="muted" style="font-size:10px">${esc((e.senderName||'')+' · '+(e.ts||'').slice(0,16).replace('T',' '))}</div>
          </div>
        </div>`;
      }).join('');
    }
    renderTimeline();
  }

  function openTplForm(after){
    const core=window.__crmCore; if(!core||!core.openModal) return;
    core.openModal('新建邮件模板', `
      <div class="field full"><label>模板名称</label><input id="tpName" placeholder="如：YouTube 首次外联"></div>
      <div class="field full"><label>主题模板</label><input id="tpSub" placeholder="Hi {{本名}}, collaboration with our brand"></div>
      <div class="field full"><label>正文模板</label><textarea id="tpBody" rows="8" placeholder="Hi {{本名}},

We love your {{平台}} content...

Best,
{{我的名字}}"></textarea></div>
      <div class="muted" style="font-size:11px">可用占位符：{{本名}} {{handle}} {{平台}} {{我的名字}}</div>
    `, `<button class="btn ghost" onclick="window.__crm.closeModal()">取消</button><button class="btn primary" id="tpSave">保存模板</button>`);
    document.getElementById('tpSave').onclick=async()=>{
      const name=document.getElementById('tpName').value.trim();
      const subject=document.getElementById('tpSub').value;
      const body=document.getElementById('tpBody').value;
      if(!name){ toast('请填写模板名称',false); return; }
      try{ await api().apiPost('/api/email/templates',{name,subject,body});
        toast('模板已保存'); core.closeModal(); if(after) after();
      }catch(ex){ toast('保存失败：'+ex.message,false); }
    };
  }

  window.__emailModule={ mount, openTplForm };
})();
