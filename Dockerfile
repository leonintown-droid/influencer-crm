# Fly.io Dockerfile — Node.js 18 Alpine, 极速构建
FROM node:18-alpine

# 创建工作目录
WORKDIR /app

# 复制全部项目文件（前端 HTML/JS + 后端 server/）
COPY . .

# 安装后端依赖
WORKDIR /app/server
RUN npm ci --only=production

# 回到根目录（index.js 需要读取 ../influencer-crm.html）
WORKDIR /app/server

# Fly.io 会将请求路由到容器内 8080 端口
ENV PORT=8080
ENV NODE_ENV=production

# 健康检查
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动
CMD ["node", "index.js"]
