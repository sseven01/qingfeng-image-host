# 青枫图床

一个轻量级私有图床程序，适合个人网站调用图片直链。后台需要访问密码，图片直链默认公开访问，方便放到博客、站点和 Markdown 里。

## 功能

- 访问密码登录后台
- 多级目录创建和浏览
- 目录展开/收纳、目录搜索和目录图片数量显示
- 目录数量按当前目录和所有子目录累计统计
- 支持输入 `\aaa\bbb\ccc` 一次创建多级目录
- 支持右键目录后警告确认删除目录
- 图片名称和路径搜索
- 单图、多图、拖拽上传、**粘贴上传（Ctrl+V）**
- 上传时显示总体进度、文件清单和上传状态
- 多图上传后输出本次上传的全部直链和 Markdown
- **上传自动生成 400px 宽缩略图，网格视图秒加载**
- 自动处理重名文件
- 图片网格预览
- 一键复制直链和 Markdown
- 删除、重命名图片
- **图片列表分页加载，大数据量不卡顿**
- 本地文件存储，无数据库原生依赖

## 本地运行

```bash
npm install
cp .env.example .env
npm start
```

Windows PowerShell:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

打开 `http://localhost:3000`，使用 `.env` 里的 `APP_PASSWORD` 登录。

## 配置

```env
PORT=3000
APP_PASSWORD=change-this-password
SESSION_SECRET=change-this-random-secret
BASE_URL=https://img.example.com
MAX_FILE_SIZE_MB=10
UPLOAD_DIR=uploads
DATA_DIR=data
THUMB_DIR=thumbs
TRUST_PROXY=false
COOKIE_SECURE=false
API_TOKEN=
API_TOKEN_WRITE=
```

- `API_TOKEN`：只读 Token，开放 `/api/tree`、`/api/items`、`/api/images/search` 给主题、AI 工具等程序化调用（可选，不配则这些接口仍仅限后台会话）。
- `API_TOKEN_WRITE`：读写 Token，额外开放 `/api/upload`。与 `API_TOKEN` 分开配置，建议不上传就不要设置它。

生产环境建议：

- `APP_PASSWORD` 改成强密码
- `SESSION_SECRET` 改成随机长字符串
- `BASE_URL` 改成你的图床域名
- 如果通过反向代理启用 HTTPS，可设置 `TRUST_PROXY=true` 和 `COOKIE_SECURE=true`

## 目录说明

```text
private-image-host/
  data/           # 元数据 meta.json
  uploads/        # 图片文件
  thumbs/         # 缩略图文件
  tmp/            # 上传临时文件（启动自动清理）
  public/         # 前端页面
  server.js       # 服务端
```

备份时重点备份 `uploads/`、`thumbs/` 和 `data/meta.json`。

## Docker 部署（推荐）

镜像由 GitHub Actions 自动构建并发布到 GitHub 容器仓库（GHCR），服务器上不需要拉源码，拉镜像即可部署。

### 镜像地址与标签

```text
ghcr.io/sseven01/qingfeng-image-host
```

| 标签 | 说明 |
|---|---|
| `master` | 每次 push 到 master 分支自动构建，**日常部署用这个** |
| `vX.Y.Z` | 打 `v*` 版本标签时构建，用于固定版本回滚 |

### 方式一：docker run 直接部署

1. 准备 `.env`（参考上方「配置」一节，含密码、`BASE_URL`、`API_TOKEN` 等）。
2. 拉取并启动：

```bash
docker pull ghcr.io/sseven01/qingfeng-image-host:master

docker run -d \
  --name qingfeng-image-host \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  -v "$PWD/uploads:/app/uploads" \
  -v "$PWD/data:/app/data" \
  -v "$PWD/thumbs:/app/thumbs" \
  ghcr.io/sseven01/qingfeng-image-host:master
```

如果镜像包是私有的，先登录（PAT 需要 `read:packages` 权限；公开包可跳过）：

```bash
echo <PAT> | docker login ghcr.io -u <GitHub用户名> --password-stdin
```

### 方式二：docker-compose 部署

本仓库自带 `docker-compose.yml`（含端口映射、数据卷、环境变量透传）。两种用法：

```bash
# 本地构建运行（默认 build: .）
docker-compose up -d

# 或改为拉取 GHCR 镜像：把 docker-compose.yml 里的 build: . 换成
#   image: ghcr.io/sseven01/qingfeng-image-host:master
# 然后
docker-compose up -d
```

常用命令：`docker-compose up -d` 启动、`docker-compose down` 停止、`docker-compose logs -f` 看日志。

### 更新版本

```bash
docker pull ghcr.io/sseven01/qingfeng-image-host:master
docker-compose up -d --force-recreate   # 或 docker rm -f 后重新 docker run
```

数据在挂载卷里，重建容器不丢图片。上线后同样需要 Nginx 反向代理 + HTTPS（见下文）。

## 1Panel 部署

下面以 1Panel 的 Node.js 容器运行环境为例。假设项目目录为：

```text
/opt/qingfeng-image-host
```

1. 在 1Panel 创建 Node.js 运行环境，Node.js 建议选择 18 或 20。
2. 代码来源选择 Git，仓库地址填写：

```text
https://github.com/sseven01/qingfeng-image-host.git
```

3. 分支填写：

```text
main
```

4. 项目目录选择：

```text
/opt/qingfeng-image-host
```

5. 安装命令填写：

```bash
npm install --omit=dev
```

6. 启动命令填写：

```bash
npm start
```

7. 端口建议避开已有服务，例如使用 `3010`：

```text
容器端口：3010
主机端口：3010
```

如果你已经有其他 Node.js 容器占用 `3000`，这里不要再填 `3000`。

