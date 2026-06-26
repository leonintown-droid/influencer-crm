/* ============================================================
   app-export.js · 导出红人库 + 产出数据到飞书多维表格（功能7）
   配置了 EXPORT_BASE_TOKEN/表 id → 真实写入；否则降级生成 CSV 供下载导入飞书。
   ============================================================ */
(function(){
  'use strict';
  function api(){ return window.__auth||{}; }
  function toast(m,ok){ const t=window.__crmCore&&window.__crmCore.toast; if(t) t(m,ok); }

  function init(){
    const host=document.getElementById('exportHost');
    if(!host||host.dataset.init) return;
    host.dataset.init='1';
    host.innerHTML=`<button class="au-btn" id="btnExportFeishu" title="导出红人库与产出数据到飞书多维表格" style="font-size:12px">📤 导出到飞书</button>`;
    host.querySelector('#btnExportFeishu').onclick=doExport;
  }

  async function doExport(){
    const btn=document.getElementById('btnExportFeishu');
    btn.disabled=true; const old=btn.textContent; btn.textContent='导出中…';
    try{
      const r=await api().apiPost('/api/export',{});
      if(r.mode==='feishu'){
        showResult(`已写入飞书多维表格：红人 ${r.influencers} 条、产出 ${r.outputs} 条。`,
          [{label:'打开飞书 Base ↗',href:r.baseUrl}]);
        toast('已导出到飞书 Base');
      }else{
        showResult(`未配置飞书导出凭证，已生成 CSV 文件（红人 ${r.influencers} 条、产出 ${r.outputs} 条），可下载后导入飞书多维表格。`,
          (r.files||[]).map((f,i)=>({label:i===0?'下载 红人库.csv':'下载 产出数据.csv',href:f,download:true})));
        toast('已生成导出 CSV');
      }
    }catch(e){ toast('导出失败：'+e.message,false); }
    finally{ btn.disabled=false; btn.textContent=old; }
  }

  function showResult(msg,links){
    const core=window.__crmCore; if(!core||!core.openModal){ alert(msg); return; }
    const linkHtml=links.map(l=>`<a class="btn primary" style="margin-right:8px;text-decoration:none" href="${l.href}" ${l.download?'download':'target="_blank"'}>${l.label}</a>`).join('');
    core.openModal('导出到飞书多维表格', `
      <p style="font-size:13px;line-height:1.7">${msg}</p>
      <div style="margin-top:14px">${linkHtml}</div>
      <div class="muted" style="font-size:11px;margin-top:14px">提示：真实写入飞书 Base 需在 server/.env 配置 FEISHU_APP_ID/SECRET、EXPORT_BASE_TOKEN 及 EXPORT_TABLE_INFLUENCERS / EXPORT_TABLE_OUTPUTS 表 ID；未配置时自动降级为 CSV 导出。</div>
    `, `<button class="btn ghost" onclick="window.__crm.closeModal()">关闭</button>`);
  }

  // 登录后由 afterLogin 钩子触发 init；同时自管一次延迟初始化兜底
  window.__exportModule={ init };
  document.addEventListener('DOMContentLoaded',()=>setTimeout(init,1200));
})();
