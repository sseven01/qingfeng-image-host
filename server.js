require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const sharp = require("sharp");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const compression = require("compression");

const app = express();
const rootDir = __dirname;
const uploadRoot = path.resolve(rootDir, process.env.UPLOAD_DIR || "uploads");
const thumbRoot = path.resolve(rootDir, process.env.THUMB_DIR || "thumbs");
const dataRoot = path.resolve(rootDir, process.env.DATA_DIR || "data");
const tmpRoot = path.resolve(rootDir, "tmp");
const metaPath = path.join(dataRoot, "meta.json");
const port = Number(process.env.PORT || 3000);
const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB || 10);
const appPassword = process.env.APP_PASSWORD || "change-this-password";
const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, "");
const allowedExts = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
const allowedMimes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml"
]);

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "登录尝试过于频繁，请15分钟后再试" },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(morgan("short"));
app.use(compression());

const upload = multer({
  storage: multer.diskStorage({
    destination: tmpRoot,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
    }
  }),
  limits: { fileSize: maxFileSizeMb * 1024 * 1024, files: 50 }
});

app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    name: "pih.sid",
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);
app.use(express.static(path.join(rootDir, "public")));

let metaCache = null;

async function ensureBaseDirs() {
  await fsp.mkdir(uploadRoot, { recursive: true });
  await fsp.mkdir(thumbRoot, { recursive: true });
  await fsp.mkdir(dataRoot, { recursive: true });
  await fsp.mkdir(tmpRoot, { recursive: true });
  try {
    await fsp.access(metaPath);
  } catch {
    await writeMeta({ images: [] });
  }
}

async function readMeta() {
  await ensureBaseDirs();
  if (metaCache) return metaCache;
  const raw = await fsp.readFile(metaPath, "utf8");
  metaCache = JSON.parse(raw || '{"images":[]}');
  return metaCache;
}