注意：不要把 `3010` 填到 `Hosts`、`主机映射`、`add-host` 之类字段里。那些字段不是端口映射，填错会出现类似错误：

```text
invalid IP address in add-host: "3010"
```

这类字段保持为空即可。

8. 在项目根目录创建 `.env`，或在 1Panel 环境变量里添加：

```env
PORT=3010
APP_PASSWORD=你的访问密码
SESSION_SECRET=一串随机字符
BASE_URL=https://你的图床域名
MAX_FILE_SIZE_MB=10
UPLOAD_DIR=uploads
DATA_DIR=data
THUMB_DIR=thumbs
TRUST_PROXY=true
COOKIE_SECURE=true
```

`BASE_URL` 写正式域名，不需要带 `:3010`，例如：

```text
https://img.example.com
```

9. 数据持久化重点关注以下目录：

```text
/opt/qingfeng-image-host/uploads
/opt/qingfeng-image-host/thumbs
/opt/qingfeng-image-host/data
```

如果 1Panel 的项目目录本身就是宿主机持久目录，通常不需要额外挂载整个项目目录。部署后可以上传一张测试图片，然后重启容器确认图片和目录仍然存在。

如果你的运行环境支持挂载目录，也可以额外确认：

```text
宿主机目录：/opt/qingfeng-image-host/uploads
容器目录：/opt/qingfeng-image-host/uploads
```

```text
宿主机目录：/opt/qingfeng-image-host/thumbs
容器目录：/opt/qingfeng-image-host/thumbs
```

```text
宿主机目录：/opt/qingfeng-image-host/data
容器目录：/opt/qingfeng-image-host/data
```

10. 启动 Node.js 运行环境后，创建网站并配置反向代理：

```text
http://127.0.0.1:3010
```

如果 1Panel 的反向代理无法访问 `127.0.0.1`，改用容器名：

```text
http://qingfeng-image-host:3010
```

11. 在 1Panel 给域名申请 SSL 证书。完成后访问：

```text
https://你的图床域名
```

## 宝塔面板部署

1. 安装 Node.js 版本管理器或 Node 项目管理器，Node.js 建议 18+。
2. 上传项目到服务器，例如 `/www/wwwroot/private-image-host`。
3. 在项目目录执行：

```bash
npm install --omit=dev
cp .env.example .env
```

4. 编辑 `.env`，至少修改：

```env
APP_PASSWORD=你的访问密码
SESSION_SECRET=一串随机字符
BASE_URL=https://你的图床域名
TRUST_PROXY=true
COOKIE_SECURE=true
```

5. 在宝塔 Node 项目里添加项目：

- 项目目录：`/www/wwwroot/private-image-host`
- 启动文件：`server.js`
- 项目端口：`3000`
- 启动命令：`npm start`

6. 创建站点并反向代理到：

```text
http://127.0.0.1:3000
```

7. 给站点配置 SSL。

## Nginx 反向代理参考

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 直链格式

上传后后台会生成类似：

```text
https://img.example.com/i/blog/cover.png
```

图片直链不需要登录，后台管理接口需要登录。

## API 调用（主题联动 / AI 写文章）

除后台密码会话外，接口支持 Token 鉴权，供青枫主题选图面板、外部 AI 工具、MiMo 等程序化调用。

### 鉴权

在 `.env` 配置 `API_TOKEN`（只读）和 `API_TOKEN_WRITE`（上传，可选），请求头带：

```text
Authorization: Bearer <token>
```

也接受 `X-Api-Token: <token>`。Token 只授予对应接口的访问权，不会登录后台；后台会话与 Token 互不影响。

### 接口一览

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/tree?path=/` | 会话或只读 Token | 目录树（含递归图片数） |
| GET | `/api/items?path=/blog` | 会话或只读 Token | 指定目录的子目录和图片（含直链 `url`） |
| GET | `/api/images/search?q=封面` | 会话或只读 Token | 按文件名/路径搜索，最多 200 条 |
| POST | `/api/upload` | 会话或写入 Token | multipart 上传，字段名 `images`，`path` 指定目标目录 |
| GET | `/i/路径/文件.png` | 公开 | 图片直链，无鉴权 |

目录、文件名请求参数均为 `/` 开头的绝对路径，如 `/blog/2026`。

### curl 示例

```bash
# 列目录
curl -H "Authorization: Bearer $API_TOKEN" "https://img.example.com/api/items?path=/blog"

# 搜图
curl -H "Authorization: Bearer $API_TOKEN" "https://img.example.com/api/images/search?q=封面"

# 上传（需要 API_TOKEN_WRITE）
curl -H "Authorization: Bearer $API_TOKEN_WRITE" -F "images=@cover.png" -F "path=/blog" \
  "https://img.example.com/api/upload"
```

### 给 AI 工具的调用说明

外部 AI 工具通过 WordPress REST API 发布文章时，把下面这段连同 Token 一起提供给它，它就能自动从图床取图配图：

```text
图床 API：
- 基地址：https://img.example.com（按实际 BASE_URL）
- 鉴权：请求头 Authorization: Bearer <你的只读Token>
- 列目录：GET /api/items?path=/目录（返回 folders 和 images，images[].url 即图片直链）
- 搜图：GET /api/images/search?q=关键词
- 配图方式：把 images[].url 以 <img src="直链"> 写入文章 content，直链公开可访问、永久不变
- 需要上传新图时：POST /api/upload（-F images=@文件 -F path=/目录），用写入 Token
发布文章：POST <WP地址>/wp-json/wp/v2/posts（应用密码 Basic 认证），content 里包含 <img> 标签即可。
```
