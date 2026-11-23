# 青枫图床

一个轻量级私有图床程序，适合个人网站调用图片直链。后台需要访问密码，图片直链默认公开访问，方便放到博客、站点和 Markdown 里。

## 功能

- 访问密码登录后台；密码与 Token 用命令行设置，网页不存明文
- 多级目录：创建（支持 `\aaa\bbb\ccc` 一次建多级）、浏览、搜索、右键删除（带确认）、数量按子目录累计
- 图片名称/路径搜索；单图、多图、拖拽、粘贴上传（Ctrl+V），带进度和批量直链输出
- 自动处理重名、网格预览、一键复制直链和 Markdown、删除/重命名
- 列表分页加载，大数据量不卡顿；本地文件存储，无数据库依赖

## Docker 部署（Linux 服务器）

在装有 Docker 的服务器上执行以下步骤。直接拉取镜像时，服务器无需克隆源码。已有图床要恢复或更新时，先用 `docker ps -a` 查看容器，确认原来的端口和数据挂载目录。

### 方式一：直接拉取镜像

示例使用容器名 `qingfeng-image-host`、宿主机端口 `3010` 和数据目录 `/data/qingfeng-image-host`。如果这些已被另一套图床使用，请为新实例改用独立的名称、空闲端口和数据目录。端口映射 `3010:3000` 左边是服务器端口，右边是容器内端口。

#### 带注释版

```bash
# 1. 首次部署时创建数据目录，并授权给容器用户（UID 1001）
sudo install -d -m 0755 -o 1001 -g 1001 /data/qingfeng-image-host

# 2. 从 GitHub Container Registry 拉取镜像
docker pull ghcr.io/sseven01/qingfeng-image-host:master

# 3. 后台启动容器，将服务器的 3010 端口映射到容器的 3000 端口
docker run -d --name qingfeng-image-host --restart unless-stopped \
  -p 3010:3000 \
  -v /data/qingfeng-image-host:/app/storage \
  ghcr.io/sseven01/qingfeng-image-host:master
```

```bash
# 4. 单独执行此命令，按提示输入后台密码并再次确认
docker exec -it qingfeng-image-host node cli.js password
```

#### 无注释版（直接复制）

先复制这一块启动容器。如果已用上面的带注释版启动，直接跳到密码设置。以 root 登录且没有 `sudo` 时，去掉第一行的 `sudo`。

```bash
sudo install -d -m 0755 -o 1001 -g 1001 /data/qingfeng-image-host &&
docker pull ghcr.io/sseven01/qingfeng-image-host:master &&
docker run -d --name qingfeng-image-host --restart unless-stopped \
  -p 3010:3000 \
  -v /data/qingfeng-image-host:/app/storage \
  ghcr.io/sseven01/qingfeng-image-host:master
```

启动成功后，单独复制并执行密码命令。

```bash
docker exec -it qingfeng-image-host node cli.js password
```

输入至少 6 位密码后按回车，再输入同一个密码确认。**输入时终端不会显示字符。** 如果误按回车导致密码为空，重新执行密码命令即可。

### 方式二：用脚本交互式部署

把项目里的 `deploy.sh` 上传到服务器，在脚本所在目录运行：

```bash
bash deploy.sh
```

按提示选择容器名、宿主机端口和数据目录。直接回车使用默认值，其中端口默认是 `3000`，也可以输入 `3010` 或其他空闲端口。脚本会拉取同一个 GHCR 镜像并启动容器。首次部署完成后，运行脚本打印的密码命令完成初始化。

### 登录与检查

- 用 `docker ps --filter name=qingfeng-image-host` 查看容器状态。启动异常时用 `docker logs --tail 50 qingfeng-image-host` 查看日志。
- 直接访问时，打开 `http://服务器IP:3010`。如果连不上，确认使用的是实际映射端口，以及防火墙或安全组是否放行该端口。
- 用域名访问时，将 Nginx 或 1Panel 反代指向 `http://127.0.0.1:3010`（反代与 Docker 在同一宿主机且可访问该端口时）。配置 HTTPS 后，在图床后台「设置」填写正式的 HTTPS 地址作为图片直链前缀。

