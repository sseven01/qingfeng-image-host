FROM node:20-alpine

# 创建非 root 用户
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层
COPY package.json ./

# 安装依赖
RUN npm install --omit=dev

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
