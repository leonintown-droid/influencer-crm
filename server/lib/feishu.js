/* ============================================================
   lib/feishu.js · 飞书多维表格 Base 访问层
   - tenant_access_token 内存缓存 + 自动续期（有效期 ~2h）
   - 记录 CRUD + batch_create + 限流队列
   - 前端永不直连飞书；密钥仅服务端持有
   ============================================================ */
'use strict';
const axios = require('axios');
const cfg = require('../config');

const OPEN = 'https://open.feishu.cn/open-apis';
let _token = { value: '', exp: 0 };

async function tenantToken() {
  const now = Date.now();
  if (_token.value && now < _token.exp - 60000) return _token.value;
  const { data } = await axios.post(`${OPEN}/auth/v3/tenant_access_token/internal`, {
    app_id: cfg.feishu.appId, app_secret: cfg.feishu.appSecret
  });
  if (data.code !== 0) throw new Error('feishu token error: ' + (data.msg || data.code));
  _token = { value: data.tenant_access_token, exp: now + (data.expire || 7200) * 1000 };
  return _token.value;
}

// 简单串行限流：同一时刻只发一个写请求，避免触发 50/s 限制
let _chain = Promise.resolve();
function throttle(fn) {
  const run = _chain.then(fn, fn);
  _chain = run.catch(() => {});
  return run;
}

async function api(method, url, body) {
  const token = await tenantToken();
  const { data } = await axios({
    method, url: `${OPEN}${url}`, data: body,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' }
  });
  if (data.code !== 0) throw new Error(`feishu api ${url}: ${data.msg || data.code}`);
  return data.data;
}

const recPath = (tableId, baseToken) =>
  `/bitable/v1/apps/${baseToken || cfg.feishu.baseToken}/tables/${tableId}/records`;

// 列出全部记录（自动翻页）
async function listAll(tableId, baseToken) {
  let items = [], pageToken = '';
  do {
    const q = `?page_size=500${pageToken ? '&page_token=' + pageToken : ''}`;
    const d = await api('get', recPath(tableId, baseToken) + q);
    items = items.concat(d.items || []);
    pageToken = d.has_more ? d.page_token : '';
  } while (pageToken);
  return items;
}

const createRec = (tableId, fields, baseToken) =>
  throttle(() => api('post', recPath(tableId, baseToken), { fields }));

const updateRec = (tableId, recordId, fields, baseToken) =>
  throttle(() => api('put', `${recPath(tableId, baseToken)}/${recordId}`, { fields }));

const deleteRec = (tableId, recordId, baseToken) =>
  throttle(() => api('delete', `${recPath(tableId, baseToken)}/${recordId}`));

// 批量创建（≤500/次）
async function batchCreate(tableId, recordsFields, baseToken) {
  const out = [];
  for (let i = 0; i < recordsFields.length; i += 400) {
    const chunk = recordsFields.slice(i, i + 400).map(fields => ({ fields }));
    const d = await throttle(() =>
      api('post', `${recPath(tableId, baseToken)}/batch_create`, { records: chunk }));
    out.push(...(d.records || []));
  }
  return out;
}

module.exports = { tenantToken, listAll, createRec, updateRec, deleteRec, batchCreate };
