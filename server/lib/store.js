/* ============================================================
   lib/store.js · 统一数据访问层（DAL）
   - 飞书 Base 凭证齐全 → 走 Base（每张逻辑表映射一个 table_id）
   - 否则 → 本地 JSON 文件 data/db.json（开箱即用、可离线运行）
   两种模式对外暴露同一组 list/insert/update/remove，路由层无感知。
   记录统一形态：普通对象，含业务主键 id；Base 模式下额外维护 _rid(record_id)。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const feishu = require('./feishu');

const COLLECTIONS = ['influencers', 'public', 'mediaPublic', 'media', 'campaigns', 'outputs', 'users', 'emails', 'notifs', 'templates', 'settings'];
const useBase = cfg.feishu.enabled;

/* ---------------- 本地 JSON 模式 ---------------- */
const DB_FILE = path.join(cfg.dataDir, 'db.json');
let _cache = null;
function ensureDir() { if (!fs.existsSync(cfg.dataDir)) fs.mkdirSync(cfg.dataDir, { recursive: true }); }
function loadLocal() {
  if (_cache) return _cache;
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try { _cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
    catch (_) { _cache = {}; }
  } else _cache = {};
  COLLECTIONS.forEach(c => { if (!Array.isArray(_cache[c])) _cache[c] = []; });
  return _cache;
}
function flushLocal() { ensureDir(); fs.writeFileSync(DB_FILE, JSON.stringify(_cache, null, 2)); }

/* ---------------- 飞书 Base 模式 ---------------- */
// Base 把对象 JSON 存到「数据JSON」长文本字段，业务字段也镜像写入便于人读。
const JSON_FIELD = '数据JSON';
function tableOf(col) {
  const id = cfg.feishu.tables[col];
  if (!id) throw new Error(`未配置飞书表 table_id：${col}（请在 .env 填 FEISHU_TABLE_*）`);
  return id;
}
function recToObj(rec) {
  const f = rec.fields || {};
  let obj = {};
  const raw = f[JSON_FIELD];
  if (raw) { try { obj = JSON.parse(typeof raw === 'string' ? raw : (raw.text || '')); } catch (_) {} }
  obj._rid = rec.record_id;
  return obj;
}
function objToFields(obj) {
  const clean = { ...obj }; delete clean._rid;
  const f = { [JSON_FIELD]: JSON.stringify(clean) };
  // 镜像常用字段到 Base 列（存在则写，方便团队在飞书内查看/筛选）
  if (clean.id != null) f['红人ID'] = String(clean.id);
  if (clean.realname) f['本名'] = String(clean.realname);
  if (clean.handle) f['Handle'] = String(clean.handle);
  if (clean.platform) f['平台'] = String(clean.platform);
  if (clean.followers != null) f['粉丝数'] = Number(clean.followers) || 0;
  if (clean.ownerId) f['归属人'] = String(clean.ownerId);
  return f;
}

/* ---------------- 统一 API ---------------- */
async function list(col) {
  if (!useBase) { const db = loadLocal(); if (!Array.isArray(db[col])) db[col] = []; return db[col].slice(); }
  const recs = await feishu.listAll(tableOf(col));
  return recs.map(recToObj);
}

async function insert(col, obj) {
  if (!useBase) {
    const db = loadLocal(); db[col].push(obj); flushLocal(); return obj;
  }
  const rec = await feishu.createRec(tableOf(col), objToFields(obj));
  obj._rid = rec.record ? rec.record.record_id : rec.record_id;
  return obj;
}

async function update(col, id, patch) {
  if (!useBase) {
    const db = loadLocal();
    const i = db[col].findIndex(r => r.id === id);
    if (i < 0) return null;
    db[col][i] = { ...db[col][i], ...patch }; flushLocal();
    return db[col][i];
  }
  const recs = await feishu.listAll(tableOf(col));
  const target = recs.map(recToObj).find(o => o.id === id);
  if (!target) return null;
  const merged = { ...target, ...patch };
  await feishu.updateRec(tableOf(col), target._rid, objToFields(merged));
  return merged;
}

async function remove(col, id) {
  if (!useBase) {
    const db = loadLocal();
    const before = db[col].length;
    db[col] = db[col].filter(r => r.id !== id); flushLocal();
    return before !== db[col].length;
  }
  const recs = await feishu.listAll(tableOf(col));
  const target = recs.map(recToObj).find(o => o.id === id);
  if (!target) return false;
  await feishu.deleteRec(tableOf(col), target._rid);
  return true;
}

// 整批替换某 collection（迁移/重置用）
async function replaceAll(col, arr) {
  if (!useBase) {
    const db = loadLocal(); db[col] = arr.slice(); flushLocal(); return arr.length;
  }
  const recs = await feishu.listAll(tableOf(col));
  for (const r of recs) await feishu.deleteRec(tableOf(col), r.record_id);
  await feishu.batchCreate(tableOf(col), arr.map(objToFields));
  return arr.length;
}

module.exports = { COLLECTIONS, useBase, list, insert, update, remove, replaceAll };