### 更新已有容器

先确认现有容器的镜像、端口和数据挂载。把命令里的名称换成实际容器名。

```bash
docker inspect qingfeng-image-host --format '{{.Config.Image}} {{json .Mounts}} {{json .HostConfig.PortBindings}}'
```

拉取新镜像成功后，再用 `docker rm -f qingfeng-image-host` 删除旧容器，并按原端口、数据挂载和环境变量重新执行 `docker run`。沿用原数据目录即可继续使用原有图片和密码。需要固定版本时，在拉取和启动命令中使用同一个版本标签，例如 `v0.2.1`。

### Docker Compose（本地构建）

在项目目录执行 `docker compose up -d --build`。可在 `.env` 中设置 `QF_ROOT=/data/qingfeng-image-host` 指定宿主机数据目录，默认挂载项目目录。若宿主机的 `3000` 已被占用，在 `docker-compose.yml` 中将端口映射改为 `3010:3000` 或其他空闲端口。


## 配置

优先级：**环境变量（可选） > `data/config.json` > 默认值**。不写 `.env` 也能完整运行。

| 信息 | 在哪里配 |
|---|---|
| 后台登录密码 | 终端 `node cli.js password`（容器内 `docker exec -it qingfeng-image-host node cli.js password`） |
| 只读 / 读写 Token | 终端 `node cli.js token`（`--write` 为读写） |
| 图床地址 BASE_URL、上传大小 | 后台「设置」（上传大小改动需重启容器生效） |
| SESSION_SECRET | 无需配置，首次启动自动生成并持久化 |
| 查看全部配置状态 | 终端 `node cli.js status`（Token 明文显示，方便复制） |

敏感信息只在终端设置、网页后台不展示明文；存在同名环境变量时 CLI 会拒绝写入（环境变量优先，写了不生效）。

### 环境变量（全部可选）

```env
PORT=3000                      # 监听端口（仅环境变量）
APP_PASSWORD=                  # 后台密码（不设则用 CLI 配置）
SESSION_SECRET=                # 不设则首次启动自动生成
BASE_URL=                      # 图片直链前缀（不设则在后台设置）
MAX_FILE_SIZE_MB=              # 不设则 10，后台可改（重启生效）
UPLOAD_DIR=uploads             # 一般无需设置：挂载主文件夹时三个子目录自动推导
DATA_DIR=data
THUMB_DIR=thumbs
TRUST_PROXY=false              # 仅环境变量
COOKIE_SECURE=false            # 仅环境变量
API_TOKEN=                     # 只读 Token（不设则用 CLI 生成）
API_TOKEN_WRITE=               # 读写 Token（不设则用 CLI 生成）
```

- `API_TOKEN`：只读 Token，开放 `tree` / `items` / `search` 接口给主题、AI 等程序化调用。
- `API_TOKEN_WRITE`：额外开放 `/api/upload`。与只读 Token 分开，不上传就不生成。

生产建议：密码和 Token 用 CLI 生成随机强值；`BASE_URL` 在后台设置为正式域名；走 HTTPS 反代时打开 `TRUST_PROXY` 和 `COOKIE_SECURE`。

## 目录与备份

```text
<主文件夹>/          # 部署时选定（-v 主文件夹:/app/storage）
  uploads/           # 图片文件
  data/              # meta.json、config.json（密码与 Token 在这里）
  thumbs/            # 预留
```

- 只挂载 `/app/storage` 时程序自动使用主文件夹下三个子目录；不挂载则用程序目录下的旧布局（`uploads/`、`data/`），现有部署不受影响。
- `UPLOAD_DIR` 等环境变量可强制指定，优先级最高。
- 备份重点：`uploads/`、`thumbs/`、`data/`。

## 其他部署方式

### 本地运行（开发调试）

```bash
npm install
npm start
node cli.js password   # 另开终端，设置后台密码
```

