/* ============================================================
   routes/auth.js · 多用户登录 / 会话 / 权限（功能3）
   ============================================================ */
'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../lib/store');
const router = express.Router();

const uid = p => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

// 启动时确保有一个默认管理员（首次运行可登录）
async function ensureSeedAdmin() {
  const users = await store.list('users');
  if (!users.length) {
    await store.insert('users', {
      id: 'usr_admin', username: 'admin', displayName: '管理员 Admin',
      pass: bcrypt.hashSync('admin123', 8), role: 'admin',
      perms: { canEditAll: true, viewAll: true }, gmailRefresh: '', gmailEmail: '',
      createdAt: new Date().toISOString().slice(0, 10)
    });
  }
}

function publicUser(u) {
  if (!u) return null;
  const { pass, gmailRefresh, ...safe } = u;
  return { ...safe, gmailLinked: !!gmailRefresh };
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const users = await store.list('users');
  const u = users.find(x => x.username === username);
  if (!u || !bcrypt.compareSync(String(password || ''), u.pass || '')) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  req.session.userId = u.id;
  res.json({ user: publicUser(u) });
});

router.post('/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: '未登录' });
  const users = await store.list('users');
  const u = users.find(x => x.id === req.session.userId);
  if (!u) return res.status(401).json({ error: '会话失效' });
  res.json({ user: publicUser(u) });
});

// 全员名册（任意登录用户可读，仅暴露 id/显示名/用户名，用于「PIC：负责人」展示）
router.get('/roster', requireAuth, async (req, res) => {
  const users = await store.list('users');
  res.json(users.map(u => ({ id: u.id, displayName: u.displayName || u.username, username: u.username })));
});

// 管理员：列出/新增用户
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const users = await store.list('users');
  res.json(users.map(publicUser));
});
router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  const { username, password, displayName, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '需用户名和密码' });
  const users = await store.list('users');
  if (users.some(u => u.username === username)) return res.status(400).json({ error: '用户名已存在' });
  const u = await store.insert('users', {
    id: uid('usr'), username, displayName: displayName || username,
    pass: bcrypt.hashSync(String(password), 8), role: role === 'admin' ? 'admin' : 'member',
    perms: { canEditAll: role === 'admin', viewAll: true }, gmailRefresh: '', gmailEmail: '',
    createdAt: new Date().toISOString().slice(0, 10)
  });
  res.json(publicUser(u));
});

/* ---------- 中间件 ---------- */
async function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: '未登录' });
  const users = await store.list('users');
  const u = users.find(x => x.id === req.session.userId);
  if (!u) return res.status(401).json({ error: '会话失效' });
  req.user = u;
  next();
}
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

module.exports = { router, requireAuth, requireAdmin, ensureSeedAdmin, publicUser, uid };
