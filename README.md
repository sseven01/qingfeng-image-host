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
npm start
```

另开一个终端设置后台密码（首次必做）：

```bash
node cli.js password
```

打开 `http://localhost:3000` 登录，图床地址等普通设置在后台「设置」里填。

## 配置

配置优先级：**环境变量（可选） > `data/config.json` > 默认值**。推荐用 CLI 和后台设置管理，不写任何 `.env` 也能跑；环境变量只在需要固定部署参数（端口、代理）时使用。

### 推荐配置方式

| 信息 | 在哪里配 | 命令 / 入口 |
|---|---|---|
| 后台登录密码 | 终端 CLI | `node cli.js password` |
| 只读 / 读写 Token | 终端 CLI | `node cli.js token`（`--write` 为读写） |
| 图床地址 BASE_URL、上传大小 | 后台「设置」 | 侧栏 → 设置 |
| SESSION_SECRET | 无需配置 | 首次启动自动生成并保存 |
| 查看全部配置状态 | 终端 CLI | `node cli.js status` |

Docker 部署时命令形如：`docker exec -it qingfeng-image-host node cli.js password`。

敏感信息（密码、Token）只在终端设置、只存配置文件，**网页后台不展示明文**；存在同名环境变量时 CLI 会拒绝写入（环境变量优先，写了也不生效）。

### 环境变量（全部可选）

```env
PORT=3000                      # 监听端口（仅环境变量）
APP_PASSWORD=                  # 后台密码（不设则用 CLI 配置）
SESSION_SECRET=                # 不设则首次启动自动生成
BASE_URL=                      # 图片直链前缀（不设则在后台设置）
MAX_FILE_SIZE_MB=              # 不设则 10，后台可改（重启生效）
UPLOAD_DIR=uploads
DATA_DIR=data
THUMB_DIR=thumbs
TRUST_PROXY=false              # 仅环境变量
COOKIE_SECURE=false            # 仅环境变量
API_TOKEN=                     # 只读 Token（不设则用 CLI 生成）
API_TOKEN_WRITE=               # 读写 Token（不设则用 CLI 生成）
```

- `API_TOKEN`：只读 Token，开放 `/api/tree`、`/api/items`、`/api/images/search` 给主题、AI 工具等程序化调用。
- `API_TOKEN_WRITE`：读写 Token，额外开放 `/api/upload`。与只读 Token 分开，建议不上传就不要生成。

生产环境建议：

- 密码和 Token 用 CLI 生成随机强值，不要沿用示例
- `BASE_URL` 在后台设置成你的图床域名
- 如果通过反向代理启用 HTTPS，设置 `TRUST_PROXY=true` 和 `COOKIE_SECURE=true`

## 目录说明

```text
<主文件夹>/           # 部署时选定，docker run -v 主文件夹:/app/storage
  uploads/            # 图片文件
  data/               # 元数据 meta.json、配置 config.json
  thumbs/             # 缩略图（预留）
private-image-host/   # 程序目录（源码部署或不挂载时）
  public/             # 前端页面
  server.js           # 服务端
  cli.js              # 命令行配置工具
```

只挂载 `/app/storage` 时程序自动使用主文件夹下的三个子目录；不挂载则保持旧布局（程序目录下的 `uploads/`、`data/`）。`UPLOAD_DIR` 等环境变量可强制指定，优先级最高。

备份时重点备份 `uploads/`、`thumbs/` 和 `data/`（密码与 Token 在 `data/config.json` 里）。

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

### 方式一：docker run 直接部署（无需 .env）

**部署时只选一个主文件夹**，程序会自动检测挂载点并在其中使用 `uploads`、`data`、`thumbs` 三个子目录（子目录自动创建）。按你的系统选对应命令：

**Linux 服务器（Bash）**

```bash
docker pull ghcr.io/sseven01/qingfeng-image-host:master

QF_ROOT=/data/img   # 换成你的主文件夹

# 首次部署：建目录并授权（容器内以 uid 1001 运行，否则上传会报权限错误）
mkdir -p "$QF_ROOT" && chown -R 1001:1001 "$QF_ROOT"

docker run -d --name qingfeng-image-host --restart unless-stopped -p 3000:3000 \
  -v "$QF_ROOT:/app/storage" \
  ghcr.io/sseven01/qingfeng-image-host:master
```

**macOS（Bash / Zsh）**

```bash
docker pull ghcr.io/sseven01/qingfeng-image-host:master

QF_ROOT=$HOME/qingfeng-img   # 换成你的主文件夹（需在 Docker Desktop 共享目录内）

docker run -d --name qingfeng-image-host --restart unless-stopped -p 3000:3000 \
  -v "$QF_ROOT:/app/storage" \
  ghcr.io/sseven01/qingfeng-image-host:master
```

macOS 不需要 chown（Docker Desktop 自动处理文件权限）。

**Windows（PowerShell + Docker Desktop）**

只有一行挂载参数；PowerShell 换行符是反引号 `` ` ``（不是 Bash 的 `\`），整段复制即可：

```powershell
docker pull ghcr.io/sseven01/qingfeng-image-host:master

$QF_ROOT = "D:\qingfeng-img"   # 换成你的主文件夹

docker run -d --name qingfeng-image-host --restart unless-stopped -p 3000:3000 -v "${QF_ROOT}:/app/storage" ghcr.io/sseven01/qingfeng-image-host:master
```

Windows 也不需要 chown。

部署后的目录结构（主文件夹内自动生成）：

```text
/data/img/            ← 主文件夹（部署时选定）
  uploads/            ← 图片文件
  data/               # meta.json、config.json
  thumbs/             # 缩略图（预留）
```

**启动后（各系统相同）：**

1. 设置后台密码（终端交互输入，立即生效）：

```bash
docker exec -it qingfeng-image-host node cli.js password
```

2. 打开 `http://服务器IP:3000` 登录，进侧栏「设置」填图床地址（`BASE_URL`），保存。

3. 需要给主题/插件/AI 用时，生成 Token（终端显示，可直接复制）：

```bash
docker exec -it qingfeng-image-host node cli.js token          # 只读
docker exec -it qingfeng-image-host node cli.js token --write  # 读写（上传）
```

如果镜像包是私有的，先登录（PAT 需要 `read:packages` 权限；公开包可跳过）：

```bash
echo <PAT> | docker login ghcr.io -u <GitHub用户名> --password-stdin
```

旧版本用 `.env` 部署的也不受影响：环境变量继续优先，与新方式二选一即可。

### 方式二：docker-compose 部署

本仓库自带 `docker-compose.yml`，同样**只挂一个主文件夹**，三个子目录由程序自动使用：

```bash
# 指定主文件夹（.env 里加 QF_ROOT=... 或环境变量传入）：
QF_ROOT=/data/img docker-compose up -d

# 不设置时默认当前目录（uploads、data、thumbs 在项目目录下）
docker-compose up -d
```

默认 `build: .` 本地构建；想改为拉取 GHCR 镜像，把 `build: .` 换成
`image: ghcr.io/sseven01/qingfeng-image-host:master`。

Linux 首次部署同样先授权：`mkdir -p /data/img && chown -R 1001:1001 /data/img`。

常用命令：`docker-compose up -d` 启动、`docker-compose down` 停止、`docker-compose logs -f` 看日志。

### 更新版本

```bash
docker pull ghcr.io/sseven01/qingfeng-image-host:master   # 拉取镜像部署时
docker-compose up -d --build                               # compose 构建部署时
# 或 docker rm -f 后重新 docker run
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
