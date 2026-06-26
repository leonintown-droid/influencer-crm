/* ============================================================
   routes/data.js · 红人库 / 活动 / 产出 CRUD（功能3 归属 + 权限）
   ============================================================ */
'use strict';
const express = require('express');
const store = require('../lib/store');
const estimate = require('../lib/estimate');
const { requireAuth, uid } = require('./auth');
const router = express.Router();

router.use(requireAuth);

// 读取 Settings 里的 CPTV 参数（无则默认）
async function cptvOpts() {
  const s = (await store.list('settings'))[0];
  return s && s.cptv ? s.cptv : {};
}

/* ---------- 批量同步（前端 save() 整库回写，策略A）----------
   接收 {influencers,campaigns,outputs}，整批替换对应集合。
   写红人时补算 CPTV/预计播放量；保留/补齐 ownerId。 */
router.post('/sync', async (req, res) => {
  const body = req.body || {};
  const opts = await cptvOpts();
  if (Array.isArray(body.influencers)) {
    const arr = body.influencers.map(i => {
      let inf = { ...i };
      // 归属：保留显式值（含 null=仅在「全部红人」无归属）；仅当字段完全缺失时默认归属当前用户
      if (!('ownerId' in inf)) inf.ownerId = req.user.id;
      if (!inf.source) inf.source = 'manual';
      if (inf.recentViews || inf.estViews != null) inf = estimate.enrich(inf, opts);
      return inf;
    });
    await store.replaceAll('influencers', arr);
  }
  if (Array.isArray(body.campaigns)) await store.replaceAll('campaigns', body.campaigns);
  if (Array.isArray(body.outputs)) await store.replaceAll('outputs', body.outputs);
  res.json({ ok: true });
});

/* ---------- 红人库 ---------- */
router.get('/influencers', async (req, res) => {
  const all = await store.list('influencers');
  res.json(all);
});

router.post('/influencers', async (req, res) => {
  const opts = await cptvOpts();
  const body = req.body || {};
  let inf = {
    id: body.id || uid('inf'),
    ownerId: req.user.id, source: body.source || 'manual',
    createdAt: new Date().toISOString().slice(0, 10),
    ...body
  };
  if (inf.recentViews || inf.estViews != null) inf = estimate.enrich(inf, opts);
  await store.insert('influencers', inf);
  res.json(inf);
});

router.put('/influencers/:id', async (req, res) => {
  const all = await store.list('influencers');
  const cur = all.find(i => i.id === req.params.id);
  if (!cur) return res.status(404).json({ error: '红人不存在' });
  // 权限：非管理员只能改自己归属的红人
  if (req.user.role !== 'admin' && cur.ownerId && cur.ownerId !== req.user.id)
    return res.status(403).json({ error: '只能编辑自己标记的红人' });
  const opts = await cptvOpts();
  let patch = req.body || {};
  if (patch.recentViews || patch.estViews != null) patch = estimate.enrich({ ...cur, ...patch }, opts);
  const upd = await store.update('influencers', req.params.id, patch);
  res.json(upd);
});

router.delete('/influencers/:id', async (req, res) => {
  const all = await store.list('influencers');
  const cur = all.find(i => i.id === req.params.id);
  if (!cur) return res.status(404).json({ error: '红人不存在' });
  if (req.user.role !== 'admin' && cur.ownerId && cur.ownerId !== req.user.id)
    return res.status(403).json({ error: '只能删除自己标记的红人' });
  await store.remove('influencers', req.params.id);
  res.json({ ok: true });
});

/* ---------- 通用集合（campaigns / outputs）CRUD ---------- */
function crud(col, prefix) {
  router.get('/' + col, async (req, res) => res.json(await store.list(col)));
  router.post('/' + col, async (req, res) => {
    const obj = { id: (req.body && req.body.id) || uid(prefix), createdAt: new Date().toISOString().slice(0, 10), ...req.body };
    await store.insert(col, obj); res.json(obj);
  });
  router.put('/' + col + '/:id', async (req, res) => {
    const upd = await store.update(col, req.params.id, req.body || {});
    if (!upd) return res.status(404).json({ error: '记录不存在' });
    res.json(upd);
  });
  router.delete('/' + col + '/:id', async (req, res) => {
    await store.remove(col, req.params.id); res.json({ ok: true });
  });
}
crud('campaigns', 'camp');
crud('outputs', 'out');

module.exports = { router };
