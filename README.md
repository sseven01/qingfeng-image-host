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
- 单图、多图、拖拽上传
- 多图上传后输出本次上传的全部直链和 Markdown
- 自动处理重名文件
- 图片网格预览
- 一键复制直链和 Markdown
- 删除、重命名图片
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
TRUST_PROXY=false
```

生产环境建议：

- `APP_PASSWORD` 改成强密码
- `SESSION_SECRET` 改成随机长字符串
- `BASE_URL` 改成你的图床域名
- 如果通过反向代理启用 HTTPS，可设置 `TRUST_PROXY=true`

## 目录说明

```text
private-image-host/
  data/           # 元数据 meta.json
  uploads/        # 图片文件
  public/         # 前端页面
  server.js       # 服务端
```

备份时重点备份 `uploads/` 和 `data/meta.json`。

## 1Panel 部署

1. 在服务器安装 Node.js 18 或更高版本。
2. 上传项目到服务器，例如 `/opt/private-image-host`。
3. 在项目目录执行：

```bash
npm install --omit=dev
cp .env.example .env
```

4. 编辑 `.env`：

```env
PORT=3000
APP_PASSWORD=你的访问密码
SESSION_SECRET=一串随机字符
BASE_URL=https://你的图床域名
TRUST_PROXY=true
```

5. 在 1Panel 创建网站，选择反向代理到：

```text
http://127.0.0.1:3000
```

6. 用 1Panel 的进程守护、Supervisor 或应用运行命令启动：

```bash
npm start
```

7. 在 1Panel 给域名申请 SSL 证书。

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
