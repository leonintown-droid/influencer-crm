/* ============================================================
   routes/email.js · 外联邮件（功能1）：模板 + Gmail 发送 + 邮件链
   ============================================================ */
'use strict';
const express = require('express');
const store = require('../lib/store');
const gmail = require('../lib/gmail');
const { requireAuth, uid } = require('./auth');
const router = express.Router();

router.use(requireAuth);

// 把模板里的占位符替换为红人字段
function fillTemplate(tpl, inf, user) {
  const map = {
    '{{本名}}': inf.realname || inf.handle || '',
    '{{realname}}': inf.realname || inf.handle || '',
    '{{handle}}': inf.handle || '',
    '{{平台}}': inf.platform || '',
    '{{我的名字}}': user.displayName || user.username || ''
  };
  return String(tpl || '').replace(/\{\{[^}]+\}\}/g, m => (m in map ? map[m] : m));
}

/* ---------- 邮件模板 ---------- */
router.get('/email/templates', async (req, res) => res.json(await store.list('templates')));
router.post('/email/templates', async (req, res) => {
  const { name, subject, body } = req.body || {};
  const t = await store.insert('templates', {
    id: uid('tpl'), name: name || '未命名模板', subject: subject || '', body: body || '',
    createdBy: req.user.id, createdAt: new Date().toISOString().slice(0, 10)
  });
  res.json(t);
});
router.delete('/email/templates/:id', async (req, res) => {
  await store.remove('templates', req.params.id); res.json({ ok: true });
});

// 预览：用某模板 + 某红人渲染
router.post('/email/preview', async (req, res) => {
  const { templateId, infId, subject, body } = req.body || {};
  const inf = (await store.list('influencers')).find(i => i.id === infId);
  if (!inf) return res.status(404).json({ error: '红人不存在' });
  let sub = subject, bod = body;
  if (templateId) {
    const t = (await store.list('templates')).find(x => x.id === templateId);
    if (t) { sub = sub || t.subject; bod = bod || t.body; }
  }
  res.json({
    to: inf.email || '',
    subject: fillTemplate(sub, inf, req.user),
    body: fillTemplate(bod, inf, req.user)
  });
});

/* ---------- 邮件链 ---------- */
router.get('/email/threads', async (req, res) => {
  let list = await store.list('emails');
  if (req.query.infId) list = list.filter(e => e.infId === req.query.infId);
  list.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  res.json(list);
});

// 发送（Gmail 已授权则真实发送，否则降级为"已生成待手动发送"）
router.post('/email/send', async (req, res) => {
  const { infId, subject, body, threadId } = req.body || {};
  const inf = (await store.list('influencers')).find(i => i.id === infId);
  if (!inf) return res.status(404).json({ error: '红人不存在' });
  if (!inf.email) return res.status(400).json({ error: '该红人未填写邮箱' });

  const r = await gmail.send({
    refreshToken: req.user.gmailRefresh, fromEmail: req.user.gmailEmail || req.user.username,
    to: inf.email, subject, body, threadId
  });
  const rec = await store.insert('emails', {
    id: uid('mail'), infId, threadId: r.threadId, messageId: r.messageId,
    direction: 'out', subject, snippet: String(body || '').slice(0, 120),
    sender: req.user.id, senderName: req.user.displayName,
    status: r.sent ? '已发送' : '待手动发送', ts: new Date().toISOString()
  });
  // 同步推进红人状态
  if (inf.status === 'prospect') await store.update('influencers', infId, { status: 'contacted', lastContactedAt: rec.ts });
  else await store.update('influencers', infId, { lastContactedAt: rec.ts });
  res.json({ sent: r.sent, thread: rec });
});

// 同步某红人的 Gmail 线程（拉回复）
router.post('/email/sync', async (req, res) => {
  const { infId } = req.body || {};
  const threads = (await store.list('emails')).filter(e => e.infId === infId && e.threadId);
  const tid = threads.length ? threads[threads.length - 1].threadId : '';
  if (!tid || !gmail.enabled() || !req.user.gmailRefresh)
    return res.json({ synced: 0, note: 'Gmail 未授权或无线程，跳过' });
  const msgs = await gmail.syncThread({ refreshToken: req.user.gmailRefresh, threadId: tid });
  const known = new Set(threads.map(t => t.messageId));
  let synced = 0;
  for (const m of msgs) {
    if (known.has(m.messageId)) continue;
    const inbound = !(m.from || '').includes(req.user.gmailEmail || '___');
    await store.insert('emails', {
      id: uid('mail'), infId, threadId: tid, messageId: m.messageId,
      direction: inbound ? 'in' : 'out', subject: m.subject, snippet: m.snippet,
      sender: inbound ? infId : req.user.id, ts: new Date(m.date || Date.now()).toISOString(),
      status: '已同步'
    });
    if (inbound) await store.update('influencers', infId, { lastReplyAt: new Date().toISOString() });
    synced++;
  }
  res.json({ synced });
});

/* ---------- Gmail OAuth ---------- */
router.get('/email/oauth/url', (req, res) => res.json({ url: gmail.authUrl(req.user.id), enabled: gmail.enabled() }));
router.get('/email/oauth/callback', async (req, res) => {
  try {
    const tokens = await gmail.exchangeCode(req.query.code);
    const userId = req.query.state;
    if (tokens.refresh_token) await store.update('users', userId, { gmailRefresh: tokens.refresh_token });
    res.send('<script>window.close&&window.close();</script>Gmail 授权成功，可关闭本页。');
  } catch (e) { res.status(500).send('授权失败：' + e.message); }
});

module.exports = { router, fillTemplate };
