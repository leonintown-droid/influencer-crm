/* ============================================================
   index.js · 应用入口
   - 同源托管 SPA（../ 下的 influencer-crm.html + assets + _shared）
   - 挂载 /api/* 路由
   - 启动 cron（爬虫 + SLA）
   ============================================================ */
'use strict';
const path = require('path');
const express = require('express');
const session = require('express-session');
const cron = require('node-cron');
const cfg = require('./config');

const auth = require('./routes/auth');
const data = require('./routes/data');
const library = require('./routes/library');
const media = require('./routes/media');
const email = require('./routes/email');
const notify = require('./routes/notify');
const exportR = require('./routes/export');
const { runCrawler } = require('./jobs/crawlerCron');
const { runSLA } = require('./jobs/slaCron');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(session({
  secret: cfg.sessionSecret, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 3600 * 1000 }
}));

// API
app.get('/api/health', (req, res) => res.json({
  ok: true, dataMode: cfg.feishu.enabled ? 'feishu-base' : 'local-json',
  gmail: cfg.gmail.enabled, crawler: cfg.crawler.enabled ? cfg.crawler.provider : 'mock'
}));

app.use('/api/auth', auth.router);
app.use('/api', data.router);
app.use('/api', library.router);
app.use('/api', media.router);
app.use('/api', email.router);
app.use('/api', notify.router);
app.use('/api', exportR.router);

// 静态托管前端（server 的上级目录）
const ROOT = path.join(__dirname, '..');
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.use('/_shared', express.static(path.join(ROOT, '_shared')));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'influencer-crm.html')));
app.get('/influencer-crm.html', (req, res) => res.sendFile(path.join(ROOT, 'influencer-crm.html')));
app.get('/demo', (req, res) => res.sendFile(path.join(ROOT, 'influencer-crm-demo.html')));

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('API error:', err.message);
  res.status(500).json({ error: err.message || '服务器错误' });
});

(async () => {
  await auth.ensureSeedAdmin();
  try { await media.ensureSeedMedia(); } catch (e) { console.error('seed media', e.message); }
  app.listen(cfg.port, () => {
    console.log(`\n红人 CRM 后端已启动: http://localhost:${cfg.port}`);
    console.log(`数据模式: ${cfg.feishu.enabled ? '飞书 Base' : '本地 JSON (data/db.json)'}`);
    console.log(`Gmail: ${cfg.gmail.enabled ? '已配置' : '降级(仅模板)'} | 爬虫: ${cfg.crawler.enabled ? cfg.crawler.provider : 'mock'}\n`);
  });
  // cron
  try {
    cron.schedule(cfg.cron.crawler, () => runCrawler().catch(e => console.error('crawler cron', e.message)));
    cron.schedule(cfg.cron.sla, () => runSLA().catch(e => console.error('sla cron', e.message)));
  } catch (e) { console.error('cron schedule error', e.message); }
})();
