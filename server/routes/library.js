/* ============================================================
   routes/library.js · 公共红人库（功能4/5/6） + 认领转入
   ============================================================ */
'use strict';
const express = require('express');
const store = require('../lib/store');
const estimate = require('../lib/estimate');
const crawler = require('../lib/crawler');
const { requireAuth, requireAdmin, uid } = require('./auth');
const router = express.Router();

router.use(requireAuth);

async function cptvOpts() {
  const s = (await store.list('settings'))[0];
  return s && s.cptv ? s.cptv : {};
}

// 列出公共库（可按平台筛选 ?platform=YouTube）
router.get('/public-library', async (req, res) => {
  let list = await store.list('public');
  if (req.query.platform) list = list.filter(i => (i.platformCat || i.platform) === req.query.platform);
  res.json(list);
});

// 工具：基于公共库条目构造一条 RimeLynx 红人记录
async function buildFromPublic(pub, ownerId) {
  const opts = await cptvOpts();
  let inf = estimate.enrich({
    ...pub, id: uid('inf'), ownerId: ownerId || null, source: 'from_public',
    status: 'prospect', manualTier: '', createdAt: new Date().toISOString().slice(0, 10),
    publicRef: pub.id
  }, opts);
  delete inf._rid;
  return inf;
}

/* 转入红人库（仅进 RimeLynx「全部红人」，无归属 owner）
   - 若该公共红人已存在于库中（按 publicRef 去重），直接返回已有记录，避免重复。*/
router.post('/public-library/:id/add-to-library', async (req, res) => {
  const pub = (await store.list('public')).find(i => i.id === req.params.id);
  if (!pub) return res.status(404).json({ error: '公共红人不存在' });
  const exist = (await store.list('influencers')).find(i => i.publicRef === pub.id);
  if (exist) return res.json({ ...exist, __already: true });
  const inf = await buildFromPublic(pub, null);
  await store.insert('influencers', inf);
  res.json(inf);
});

/* 转入我的库（进「全部红人」并归属当前用户 → 同时出现在「我的红人」）
   - 若库中已存在该公共红人且尚无 owner，则把它归属给当前用户（升级，而非重复插入）。
   - 若已被他人占用，则为当前用户另建一条归属记录（每人有自己的红人库）。*/
router.post('/public-library/:id/claim', async (req, res) => {
  const pub = (await store.list('public')).find(i => i.id === req.params.id);
  if (!pub) return res.status(404).json({ error: '公共红人不存在' });
  const list = await store.list('influencers');
  const mine = list.find(i => i.publicRef === pub.id && i.ownerId === req.user.id);
  if (mine) return res.json({ ...mine, __already: true });
  const orphan = list.find(i => i.publicRef === pub.id && !i.ownerId);
  if (orphan) {
    const upd = await store.update('influencers', orphan.id, { ownerId: req.user.id });
    return res.json(upd);
  }
  const inf = await buildFromPublic(pub, req.user.id);
  await store.insert('influencers', inf);
  res.json(inf);
});

/* 在「全部红人」里把某条无归属红人转入「我的红人」（请求3 的卡片按钮）。
   - 若该红人尚无 owner，则归属给当前用户；若已被占用则提示。*/
router.post('/influencers/:id/claim', async (req, res) => {
  const cur = (await store.list('influencers')).find(i => i.id === req.params.id);
  if (!cur) return res.status(404).json({ error: '红人不存在' });
  if (cur.ownerId && cur.ownerId !== req.user.id)
    return res.status(409).json({ error: '该红人已被其他用户加入我的库' });
  const upd = await store.update('influencers', req.params.id, { ownerId: req.user.id });
  res.json(upd);
});

// 管理员：手动触发一次爬虫（便于演示/验证）
router.post('/public-library/crawl', requireAdmin, async (req, res) => {
  const per = parseInt((req.body && req.body.perPlatform), 10) || 3;
  const fresh = await crawler.fetchDaily(per);
  const opts = await cptvOpts();
  const existing = await store.list('public');
  const seen = new Set(existing.map(i => (i.platformCat || i.platform) + '|' + i.handle));
  let added = 0;
  for (const r of fresh) {
    const key = (r.platformCat || r.platform) + '|' + r.handle;
    if (seen.has(key)) continue;
    seen.add(key);
    await store.insert('public', estimate.enrich(r, opts));
    added++;
  }
  res.json({ added, total: existing.length + added });
});

module.exports = { router };