async function writeMeta(meta) {
  await fsp.mkdir(dataRoot, { recursive: true });
  const temp = `${metaPath}.${Date.now()}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(meta, null, 2), "utf8");
  await fsp.rename(temp, metaPath);
  metaCache = meta;
}

function safeCompare(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  return res.status(401).json({ error: "请先登录" });
}

function normalizeFolder(input = "/") {
  let value = String(input || "/").replace(/\\/g, "/").trim();
  if (!value.startsWith("/")) value = `/${value}`;
  value = path.posix.normalize(value);
  if (value === ".") value = "/";
  if (value.includes("..")) throw new Error("目录路径不合法");
  return value === "/" ? "/" : value.replace(/\/+$/, "");
}

function folderToDisk(folder) {
  const normalized = normalizeFolder(folder);
  const target = path.resolve(uploadRoot, `.${normalized}`);
  if (!target.startsWith(uploadRoot)) throw new Error("目录路径越界");
  return target;
}

function fileToDisk(publicPath) {
  const normalized = normalizePublicPath(publicPath);
  const target = path.resolve(uploadRoot, `.${normalized}`);
  if (!target.startsWith(uploadRoot)) throw new Error("文件路径越界");
  return target;
}

function thumbToDisk(publicPath) {
  const normalized = normalizePublicPath(publicPath);
  const target = path.resolve(thumbRoot, `.${normalized}`);
  if (!target.startsWith(thumbRoot)) throw new Error("缩略图路径越界");
  return target;
}

function normalizePublicPath(input) {
  let value = String(input || "").replace(/\\/g, "/").trim();
  if (!value.startsWith("/")) value = `/${value}`;
  value = path.posix.normalize(value);
  if (value === "/" || value.includes("..")) throw new Error("文件路径不合法");
  return value;
}

function sanitizeName(input, fallback = "file") {
  const value = String(input || "")
    .normalize("NFKD")
    .replace(/[^\w.\-\u4e00-\u9fa5 ]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/[.-]+$/, "");
  return value || fallback;
}

function buildFolderPath(parent, input) {
  const raw = String(input || "").replace(/\\/g, "/").trim();
  if (!raw) throw new Error("目录路径不能为空");
  const isAbsolute = raw.startsWith("/");
  const parts = raw
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => sanitizeName(part, ""));
  if (!parts.length || parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("目录路径不合法");
  }
  return normalizeFolder(path.posix.join(isAbsolute ? "/" : normalizeFolder(parent || "/"), ...parts));
}

function publicUrl(publicPath) {
  return `${baseUrl}/i${encodeURI(publicPath).replace(/%2F/g, "/")}`;
}

function thumbPublicUrl(publicPath) {
  return `${baseUrl}/t${encodeURI(publicPath).replace(/%2F/g, "/")}`;
}

function withImageUrl(image) {
  const url = publicUrl(image.path);
  const thumbUrl = image.mime !== "image/svg+xml" ? thumbPublicUrl(image.path) : url;
  return { ...image, url, thumbUrl };
}

async function uniqueFilePath(folder, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const rawBase = path.basename(originalName, ext);
  const safeBase = sanitizeName(rawBase, "image");
  const dir = folderToDisk(folder);
  let filename = `${safeBase}${ext}`;
  let diskPath = path.join(dir, filename);
  let index = 1;
  while (fs.existsSync(diskPath)) {
    filename = `${safeBase}-${index}${ext}`;
    diskPath = path.join(dir, filename);
    index += 1;
  }
  return { filename, diskPath, publicPath: path.posix.join(normalizeFolder(folder), filename) };
}

async function generateThumbnail(sourcePath, publicPath, mime) {
  if (mime === "image/svg+xml") return;
  const targetPath = thumbToDisk(publicPath);
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await sharp(sourcePath)
    .resize(400, undefined, { withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(targetPath);
}

async function listFolders(current = "/") {
  const folder = folderToDisk(current);
  const entries = await fsp.readdir(folder, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.posix.join(normalizeFolder(current), entry.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function buildRecursiveImageCounts(images) {
  const counts = new Map();
  for (const image of images) {
    const folder = normalizeFolder(image.folder || "/");
    const parts = folder.split("/").filter(Boolean);
    counts.set("/", (counts.get("/") || 0) + 1);
    let current = "/";
    for (const part of parts) {
      current = current === "/" ? `/${part}` : `${current}/${part}`;
      counts.set(current, (counts.get(current) || 0) + 1);
    }
  }
  return counts;
}

async function buildTree(current = "/", imageCounts = new Map()) {
  const children = await listFolders(current);
  return {
    name: current === "/" ? "全部图片" : path.posix.basename(current),
    path: current,
    imageCount: imageCounts.get(current) || 0,
    children: await Promise.all(children.map((child) => buildTree(child.path, imageCounts)))
  };
}

app.get("/", (req, res) => {
  res.sendFile(path.join(rootDir, "public", "index.html"));
});

app.post("/api/login", loginLimiter, (req, res) => {
  const password = req.body && req.body.password;
  if (!safeCompare(password || "", appPassword)) {
    return res.status(401).json({ error: "访问密码错误" });
  }
  req.session.authed = true;
  return res.json({ ok: true });
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({ authed: Boolean(req.session && req.session.authed) });
});

app.get("/api/tree", requireAuth, async (req, res, next) => {
  try {
    await ensureBaseDirs();
    const meta = await readMeta();
    const imageCounts = buildRecursiveImageCounts(meta.images);
    res.json(await buildTree("/", imageCounts));
  } catch (error) {
    next(error);
  }
});

app.get("/api/items", requireAuth, async (req, res, next) => {
  try {
    const folder = normalizeFolder(req.query.path || "/");
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    await fsp.mkdir(folderToDisk(folder), { recursive: true });
    const meta = await readMeta();
    const imageCounts = buildRecursiveImageCounts(meta.images);
    const folders = (await listFolders(folder)).map((item) => ({
      ...item,
      imageCount: imageCounts.get(item.path) || 0
    }));
    const folderImages = meta.images
      .filter((image) => image.folder === folder)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = folderImages.length;
    const offset = (page - 1) * limit;
    const images = folderImages.slice(offset, offset + limit).map(withImageUrl);
    res.json({ path: folder, folders, images, page, limit, total, hasMore: offset + limit < total });
  } catch (error) {
    next(error);
  }
});

app.get("/api/images/search", requireAuth, async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim().toLowerCase();
    if (!query) return res.json({ images: [] });
    const meta = await readMeta();
    const images = meta.images
      .filter((image) => {
        const haystack = `${image.filename} ${image.originalName} ${image.path} ${image.folder}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 200)
      .map(withImageUrl);
    res.json({ images });
  } catch (error) {
    next(error);
  }
});

