# 第一阶段：构建依赖
FROM node:20-alpine AS builder

RUN apk add --no-cache vips-dev build-base python3

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 第二阶段：运行
FROM node:20-alpine

# 只安装运行时需要的 vips
RUN apk add --no-cache vips

# 创建非 root 用户
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# 从构建阶段复制 node_modules
COPY --from=builder /app/node_modules ./node_modules

# 复制项目文件
COPY . .

# 创建数据目录并设置权限
RUN mkdir -p uploads data thumbs && \
    chown -R appuser:appgroup /app

# 切换到非 root 用户
USER appuser

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# 启动命令
CMD ["node", "server.js"]
