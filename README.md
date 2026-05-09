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
```

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
