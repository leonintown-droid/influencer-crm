/* ============================================================
   app-auth.js · 多用户登录 / 会话 / 权限（功能3）
   提供 window.__auth.ensureLogin() / afterLogin() 给 app.js 启动序列调用。
   ============================================================ */
(function(){
  'use strict';
  let USER = null;

  function api(path, opts){
    return fetch(path, Object.assign({credentials:'same-origin'}, opts||{}))
      .then(async r=>{ const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||(path+' '+r.status)); return d; });
  }
  const apiGet  = p=>api(p);
  const apiPost = (p,b)=>api(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});

  /* ---------- 登录遮罩 ---------- */
  function injectStyle(){
    if(document.getElementById('authStyle')) return;
    const s=document.createElement('style'); s.id='authStyle';
    s.textContent=`
      #authOverlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
        background:linear-gradient(135deg,#f4f6fb 0%,#e9eef7 100%)}
      #authOverlay .auth-card{width:360px;max-width:90vw;background:#fff;border:1px solid var(--rule,#e6e8ee);
        border-radius:16px;padding:32px 28px;box-shadow:0 20px 60px rgba(20,30,60,.12)}
      #authOverlay .auth-logo{width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:22px;color:#fff;background:linear-gradient(135deg,#3b6cff,#6a4dff);margin-bottom:16px}
      #authOverlay h2{font-size:20px;font-weight:700;margin:0 0 4px}
      #authOverlay .sub{color:var(--muted,#8a90a2);font-size:12px;margin-bottom:22px}
      #authOverlay label{display:block;font-size:12px;font-weight:600;color:#4a5066;margin:14px 0 6px}
      #authOverlay input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid var(--rule,#e6e8ee);
        border-radius:10px;font-size:14px;outline:none}
      #authOverlay input:focus{border-color:#3b6cff;box-shadow:0 0 0 3px rgba(59,108,255,.12)}
      #authOverlay .auth-btn{width:100%;margin-top:22px;padding:12px;border:none;border-radius:10px;cursor:pointer;
        font-size:15px;font-weight:600;color:#fff;background:linear-gradient(135deg,#3b6cff,#6a4dff)}
      #authOverlay .auth-btn:disabled{opacity:.6;cursor:default}
      #authOverlay .auth-err{color:#e1483b;font-size:12px;margin-top:12px;min-height:15px}
      #authOverlay .auth-hint{margin-top:18px;font-size:11px;color:var(--muted,#8a90a2);text-align:center}
      /* 顶栏用户区 */
      .au-user{display:flex;align-items:center;gap:10px;flex-shrink:0;padding-left:10px;margin-left:4px;border-left:1px solid var(--rule,#e6e8ee)}
      .au-user>div{flex-shrink:0}
      .au-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#5b7cff,#0ec4a3);
        color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;box-shadow:0 2px 6px rgba(91,124,255,.28)}
      .au-name{font-size:13px;font-weight:700;line-height:1.15;white-space:nowrap}
      .au-role{font-size:10px;color:var(--muted,#8a90a2);white-space:nowrap}
      .au-btn{padding:7px 12px;border:1px solid var(--rule,#e6e8ee);background:#fff;border-radius:9px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;flex-shrink:0;transition:.15s}
      .au-btn:hover{background:#f4f6fb;border-color:var(--accent,#5b7cff);color:var(--accent,#5b7cff)}
    `;
    document.head.appendChild(s);
  }

  function showLogin(){
    injectStyle();
    return new Promise(resolve=>{
      const ov=document.createElement('div'); ov.id='authOverlay';
      ov.innerHTML=`
        <form class="auth-card" id="authForm" autocomplete="on">
          <div class="auth-logo">i</div>
          <h2>登录红人营销 CRM</h2>
          <div class="sub">10 人团队协同 · 请使用账号登录</div>
          <label>用户名</label>
          <input id="auUser" name="username" autocomplete="username" placeholder="用户名" autofocus>
          <label>密码</label>
          <input id="auPass" name="password" type="password" autocomplete="current-password" placeholder="密码">
          <button class="auth-btn" id="auSubmit" type="submit">登 录</button>
          <div class="auth-err" id="auErr"></div>
          <div class="auth-hint">首次使用默认管理员：admin / admin123（请尽快修改）</div>
        </form>`;
      document.body.appendChild(ov);
      const form=ov.querySelector('#authForm');
      const err=ov.querySelector('#auErr');
      const btn=ov.querySelector('#auSubmit');
      form.onsubmit=async e=>{
        e.preventDefault();
        err.textContent=''; btn.disabled=true; btn.textContent='登录中…';
        try{
          const r=await apiPost('/api/auth/login',{
            username:ov.querySelector('#auUser').value.trim(),
            password:ov.querySelector('#auPass').value
          });
          USER=r.user; ov.remove(); resolve(USER);
        }catch(ex){
          err.textContent=ex.message||'登录失败'; btn.disabled=false; btn.textContent='登 录';
        }
      };
    });
  }

  /* ---------- 对外：启动前确保已登录 ---------- */
  async function ensureLogin(){
    try{
      const r=await apiGet('/api/auth/me');
      USER=r.user; return USER;
    }catch(e){
      // 未登录 → 弹出登录页，登录成功后返回用户
      return await showLogin();
    }
  }

  /* ---------- 对外：登录后渲染顶栏用户区 ---------- */
  function afterLogin(){
    if(!USER) return;
    renderTopUser();
    initNotify();
    if(window.__exportModule && window.__exportModule.init) window.__exportModule.init();
  }

  /* ---------- 站内通知 铃铛（功能2）---------- */
  let _notifTimer=null, _notifs=[];
  function initNotify(){
    const host=document.getElementById('notifyHost');
    if(!host) return;
    if(!host.dataset.init){
      host.dataset.init='1';
      host.innerHTML=`
        <button class="au-btn" id="notifBell" style="position:relative;font-size:16px;padding:6px 10px">🔔
          <span id="notifBadge" style="display:none;position:absolute;top:-4px;right:-4px;background:#e1483b;color:#fff;border-radius:10px;font-size:10px;line-height:1;padding:2px 5px;font-weight:700"></span>
        </button>
        <div id="notifPanel" style="display:none;position:absolute;right:0;top:42px;width:340px;max-height:60vh;overflow:auto;background:#fff;border:1px solid var(--rule,#e6e8ee);border-radius:12px;box-shadow:0 16px 48px rgba(20,30,60,.16);z-index:500"></div>`;
      const bell=host.querySelector('#notifBell');
      const panel=host.querySelector('#notifPanel');
      bell.onclick=()=>{ panel.style.display=panel.style.display==='none'?'block':'none'; if(panel.style.display==='block') renderNotifPanel(); };
      document.addEventListener('click',e=>{ if(!host.contains(e.target)) panel.style.display='none'; });
    }
    loadNotifs();
    if(_notifTimer) clearInterval(_notifTimer);
    _notifTimer=setInterval(loadNotifs,60000);
  }
  async function loadNotifs(){
    try{ _notifs=await apiGet('/api/notifications'); }catch(_){ _notifs=[]; }
    const unread=_notifs.filter(n=>!n.read).length;
    const badge=document.getElementById('notifBadge');
    if(badge){ if(unread){ badge.style.display='block'; badge.textContent=unread>99?'99+':unread; } else badge.style.display='none'; }
    const panel=document.getElementById('notifPanel');
    if(panel&&panel.style.display==='block') renderNotifPanel();
    // 暴露风险红人集合，供红人卡片显示风险旗标
    window.__riskSet=new Set(_notifs.filter(n=>n.type==='sla'&&!n.read&&n.refId).map(n=>n.refId));
    // 通知红人库重渲染旗标（若当前在该视图）
    if(window.__crmCore&&window.__crmCore.refreshInfluencersIfActive) window.__crmCore.refreshInfluencersIfActive();
  }
  function renderNotifPanel(){
    const panel=document.getElementById('notifPanel'); if(!panel) return;
    const head=`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--rule,#e6e8ee)">
        <b style="font-size:13px">站内通知</b>
        <span>
          ${USER&&USER.role==='admin'?`<button class="au-btn" id="notifScan" style="font-size:11px;padding:4px 8px">立即扫描</button>`:''}
          <button class="au-btn" id="notifReadAll" style="font-size:11px;padding:4px 8px">全部已读</button>
        </span>
      </div>`;
    const body=_notifs.length?_notifs.map(n=>`
        <div class="notif-item" data-id="${n.id}" style="padding:10px 14px;border-bottom:1px solid #f1f3f7;cursor:pointer;${n.read?'opacity:.55':'background:#fbfcff'}">
          <div style="font-size:12.5px;line-height:1.5">${esc(n.text)}</div>
          <div style="font-size:10px;color:var(--muted,#8a90a2);margin-top:3px">${esc((n.ts||'').slice(0,16).replace('T',' '))} ${n.read?'':'· <b style=color:#e1483b>未读</b>'}</div>
        </div>`).join(''):`<div style="padding:24px;text-align:center;color:var(--muted,#8a90a2);font-size:12px">暂无通知</div>`;
    panel.innerHTML=head+body;
    const scan=panel.querySelector('#notifScan');
    if(scan) scan.onclick=async()=>{ scan.disabled=true; scan.textContent='扫描中…';
      try{ const r=await apiPost('/api/notifications/scan',{}); await loadNotifs(); renderNotifPanel();
        const t=window.__crmCore&&window.__crmCore.toast; if(t) t(`扫描完成，新增 ${r.created} 条风险通知`);
      }catch(e){ const t=window.__crmCore&&window.__crmCore.toast; if(t) t('扫描失败：'+e.message,false); } };
    const ra=panel.querySelector('#notifReadAll');
    if(ra) ra.onclick=async()=>{ try{ await apiPost('/api/notifications/read-all',{}); await loadNotifs(); renderNotifPanel(); }catch(_){} };
    panel.querySelectorAll('.notif-item').forEach(it=>it.onclick=async()=>{
      const id=it.dataset.id; const n=_notifs.find(x=>x.id===id);
      if(n&&!n.read){ try{ await apiPost('/api/notifications/'+id+'/read',{}); n.read=true; await loadNotifs(); renderNotifPanel(); }catch(_){} }
    });
  }

  function renderTopUser(){
    const bar=document.getElementById('topActions');
    if(!bar) return;
    let host=document.getElementById('auUserHost');
    if(!host){
      host=document.createElement('div'); host.id='auUserHost'; host.className='au-user';
      bar.appendChild(host);
    }
    const initial=(USER.displayName||USER.username||'?').trim().charAt(0).toUpperCase();
    const roleLabel=USER.role==='admin'?'管理员':'成员';
    host.innerHTML=`
      <div class="au-avatar" title="${USER.username}">${initial}</div>
      <div><div class="au-name">${esc(USER.displayName||USER.username)}</div><div class="au-role">${roleLabel}</div></div>
      ${USER.role==='admin'?`<button class="au-btn" id="auManage">用户管理</button>`:''}
      <button class="au-btn" id="auLogout">登出</button>`;
    const lo=host.querySelector('#auLogout');
    if(lo) lo.onclick=async()=>{ try{ await apiPost('/api/auth/logout'); }catch(_){}
      USER=null; location.reload(); };
    const mg=host.querySelector('#auManage');
    if(mg) mg.onclick=openUserManager;
  }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  /* ---------- 用户管理（管理员） ---------- */
  async function openUserManager(){
    const C=window.__crmCore;
    let users=[];
    try{ users=await apiGet('/api/auth/users'); }catch(e){ if(C) C.toast('加载用户失败：'+e.message,false); return; }
    const rows=users.map(u=>`<tr>
      <td style="font-weight:600">${esc(u.displayName||u.username)}</td>
      <td class="muted">${esc(u.username)}</td>
      <td>${u.role==='admin'?'管理员':'成员'}</td>
      <td>${u.gmailLinked?'✅ 已绑定':'—'}</td>
    </tr>`).join('');
    const body=`
      <div class="table-wrap"><table>
        <thead><tr><th>显示名</th><th>用户名</th><th>角色</th><th>Gmail</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div style="margin-top:18px;border-top:1px solid var(--rule,#e6e8ee);padding-top:14px">
        <div class="k muted" style="font-size:11px;font-weight:600;margin-bottom:8px">新增用户</div>
        <div class="form-grid">
          <div class="field"><label>用户名 *</label><input id="nuUser" placeholder="登录用户名"></div>
          <div class="field"><label>初始密码 *</label><input id="nuPass" placeholder="初始密码"></div>
          <div class="field"><label>显示名（真实姓名）</label><input id="nuName" placeholder="用于邮件署名"></div>
          <div class="field"><label>角色</label><select id="nuRole"><option value="member">成员</option><option value="admin">管理员</option></select></div>
        </div>
      </div>`;
    if(!C){ alert('核心模块未就绪'); return; }
    C.openModal('用户管理', body,
      `<button class="btn ghost" onclick="window.__crm.closeModal()">关闭</button><button class="btn primary" id="nuAdd">＋ 添加用户</button>`);
    document.getElementById('nuAdd').onclick=async()=>{
      const username=document.getElementById('nuUser').value.trim();
      const password=document.getElementById('nuPass').value;
      const displayName=document.getElementById('nuName').value.trim();
      const role=document.getElementById('nuRole').value;
      if(!username||!password){ C.toast('用户名和密码必填',false); return; }
      try{ await apiPost('/api/auth/users',{username,password,displayName,role});
        C.toast('已添加用户'); openUserManager();
      }catch(e){ C.toast('添加失败：'+e.message,false); }
    };
  }

  /* ---------- 对外接口 ---------- */
  window.__auth={
    ensureLogin, afterLogin, openUserManager,
    current:()=>USER,
    isAdmin:()=>!!(USER&&USER.role==='admin'),
    canEdit:(inf)=>{ if(!USER) return false; if(USER.role==='admin') return true;
      return !inf || !inf.ownerId || inf.ownerId===USER.id; },
    apiGet, apiPost
  };
})();
