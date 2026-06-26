/* ============================================================
   jobs/crawlerCron.js · 每日爬虫 → 写公共红人库
   ============================================================ */
'use strict';
const store = require('../lib/store');
const estimate = require('../lib/estimate');
const crawler = require('../lib/crawler');

async function runCrawler(perPlatform = 3) {
  const fresh = await crawler.fetchDaily(perPlatform);
  const existing = await store.list('public');
  const seen = new Set(existing.map(i => (i.platformCat || i.platform) + '|' + i.handle));
  const opts = ((await store.list('settings'))[0] || {}).cptv || {};
  let added = 0;
  for (const r of fresh) {
    const key = (r.platformCat || r.platform) + '|' + r.handle;
    if (seen.has(key)) continue;
    seen.add(key);
    await store.insert('public', estimate.enrich(r, opts));
    added++;
  }
  console.log(`[crawlerCron] 新增公共红人 ${added} 位`);
  return added;
}

module.exports = { runCrawler };
