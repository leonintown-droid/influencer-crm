/* ============================================================
   routes/export.js · 导出红人库 + 产出到新飞书 Base（功能7）
   - 配置 EXPORT_BASE_TOKEN + 飞书凭证 → 真实批量写入
   - 否则降级：生成 CSV 文件供下载导入飞书
   ============================================================ */
'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const store = require('../lib/store');
const feishu = require('../lib/feishu');
const cfg = require('../config');
const { requireAuth } = require('./auth');
const router = express.Router();

router.use(requireAuth);

function toCSV(rows, cols) {
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = cols.map(c => esc(c.label)).join(',');
  const body = rows.map(r => cols.map(c => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(',')).join('\n');
  return '\uFEFF' + head + '\n' + body; // BOM 保证 Excel/飞书中文不乱码
}

const INF_COLS = [
  { key: 'realname', label: '本名' }, { key: 'handle', label: 'Handle' },
  { key: 'platform', label: '平台' }, { key: 'url', label: '主页URL' },
  { key: 'followers', label: '粉丝数' }, { key: 'engagement', label: '互动率' },
  { key: 'region', label: '地区' }, { label: '垂类', get: r => (r.verticals || []).join('/') },
  { key: 'status', label: '状态' }, { key: 'email', label: '邮箱' },
  { key: 'estViews', label: '预计播放量' }, { key: 'quoteRange', label: 'CPTV报价区间' },
  { key: 'source', label: '来源' }, { key: 'ownerId', label: '归属人' }
];
const OUT_COLS = [
  { key: 'title', label: '标题' }, { key: 'infId', label: '关联红人' },
  { key: 'campId', label: '关联活动' }, { key: 'status', label: '状态' },
  { key: 'publishUrl', label: '发布URL' },
  { label: '播放量', get: r => (r.metrics && r.metrics.views) || '' }
];

router.post('/export', async (req, res) => {
  const influencers = await store.list('influencers');
  const outputs = await store.list('outputs');

  // 真实写入新 Base（若配置）
  if (cfg.feishu.enabled && cfg.feishu.exportBaseToken) {
    try {
      const infTbl = await ensureTable(cfg.feishu.exportBaseToken, '红人库', INF_COLS);
      const outTbl = await ensureTable(cfg.feishu.exportBaseToken, '产出数据', OUT_COLS);
      await feishu.batchCreate(infTbl, influencers.map(r => rowFields(r, INF_COLS)), cfg.feishu.exportBaseToken);
      await feishu.batchCreate(outTbl, outputs.map(r => rowFields(r, OUT_COLS)), cfg.feishu.exportBaseToken);
      return res.json({ mode: 'feishu', baseUrl: `https://feishu.cn/base/${cfg.feishu.exportBaseToken}`,
        influencers: influencers.length, outputs: outputs.length });
    } catch (e) { /* 失败回退 CSV */ }
  }

  // 降级：生成两个 CSV 供下载（可手动导入飞书多维表格）
  if (!fs.existsSync(cfg.dataDir)) fs.mkdirSync(cfg.dataDir, { recursive: true });
  const ts = Date.now();
  const f1 = path.join(cfg.dataDir, `export-influencers-${ts}.csv`);
  const f2 = path.join(cfg.dataDir, `export-outputs-${ts}.csv`);
  fs.writeFileSync(f1, toCSV(influencers, INF_COLS));
  fs.writeFileSync(f2, toCSV(outputs, OUT_COLS));
  res.json({ mode: 'csv',
    files: [`/api/export/download/${path.basename(f1)}`, `/api/export/download/${path.basename(f2)}`],
    influencers: influencers.length, outputs: outputs.length });
});

router.get('/export/download/:name', (req, res) => {
  const f = path.join(cfg.dataDir, path.basename(req.params.name));
  if (!fs.existsSync(f)) return res.status(404).end();
  res.download(f);
});

function rowFields(r, cols) {
  const f = {};
  cols.forEach(c => { f[c.label] = String(typeof c.get === 'function' ? c.get(r) : (r[c.key] == null ? '' : r[c.key])); });
  return f;
}
// 简化：导出库需用户预先在新 Base 建好同名表，这里直接用第一个表 id 映射约定。
// 真实环境可改为调用 create-table 接口。此处返回环境配置的导出表 id（约定）。
async function ensureTable(baseToken, name, cols) {
  // 约定：导出 Base 内已建「红人库」「产出数据」两表，table_id 由 EXPORT_TABLE_* 提供；
  // 未提供时抛错以触发 CSV 回退。
  const map = { '红人库': process.env.EXPORT_TABLE_INFLUENCERS, '产出数据': process.env.EXPORT_TABLE_OUTPUTS };
  if (!map[name]) throw new Error('export table id missing');
  return map[name];
}

module.exports = { router };
