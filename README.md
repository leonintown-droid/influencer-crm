# 🚀 红人营销 CRM

RimeLynx Influencer Marketing CRM — 全栈红人营销管理系统

## 架构

| 层 | 技术 | 部署 |
|---|---|---|
| **前端** | 原生 JS SPA + ECharts | GitHub Pages (`/docs`) |
| **后端** | Node.js + Express + JSON | Render (`server/`) |
| **演示** | 单文件 Mock API 版 | GitHub Pages (`/docs`) |

## 一键部署

### [GitHub Pages](https://pages.github.com) — 纯前端演示版

1. 打开仓库 Settings → Pages
2. Source 选择 `Deploy from a branch`
3. Branch 选 `main`，Folder 选 `/docs`
4. 保存，等待 1-2 分钟后访问 `https://你的用户名.github.io/仓库名/`

### [Render](https://render.com) — 全栈生产版

1. 在 Render 新建 **Web Service**
2. 连接到你的 GitHub 仓库
3. 配置如下：

| 字段 | 值 |
|---|---|
| **Root Directory** | `server` |
| **Build Command** | `npm install` |
| **Start Command** | `node index.js` |
| **Plan** | Free（512MB RAM） |

4. 点击 **Create Web Service**，等待部署完成
5. 访问 `https://influencer-crm.onrender.com/`

> ⚠️ Free 计划有冷启动延迟（>15 分钟无请求后休眠），首次访问需等待约 30 秒

## 默认账号

- 用户名：`admin`
- 密码：`admin123`

## 项目结构

```
├── influencer-crm.html    # 完整版前端入口
├── assets/                # 前端 JS 模块
├── _shared/               # ECharts 库
├── docs/
│   └── index.html         # GitHub Pages 演示版（单文件）
├── server/                # Node.js 后端
│   ├── index.js           # Express 入口
│   ├── package.json       # 依赖清单
│   ├── config.js          # 配置（环境变量）
│   ├── routes/            # API 路由
│   ├── lib/               # 工具库
│   ├── data/              # JSON 数据库
│   └── jobs/              # 定时任务
├── render.yaml            # Render Blueprint 配置
└── .gitignore
```

## 本地开发

```bash
cd server
npm install
node index.js
# 访问 http://localhost:8787
```

## 许可证

MIT
