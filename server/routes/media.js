/* ============================================================
   routes/media.js · 媒体库（Blog / Website 独立资源库）
   - 参考红人库逻辑：公共媒体源（mediaPublic）→ 全部媒体 / 我的媒体（media）
   - 转入媒体库（ownerId=null）/ 转入我的媒体（ownerId=当前用户）
   ============================================================ */
'use strict';
const express = require('express');
const store = require('../lib/store');
const { requireAuth, requireAdmin, uid } = require('./auth');
const router = express.Router();

router.use(requireAuth);

/* 真实公路骑行垂直博客 / 媒体站点库（用于「寻找新的媒体」抓取） */
const MEDIA_SOURCES = [
  { handle: 'CyclingTips', name: 'CyclingTips', url: 'https://cyclingtips.com/', type: 'Blog', region: 'Global', monthlyVisits: 2200000, da: 78, topics: ['Road Cycling', 'Gear Review', 'Racing'], language: 'English', email: 'editor@cyclingtips.com' },
  { handle: 'BikeRadar', name: 'BikeRadar', url: 'https://www.bikeradar.com/', type: 'Media', region: 'United Kingdom', monthlyVisits: 5000000, da: 85, topics: ['Road Cycling', 'Gear Review', 'How-to'], language: 'English', email: 'tips@bikeradar.com' },
  { handle: 'RoadCC', name: 'road.cc', url: 'https://road.cc/', type: 'Media', region: 'United Kingdom', monthlyVisits: 3000000, da: 80, topics: ['Road Cycling', 'News', 'Reviews'], language: 'English', email: 'news@road.cc' },
  { handle: 'TheInnerRing', name: 'The Inner Ring', url: 'https://inrng.com/', type: 'Blog', region: 'France', monthlyVisits: 900000, da: 72, topics: ['Pro Racing', 'Analysis', 'Tactics'], language: 'English', email: 'inrng@inrng.com' },
  { handle: 'DCRainmaker', name: 'DC Rainmaker', url: 'https://www.dcrainmaker.com/', type: 'Blog', region: 'USA', monthlyVisits: 2600000, da: 83, topics: ['Cycling Tech', 'GPS', 'Power Meters'], language: 'English', email: 'ray@dcrainmaker.com' },
  { handle: 'VeloNews', name: 'Velo (VeloNews)', url: 'https://www.velonews.com/', type: 'Media', region: 'USA', monthlyVisits: 1800000, da: 82, topics: ['Road Cycling', 'Racing', 'Training'], language: 'English', email: 'editors@velonews.com' },
  { handle: 'CyclingWeekly', name: 'Cycling Weekly', url: 'https://www.cyclingweekly.com/', type: 'Media', region: 'United Kingdom', monthlyVisits: 4200000, da: 84, topics: ['Road Cycling', 'Fitness', 'Gear'], language: 'English', email: 'cycling@futurenet.com' },
  { handle: 'BikePacking', name: 'BIKEPACKING.com', url: 'https://bikepacking.com/', type: 'Blog', region: 'Global', monthlyVisits: 1200000, da: 74, topics: ['Adventure', 'Gravel', 'Bags & Gear'], language: 'English', email: 'info@bikepacking.com' },
  { handle: 'GranFondo', name: 'GRAN FONDO Cycling', url: 'https://granfondo-cycling.com/', type: 'Blog', region: 'Germany', monthlyVisits: 700000, da: 68, topics: ['Road Cycling', 'Gravel', 'Tests'], language: 'English', email: 'editorial@granfondo-cycling.com' },
  { handle: 'CyclingNews', name: 'Cyclingnews', url: 'https://www.cyclingnews.com/', type: 'Media', region: 'Global', monthlyVisits: 6000000, da: 86, topics: ['Pro Racing', 'News', 'Live'], language: 'English', email: 'news@cyclingnews.com' },
  { handle: 'PinkBike', name: 'Pinkbike', url: 'https://www.pinkbike.com/', type: 'Media', region: 'Canada', monthlyVisits: 8000000, da: 87, topics: ['MTB', 'Reviews', 'Community'], language: 'English', email: 'info@pinkbike.com' },
  { handle: 'GravelCyclist', name: 'Gravel Cyclist', url: 'https://gravelcyclist.com/', type: 'Blog', region: 'USA', monthlyVisits: 450000, da: 60, topics: ['Gravel', 'Events', 'Gear'], language: 'English', email: 'team@gravelcyclist.com' },
  { handle: 'EscapeCollective', name: 'Escape Collective', url: 'https://escapecollective.com/', type: 'Media', region: 'Global', monthlyVisits: 850000, da: 65, topics: ['Pro Racing', 'Tech', 'Member Media'], language: 'English', email: 'hello@escapecollective.com' },
  { handle: 'BicyclingMag', name: 'Bicycling Magazine', url: 'https://www.bicycling.com/', type: 'Media', region: 'USA', monthlyVisits: 3500000, da: 84, topics: ['Road Cycling', 'Health', 'Gear'], language: 'English', email: 'bicycling@hearst.com' },
  { handle: 'GCNBlog', name: 'GCN (Global Cycling Network)', url: 'https://www.globalcyclingnetwork.com/', type: 'Media', region: 'United Kingdom', monthlyVisits: 2800000, da: 79, topics: ['Road Cycling', 'How-to', 'Entertainment'], language: 'English', email: 'support@globalcyclingnetwork.com' },
];

