/* ============================================================
   lib/estimate.js · 功能5 预计播放量 + 功能6 CPTV 报价（纯函数）
   ============================================================ */
'use strict';

// CPTV 默认参数（可被 Settings 覆盖）
const DEFAULTS = {
  trueViewWeight: { YouTube: 1, Instagram: 0.1, TikTok: 0.1, Facebook: 0.1, Reddit: 0.1 },
  avgCPTV: 0.08,          // 平均 Cost Per True View（USD）
  conservativeFactor: 0.8, // 商单播放量保守系数
  quoteSpread: 0.25        // 报价区间上下浮动 ±25%
};

// 取最近若干条视频播放量，剔除最高/最低异常后求均值 × 保守系数 = 预估商单播放量
function estimateViews(recentViews, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const arr = (recentViews || []).map(Number).filter(v => v > 0).sort((a, b) => a - b);
  if (!arr.length) return 0;
  let core = arr;
  if (arr.length >= 5) core = arr.slice(1, -1); // 剔除最高最低各一
  const mean = core.reduce((a, b) => a + b, 0) / core.length;
  return Math.round(mean * o.conservativeFactor);
}

// True Views = 平台权重 × 预估播放量
function trueViews(platform, estViews, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const w = o.trueViewWeight[platform] != null ? o.trueViewWeight[platform] : 0.1;
  return Math.round((Number(estViews) || 0) * w);
}

// CPTV 合理报价区间（USD）
function quoteRange(platform, estViews, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const tv = trueViews(platform, estViews, o);
  const base = tv * o.avgCPTV;
  const low = Math.round(base * (1 - o.quoteSpread));
  const high = Math.round(base * (1 + o.quoteSpread));
  return { trueViews: tv, base: Math.round(base), low, high, currency: 'USD' };
}

// 综合：给定红人对象（含 platform + recentViews[] 或 estViews）→ 写回字段
function enrich(inf, opts = {}) {
  const est = inf.estViews != null && !inf.recentViews
    ? Number(inf.estViews) || 0
    : estimateViews(inf.recentViews, opts);
  const q = quoteRange(inf.platform, est, opts);
  return {
    ...inf,
    estViews: est,
    trueViews: q.trueViews,
    quoteLow: q.low,
    quoteHigh: q.high,
    quoteRange: `$${q.low.toLocaleString()}–$${q.high.toLocaleString()}`
  };
}

module.exports = { DEFAULTS, estimateViews, trueViews, quoteRange, enrich };
