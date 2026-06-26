/* ============================================================
   routes/notify.js · 站内通知（功能2） + SLA 设置
   ============================================================ */
'use strict';
const express = require('express');
const store = require('../lib/store');
const { requireAuth, requireAdmin } = require('./auth');
const { runSLA } = require('../jobs/slaCron');
const router = express.Router();

router.use(requireAuth);

// 我的通知
router.get('/notifications', async (req, res) => {
  const all = await store.list('notifs');
  const mine = all.filter(n => !n.userId || n.userId === req.user.id);
  mine.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  res.json(mine);
});

// 手动触发 SLA 扫描（管理员）——用于即时生成风险通知
router.post('/notifications/scan', requireAdmin, async (req, res) => {
  const created = await runSLA();
  res.json({ created });
});
router.post('/notifications/:id/read', async (req, res) => {
  await store.update('notifs', req.params.id, { read: true }); res.json({ ok: true });
});
router.post('/notifications/read-all', async (req, res) => {
  const all = await store.list('notifs');
  for (const n of all) if ((!n.userId || n.userId === req.user.id) && !n.read)
    await store.update('notifs', n.id, { read: true });
  res.json({ ok: true });
});

/* ---------- SLA + CPTV 设置 ---------- */
router.get('/settings', async (req, res) => {
  const s = (await store.list('settings'))[0] || {};
  res.json(s);
});
router.put('/settings', requireAdmin, async (req, res) => {
  const cur = (await store.list('settings'))[0];
  if (cur) { const upd = await store.update('settings', cur.id, req.body || {}); return res.json(upd); }
  const obj = { id: 'settings_main', ...req.body }; await store.insert('settings', obj); res.json(obj);
});

module.exports = { router };