function buildPublicMedia(src) {
  return {
    id: 'pubm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    handle: src.handle,
    name: src.name,
    url: src.url,
    type: src.type || 'Blog',
    region: src.region || 'Global',
    monthlyVisits: src.monthlyVisits || 0,
    da: src.da || 0,
    topics: src.topics || [],
    language: src.language || 'English',
    email: src.email || '',
    source: 'crawler',
    fetchedAt: new Date().toISOString().slice(0, 10),
  };
}

/* 启动时若公共媒体源为空，则种入全部真实媒体源（保证「寻找新的媒体」有数据）*/
async function ensureSeedMedia() {
  const existing = await store.list('mediaPublic');
  if (existing && existing.length > 0) return;
  const list = existing || [];
  for (const s of MEDIA_SOURCES) await store.insert('mediaPublic', buildPublicMedia(s));
}

/* ---------- 公共媒体源（寻找新的媒体）---------- */
router.get('/media-public', async (req, res) => {
  let list = await store.list('mediaPublic');
  if (req.query.type) list = list.filter(i => (i.type || 'Blog') === req.query.type);
  res.json(list);
});

/* ---------- 媒体库（全部媒体 / 我的媒体）---------- */
router.get('/media', async (req, res) => res.json(await store.list('media')));

function buildFromPublicMedia(pub, ownerId) {
  return {
    id: uid('media'),
    handle: pub.handle, name: pub.name, url: pub.url, type: pub.type,
    region: pub.region, monthlyVisits: pub.monthlyVisits, da: pub.da,
    topics: pub.topics || [], language: pub.language, email: pub.email,
    ownerId: ownerId || null, source: 'from_public', status: 'prospect',
    publicRef: pub.id, createdAt: new Date().toISOString().slice(0, 10),
  };
}

/* 转入媒体库：仅进「全部媒体」，无归属（按 publicRef 去重）*/
router.post('/media-public/:id/add-to-library', async (req, res) => {
  const pub = (await store.list('mediaPublic')).find(i => i.id === req.params.id);
  if (!pub) return res.status(404).json({ error: '媒体源不存在' });
  const exist = (await store.list('media')).find(i => i.publicRef === pub.id);
  if (exist) return res.json({ ...exist, __already: true });
  const m = buildFromPublicMedia(pub, null);
  await store.insert('media', m);
  res.json(m);
});

/* 转入我的媒体：进「全部媒体」并归属当前用户 */
router.post('/media-public/:id/claim', async (req, res) => {
  const pub = (await store.list('mediaPublic')).find(i => i.id === req.params.id);
  if (!pub) return res.status(404).json({ error: '媒体源不存在' });
  const list = await store.list('media');
  const mine = list.find(i => i.publicRef === pub.id && i.ownerId === req.user.id);
  if (mine) return res.json({ ...mine, __already: true });
  const orphan = list.find(i => i.publicRef === pub.id && !i.ownerId);
  if (orphan) {
    const upd = await store.update('media', orphan.id, { ownerId: req.user.id });
    return res.json(upd);
  }
  const m = buildFromPublicMedia(pub, req.user.id);
  await store.insert('media', m);
  res.json(m);
});

/* 全部媒体卡片：把无归属媒体转入我的媒体 */
router.post('/media/:id/claim', async (req, res) => {
  const cur = (await store.list('media')).find(i => i.id === req.params.id);
  if (!cur) return res.status(404).json({ error: '媒体不存在' });
  if (cur.ownerId && cur.ownerId !== req.user.id)
    return res.status(409).json({ error: '该媒体已被其他用户加入我的媒体' });
  const upd = await store.update('media', req.params.id, { ownerId: req.user.id });
  res.json(upd);
});

/* 手动新增 / 编辑 / 删除媒体 */
router.post('/media', async (req, res) => {
  const body = req.body || {};
  const m = {
    id: body.id || uid('media'), ownerId: req.user.id, source: body.source || 'manual',
    status: body.status || 'prospect', createdAt: new Date().toISOString().slice(0, 10), ...body,
  };
  await store.insert('media', m);
  res.json(m);
});

router.put('/media/:id', async (req, res) => {
  const all = await store.list('media');
  const cur = all.find(i => i.id === req.params.id);
  if (!cur) return res.status(404).json({ error: '媒体不存在' });
  if (req.user.role !== 'admin' && cur.ownerId && cur.ownerId !== req.user.id)
    return res.status(403).json({ error: '只能编辑自己的媒体' });
  const upd = await store.update('media', req.params.id, req.body || {});
  res.json(upd);
});

router.delete('/media/:id', async (req, res) => {
  const all = await store.list('media');
  const cur = all.find(i => i.id === req.params.id);
  if (!cur) return res.status(404).json({ error: '媒体不存在' });
  if (req.user.role !== 'admin' && cur.ownerId && cur.ownerId !== req.user.id)
    return res.status(403).json({ error: '只能删除自己的媒体' });
  await store.remove('media', req.params.id);
  res.json({ ok: true });
});

/* 管理员：抓取更多媒体源（从真实媒体库补充未入库的源）*/
router.post('/media-public/crawl', requireAdmin, async (req, res) => {
  const existing = await store.list('mediaPublic');
  const seen = new Set(existing.map(i => i.handle));
  let added = 0;
  for (const s of MEDIA_SOURCES) {
    if (seen.has(s.handle)) continue;
    seen.add(s.handle);
    await store.insert('mediaPublic', buildPublicMedia(s));
    added++;
  }
  res.json({ added, total: existing.length + added });
});

module.exports = { router, ensureSeedMedia };
