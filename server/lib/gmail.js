/* ============================================================
   lib/gmail.js · Gmail / Google Workspace 邮件集成（纯 REST，无 googleapis 依赖）
   - 凭证齐全 → 真实 OAuth2 发信 + 线程同步（用 axios 直连 Google REST）
   - 缺失 → 降级：仅生成模板，发送动作记录为"待手动发送"
   每个成员各自授权，refresh_token 仅服务端持有。
   ============================================================ */
'use strict';
const axios = require('axios');
const cfg = require('../config');

const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'];
const enabled = () => cfg.gmail.enabled;

// 生成授权链接（前端跳转，state 带 userId）
function authUrl(userId) {
  if (!enabled()) return '';
  const p = new URLSearchParams({
    client_id: cfg.gmail.clientId, redirect_uri: cfg.gmail.redirectUri,
    response_type: 'code', access_type: 'offline', prompt: 'consent',
    scope: SCOPES.join(' '), state: userId || ''
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}

// 回调换 refresh_token
async function exchangeCode(code) {
  const { data } = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    code, client_id: cfg.gmail.clientId, client_secret: cfg.gmail.clientSecret,
    redirect_uri: cfg.gmail.redirectUri, grant_type: 'authorization_code'
  }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return data; // { refresh_token, access_token, ... }
}

// 用 refresh_token 换短期 access_token
async function accessToken(refreshToken) {
  const { data } = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    refresh_token: refreshToken, client_id: cfg.gmail.clientId,
    client_secret: cfg.gmail.clientSecret, grant_type: 'refresh_token'
  }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return data.access_token;
}

function rawMessage({ to, from, subject, body }) {
  const lines = [
    `To: ${to}`, `From: ${from}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject || '').toString('base64')}?=`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', '', body || ''
  ];
  return Buffer.from(lines.join('\r\n')).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 以成员身份发送；返回 { sent, threadId, messageId }
async function send({ refreshToken, fromEmail, to, subject, body, threadId }) {
  if (!enabled() || !refreshToken) {
    return { sent: false, threadId: threadId || ('manual_' + Date.now()), messageId: 'manual_' + Date.now() };
  }
  const token = await accessToken(refreshToken);
  const { data } = await axios.post(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    { raw: rawMessage({ to, from: fromEmail, subject, body }), threadId: threadId || undefined },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return { sent: true, threadId: data.threadId, messageId: data.id };
}

// 同步某线程的最新消息（拉回红人回复）
async function syncThread({ refreshToken, threadId }) {
  if (!enabled() || !refreshToken) return [];
  const token = await accessToken(refreshToken);
  const { data } = await axios.get(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`,
    { params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] },
      headers: { Authorization: `Bearer ${token}` } }
  );
  return (data.messages || []).map(m => {
    const h = {}; ((m.payload && m.payload.headers) || []).forEach(x => h[x.name] = x.value);
    return { messageId: m.id, from: h.From, subject: h.Subject, date: h.Date, snippet: m.snippet };
  });
}

module.exports = { enabled, authUrl, exchangeCode, send, syncThread };