打开 `http://localhost:3000` 登录，图床地址在后台「设置」里填。

### 1Panel 部署（Node.js 运行环境）

假设项目目录 `/opt/qingfeng-image-host`。

1. 创建 Node.js 运行环境（Node 18/20），代码来源选 Git：`https://github.com/sseven01/qingfeng-image-host.git`，分支 `main`，项目目录 `/opt/qingfeng-image-host`。
2. 安装命令 `npm install --omit=dev`，启动命令 `npm start`。
3. 端口用 `3010`（避开已有服务的 3000）。**不要**把端口号填进 `Hosts`/`主机映射`/`add-host` 字段，否则报 `invalid IP address in add-host: "3010"`，保持那些字段为空。
4. 环境变量按需配置（全部可选，密码可用 `node cli.js password` 设置）：

```env
PORT=3010
BASE_URL=https://你的图床域名     # 正式域名，不带 :3010
TRUST_PROXY=true
COOKIE_SECURE=true
```

5. 数据持久化检查：项目目录本身就是宿主机持久目录，确认 `/opt/qingfeng-image-host/{uploads,data,thumbs}` 存在；上传一张测试图，重启容器后仍在即正常。
6. 创建网站反向代理到 `http://127.0.0.1:3010`（无法访问 127.0.0.1 时改用容器名 `http://qingfeng-image-host:3010`），申请 SSL 证书后访问 `https://你的图床域名`。

### 宝塔面板部署

1. 安装 Node.js 18+，上传项目到例如 `/www/wwwroot/private-image-host`。
2. 项目目录执行 `npm install --omit=dev`。
3. 添加 Node 项目：目录同上，启动文件 `server.js`，端口 `3000`，启动命令 `npm start`。
4. 环境变量按需（可选）：`BASE_URL`、`TRUST_PROXY=true`、`COOKIE_SECURE=true`；密码用 `node cli.js password` 设置。
5. 创建站点反向代理到 `http://127.0.0.1:3000`，配置 SSL。

### Nginx 反向代理参考

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 使用

### 直链格式

上传后生成类似：

```text
https://img.example.com/i/blog/cover.png
```

图片直链不需要登录，后台管理接口需要登录。

### API 调用（主题联动 / AI 写文章）

除后台密码会话外，接口支持 Token 鉴权，供青枫主题选图面板、独立插件、外部 AI 工具、MiMo 等程序化调用。

**鉴权**：Token 用 `node cli.js token` 生成（或环境变量 `API_TOKEN`），请求头带：

```text
Authorization: Bearer <token>
```

也接受 `X-Api-Token: <token>`。Token 只授予对应接口的访问权，不会登录后台；后台会话与 Token 互不影响。

**接口一览**：

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/tree?path=/` | 会话或只读 Token | 目录树（含递归图片数） |
| GET | `/api/items?path=/blog` | 会话或只读 Token | 指定目录的子目录和图片（含直链 `url`） |
| GET | `/api/images/search?q=封面` | 会话或只读 Token | 按文件名/路径搜索，最多 200 条 |
| POST | `/api/upload` | 会话或写入 Token | multipart 上传，字段名 `images`，`path` 指定目标目录 |
| GET | `/i/路径/文件.png` | 公开 | 图片直链，无鉴权 |

目录、文件名参数均为 `/` 开头的绝对路径，如 `/blog/2026`。

**curl 示例**：

```bash
# 列目录
curl -H "Authorization: Bearer $API_TOKEN" "https://img.example.com/api/items?path=/blog"

# 搜图
curl -H "Authorization: Bearer $API_TOKEN" "https://img.example.com/api/images/search?q=封面"

# 上传（需要写入 Token）
curl -H "Authorization: Bearer $API_TOKEN_WRITE" -F "images=@cover.png" -F "path=/blog" \
  "https://img.example.com/api/upload"
```

**给 AI 工具的调用说明**：外部 AI 工具通过 WordPress REST API 发布文章时，把这段连同 Token 提供给它即可自动配图：

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
