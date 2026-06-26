/* ============================================================
   配置加载：读取 .env（缺失时全部降级为本地/模拟模式）
   ============================================================ */
'use strict';
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch (_) {}

const env = process.env;
const bool = v => !!(v && String(v).trim());

const feishu = {
  appId: env.FEISHU_APP_ID || '',
  appSecret: env.FEISHU_APP_SECRET || '',
  baseToken: env.FEISHU_BASE_TOKEN || '',
  exportBaseToken: env.EXPORT_BASE_TOKEN || '',
  tables: {
    influencers: env.FEISHU_TABLE_INFLUENCERS || '',
    public:      env.FEISHU_TABLE_PUBLIC || '',
    campaigns:   env.FEISHU_TABLE_CAMPAIGNS || '',
    outputs:     env.FEISHU_TABLE_OUTPUTS || '',
    users:       env.FEISHU_TABLE_USERS || '',
    emails:      env.FEISHU_TABLE_EMAILS || '',
    notifs:      env.FEISHU_TABLE_NOTIFS || '',
    templates:   env.FEISHU_TABLE_TEMPLATES || '',
    settings:    env.FEISHU_TABLE_SETTINGS || ''
  }
};
// 只有 appId/secret/baseToken 都齐全时才启用飞书 Base 作为主库
feishu.enabled = bool(feishu.appId) && bool(feishu.appSecret) && bool(feishu.baseToken);

const gmail = {
  clientId: env.GMAIL_CLIENT_ID || '',
  clientSecret: env.GMAIL_CLIENT_SECRET || '',
  redirectUri: env.GMAIL_REDIRECT_URI || 'http://localhost:8787/api/email/oauth/callback'
};
gmail.enabled = bool(gmail.clientId) && bool(gmail.clientSecret);

const crawler = {
  provider: (env.CRAWLER_PROVIDER || 'mock').toLowerCase(),
  apiKey: env.CRAWLER_API_KEY || '',
  apiHost: env.CRAWLER_API_HOST || ''
};
crawler.enabled = crawler.provider !== 'mock' && bool(crawler.apiKey);

module.exports = {
  port: parseInt(env.PORT, 10) || 8787,
  sessionSecret: env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  feishu,
  gmail,
  crawler,
  cron: {
    crawler: env.CRON_CRAWLER || '0 3 * * *',
    sla: env.CRON_SLA || '*/30 * * * *'
  },
  dataDir: path.join(__dirname, 'data')
};
