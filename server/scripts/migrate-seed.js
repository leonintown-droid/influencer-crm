/* ============================================================
   scripts/migrate-seed.js
   从前端 app.js 中提取内置 seed() 的 73 位 KOL，导入到 store
   （飞书 Base 或本地 JSON）。仅在目标库为空时执行，避免重复。
   用法：node scripts/migrate-seed.js [--force]
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const store = require('../lib/store');
const estimate = require('../lib/estimate');

const APP = path.join(__dirname, '..', '..', 'assets', 'app.js');

function extractSeed() {
  const src = fs.readFileSync(APP, 'utf8');
  // 截取 seed 函数：从 "function seed(){" 到其配套结束（用括号配平）
  const start = src.indexOf('function seed()');
  if (start < 0) throw new Error('未找到 seed() 函数');
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  const seedFn = src.slice(start, end);

  // 提供 seed 依赖的工具：today / uid（与 app.js 同实现）
  const sandbox = {};
  const code = `
    const today = ()=>new Date().toISOString().slice(0,10);
    let _n=0;
    const uid = (p='id')=>p+'_'+(Math.random().toString(36).slice(2,9))+(Date.now().toString(36).slice(-4))+(_n++);
    ${seedFn}
    seed();
  `;
  return vm.runInNewContext(code, sandbox, { timeout: 5000 });
}

(async () => {
  const force = process.argv.includes('--force');
  const existing = await store.list('influencers');
  if (existing.length && !force) {
    console.log(`红人库已有 ${existing.length} 条，跳过迁移（如需覆盖加 --force）`);
    process.exit(0);
  }
  const seed = extractSeed();
  const infs = (seed.influencers || []).map(i => {
    const enriched = estimate.enrich({
      ...i,
      ownerId: 'usr_admin',           // 默认归属管理员，登录后可转移
      source: 'manual',
      // 用粉丝量推一组保守"近10视频"播放量，供 CPTV 估算（真实爬虫接入后覆盖）
      recentViews: Array.from({ length: 10 }, () => Math.round((i.followers || 0) * (0.05 + Math.random() * 0.35)))
    });
    return enriched;
  });

  if (force) await store.replaceAll('influencers', infs);
  else for (const inf of infs) await store.insert('influencers', inf);

  console.log(`✅ 已导入 ${infs.length} 位红人到 ${store.useBase ? '飞书 Base' : '本地 JSON'}`);

  // 初始化 Settings（SLA + CPTV 默认）
  const settings = await store.list('settings');
  if (!settings.length) {
    await store.insert('settings', {
      id: 'settings_main',
      sla: { contacted: 3, negotiating: 5, prospect: 0 },
      cptv: { avgCPTV: estimate.DEFAULTS.avgCPTV, conservativeFactor: estimate.DEFAULTS.conservativeFactor,
              quoteSpread: estimate.DEFAULTS.quoteSpread, trueViewWeight: estimate.DEFAULTS.trueViewWeight }
    });
    console.log('✅ 已写入默认 SLA + CPTV 设置');
  }

  // 初始化一个默认邮件模板
  const tpls = await store.list('templates');
  if (!tpls.length) {
    await store.insert('templates', {
      id: 'tpl_default', name: '初次外联（默认）',
      subject: 'Collaboration with {{本名}} — Road Cycling Partnership',
      body: `Hi {{本名}},\n\nI'm {{我的名字}} reaching out about a potential paid collaboration on your {{平台}} channel ({{handle}}).\n\nWe love your road cycling content and would like to discuss a sponsored video. Could you share your rates and availability?\n\nBest,\n{{我的名字}}`,
      createdBy: 'usr_admin', createdAt: new Date().toISOString().slice(0, 10)
    });
    console.log('✅ 已写入默认邮件模板');
  }
  process.exit(0);
})().catch(e => { console.error('迁移失败：', e); process.exit(1); });
