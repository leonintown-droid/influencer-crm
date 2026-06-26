/* ============================================================
   jobs/slaCron.js · SLA 风险扫描 → 生成站内通知（功能2）
   规则示例：状态=已联系(contacted) 且超过 N 天无回复 → 风险通知。
   N 从 Settings.sla 读取（按状态键配置天数），缺省 3 天。
   ============================================================ */
'use strict';
const store = require('../lib/store');

const uid = p => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const daysBetween = (a, b) => Math.floor((b - new Date(a).getTime()) / 86400000);

async function runSLA() {
  const settings = (await store.list('settings'))[0] || {};
  const sla = settings.sla || { contacted: 3, negotiating: 5 }; // 各状态阈值（天）
  const infs = await store.list('influencers');
  const notifs = await store.list('notifs');
  const now = Date.now();
  let created = 0;

  for (const inf of infs) {
    const limit = sla[inf.status];
    if (!limit) continue;
    // 基准时间：最近回复 > 最近联系 > 创建
    const base = inf.lastReplyAt || inf.lastContactedAt || inf.createdAt;
    if (!base) continue;
    // 若有比基准更晚的回复，则不算风险
    if (inf.lastReplyAt && inf.lastContactedAt && new Date(inf.lastReplyAt) >= new Date(inf.lastContactedAt)) continue;
    const elapsed = daysBetween(base, now);
    if (elapsed < limit) continue;
    // 去重：同红人同状态未读风险只发一条
    const dupe = notifs.find(n => n.type === 'sla' && n.refId === inf.id && n.status === inf.status && !n.read);
    if (dupe) continue;
    await store.insert('notifs', {
      id: uid('ntf'), userId: inf.ownerId || '', type: 'sla', status: inf.status, refId: inf.id,
      text: `⚠️ 风险提醒：「${inf.realname || inf.handle}」处于「${inf.status}」已 ${elapsed} 天无回复（阈值 ${limit} 天）`,
      read: false, ts: new Date().toISOString()
    });
    created++;
  }
  if (created) console.log(`[slaCron] 生成风险通知 ${created} 条`);
  return created;
}

module.exports = { runSLA };