app.post("/api/folders", requireAuth, async (req, res, next) => {
  try {
    const parent = normalizeFolder(req.body.parent || "/");
    const folder = buildFolderPath(parent, req.body.path || req.body.name);
    await fsp.mkdir(folderToDisk(folder), { recursive: true });
    res.json({ ok: true, path: folder });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/folders", requireAuth, async (req, res, next) => {
  try {
    const folder = normalizeFolder(req.query.path);
    if (folder === "/") return res.status(400).json({ error: "不能删除根目录" });
    const meta = await readMeta();
    const prefix = `${folder}/`;
    const before = meta.images.length;
    meta.images = meta.images.filter((image) => image.folder !== folder && !image.folder.startsWith(prefix));
    await fsp.rm(folderToDisk(folder), { recursive: true, force: true });
    await fsp.rm(thumbToDisk(folder), { recursive: true, force: true }).catch(() => {});
    await writeMeta(meta);
    res.json({ ok: true, deletedImages: before - meta.images.length });
  } catch (error) {
    next(error);
  }
});

app.post("/api/upload", requireAuth, upload.array("images", 50), async (req, res, next) => {
  try {
    const folder = normalizeFolder(req.body.path || "/");
    await fsp.mkdir(folderToDisk(folder), { recursive: true });
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "请选择图片" });

    const meta = await readMeta();
    const saved = [];
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowedExts.has(ext) || !allowedMimes.has(file.mimetype)) {
        await fsp.rm(file.path, { force: true });
        return res.status(400).json({ error: `不支持的文件类型：${file.originalname}` });
      }
      const target = await uniqueFilePath(folder, file.originalname);
      await fsp.mkdir(path.dirname(target.diskPath), { recursive: true });
      await fsp.rename(file.path, target.diskPath);

      let width = null;
      let height = null;
      try {
        const metadata = await sharp(target.diskPath).metadata();
        width = metadata.width || null;
        height = metadata.height || null;
      } catch {}

      await generateThumbnail(target.diskPath, target.publicPath, file.mimetype);

      const item = {
        id: crypto.randomUUID(),
        folder,
        filename: target.filename,
        originalName: file.originalname,
        path: target.publicPath,
        size: file.size,
        mime: file.mimetype,
        width,
        height,
        createdAt: new Date().toISOString()
      };
      meta.images.push(item);
      saved.push({ ...item, url: publicUrl(item.path), thumbUrl: thumbPublicUrl(item.path) });
    }
    await writeMeta(meta);
    res.json({ ok: true, images: saved });
  } catch (error) {
    const files = req.files || [];
    for (const file of files) {
      await fsp.rm(file.path, { force: true });
    }
    next(error);
  }
});

app.patch("/api/images/:id", requireAuth, async (req, res, next) => {
  try {
    const meta = await readMeta();
    const image = meta.images.find((item) => item.id === req.params.id);
    if (!image) return res.status(404).json({ error: "图片不存在" });

    const nextFolder = req.body.folder ? normalizeFolder(req.body.folder) : image.folder;
    const nextName = req.body.filename ? sanitizeName(req.body.filename, "image") : image.filename;
    const ext = path.extname(image.filename);
    const normalizedName = path.extname(nextName) ? nextName : `${nextName}${ext}`;
    if (!allowedExts.has(path.extname(normalizedName).toLowerCase())) {
      return res.status(400).json({ error: "文件扩展名不合法" });
    }

    await fsp.mkdir(folderToDisk(nextFolder), { recursive: true });
    const oldDisk = fileToDisk(image.path);
    const nextPublicPath = path.posix.join(nextFolder, normalizedName);
    const nextDisk = fileToDisk(nextPublicPath);
    if (oldDisk !== nextDisk && fs.existsSync(nextDisk)) {
      return res.status(400).json({ error: "目标文件名已存在" });
    }
    await fsp.rename(oldDisk, nextDisk);

    const oldThumb = thumbToDisk(image.path);
    const newThumb = thumbToDisk(nextPublicPath);
    try {
      await fsp.access(oldThumb);
      await fsp.mkdir(path.dirname(newThumb), { recursive: true });
      await fsp.rename(oldThumb, newThumb);
    } catch {}

    image.folder = nextFolder;
    image.filename = normalizedName;
    image.path = nextPublicPath;
    await writeMeta(meta);
    res.json({ ok: true, image: withImageUrl(image) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/images/:id", requireAuth, async (req, res, next) => {
  try {
    const meta = await readMeta();
    const index = meta.images.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "图片不存在" });
    const [image] = meta.images.splice(index, 1);
    await fsp.rm(fileToDisk(image.path), { force: true });
    await fsp.rm(thumbToDisk(image.path), { force: true }).catch(() => {});
    await writeMeta(meta);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/i/*", async (req, res, next) => {
  try {
    const publicPath = normalizePublicPath(`/${req.params[0]}`);
    res.sendFile(fileToDisk(publicPath), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/t/*", async (req, res, next) => {
  try {
    const publicPath = normalizePublicPath(`/${req.params[0]}`);
    const diskPath = thumbToDisk(publicPath);
    try {
      await fsp.access(diskPath);
      return res.sendFile(diskPath, {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable"
        }
      });
    } catch {
      return res.sendFile(fileToDisk(publicPath), {
        headers: {
          "Cache-Control": "public, max-age=86400"
        }
      });
    }
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }
  console.error(error);
  const status = error.code === "ENOENT" ? 404 : 500;
  const message = status === 404 ? "资源不存在" : error.message || "服务器错误";
  res.status(status).json({ error: message });
});

async function startup() {
  await ensureBaseDirs();
  const tmpFiles = await fsp.readdir(tmpRoot).catch(() => []);
  await Promise.all(tmpFiles.map((f) => fsp.rm(path.join(tmpRoot, f), { force: true })));
  app.listen(port, () => {
    console.log(`Private image host running at http://localhost:${port}`);
  });
}

startup();
