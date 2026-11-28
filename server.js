require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { pipeline } = require("stream/promises");
const { encodeBackup, readBackup, invalid } = require("./backup");

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const { imageSize } = require("image-size");
const {
  configPath,
  readConfig,
  saveConfig,
  resolveValue,
  hasValue,
  valueSource,
  ensureSessionSecret,
  resolveStorageDir
} = require("./config");

const app = express();
const rootDir = __dirname;
// 挂载 /app/storage 时自动使用 storage/uploads、storage/data、storage/thumbs
const uploadRoot = resolveStorageDir("UPLOAD_DIR", "uploads");
const dataRoot = resolveStorageDir("DATA_DIR", "data");
const thumbRoot = resolveStorageDir("THUMB_DIR", "thumbs");
const metaPath = path.join(dataRoot, "meta.json");
const workFolder = "/.qingfeng-restore";
const incomingBackup = multer({ dest: dataRoot, limits: { files: 1, fields: 2 } });
const rollbackBackup = path.join(dataRoot, "before-restore.qfbackup");
const byName = new Intl.Collator("zh-CN", { numeric: true });
let storageQueue = Promise.resolve();

function storageOperation(handler) {
  return (req, res, next) => {
    const operation = storageQueue.then(() => handler(req, res, next));
    storageQueue = operation.catch(() => {});
    operation.catch(next);
  };
}

const port = Number(process.env.PORT || 3000);
// 敏感项与普通配置均为「环境变量（可选） > data/config.json > 默认值」
// 上传大小在启动时读取一次（multer 限制），后台修改需重启生效
const maxFileSizeMb = Number(resolveValue("MAX_FILE_SIZE_MB", "maxFileSizeMb", 10));
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSizeMb * 1024 * 1024, files: 50 }
});

app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    name: "pih.sid",
    secret: ensureSessionSecret(),
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

async function ensureBaseDirs() {
  await fsp.mkdir(uploadRoot, { recursive: true });
  await fsp.mkdir(dataRoot, { recursive: true });
  await fsp.mkdir(thumbRoot, { recursive: true });
  try {
    await fsp.access(metaPath);
  } catch {
    await writeMeta({ images: [] });
  }
}

async function readMeta() {
  await ensureBaseDirs();
  const raw = await fsp.readFile(metaPath, "utf8");
  return JSON.parse(raw || '{"images":[]}');
}

async function writeMeta(meta) {
  await fsp.mkdir(dataRoot, { recursive: true });
  const temp = `${metaPath}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(meta, null, 2), "utf8");
  await fsp.rename(temp, metaPath);
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

function extractToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  const alt = req.headers["x-api-token"];
  return alt ? String(alt).trim() : "";
}

function tokenMatches(token, expected) {
  if (!token || !expected) return false;
  return safeCompare(token, expected);
}

function requireAuthOrToken(req, res, next) {
  if (req.session && req.session.authed) return next();
  if (tokenMatches(extractToken(req), resolveValue("API_TOKEN", "apiToken", ""))) return next();
  return res.status(401).json({ error: "请先登录或提供有效 Token" });
}

function requireAuthOrWriteToken(req, res, next) {
  if (req.session && req.session.authed) return next();
  if (tokenMatches(extractToken(req), resolveValue("API_TOKEN_WRITE", "apiTokenWrite", ""))) return next();
  return res.status(401).json({ error: "请先登录或提供有效写入 Token" });
}

function normalizeFolder(input = "/") {
  let value = String(input || "/").replace(/\\/g, "/").trim();
  if (!value.startsWith("/")) value = `/${value}`;
  value = path.posix.normalize(value);
  if (value === ".") value = "/";
  if (value.includes("..") || value.includes(":") || value.includes("\0") || withinFolder(value.toLowerCase(), workFolder)) throw new Error("目录路径不合法");
  return value === "/" ? "/" : value.replace(/\/+$/, "");
}

function withinFolder(value, folder) {
  return value === folder || value.startsWith(`${folder}/`);
}

function pathKey(value) {
  return value.toLowerCase();
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

function normalizePublicPath(input) {
  let value = String(input || "").replace(/\\/g, "/").trim();
  if (!value.startsWith("/")) value = `/${value}`;
  value = path.posix.normalize(value);
  if (value === "/") throw new Error("文件路径不合法");
  return normalizeFolder(value);
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

function currentBaseUrl() {
  return String(resolveValue("BASE_URL", "baseUrl", `http://localhost:${port}`)).replace(/\/+$/, "");
}

function publicUrl(publicPath) {
  return `${currentBaseUrl()}/i${encodeURI(publicPath).replace(/%2F/g, "/")}`;
}

function withImageUrl(image) {
  return { ...image, url: publicUrl(image.path) };
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

async function listFolders(current = "/") {
  const folder = folderToDisk(current);
  const entries = await fsp.readdir(folder, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && !(current === "/" && entry.name.toLowerCase() === workFolder.slice(1)))
    .map((entry) => ({
      name: entry.name,
      path: path.posix.join(normalizeFolder(current), entry.name)
    }))
    .sort((a, b) => byName.compare(a.name, b.name));
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

function getDimensions(buffer, mime) {
  if (mime === "image/svg+xml") return {};
  try {
    const size = imageSize(buffer);
    return { width: size.width || null, height: size.height || null };
  } catch {
    return {};
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(rootDir, "public", "index.html"));
});

app.post("/api/login", (req, res) => {
  const password = req.body && req.body.password;
  const appPassword = resolveValue("APP_PASSWORD", "appPassword", "change-this-password");
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
  res.json({
    authed: Boolean(req.session && req.session.authed),
    passwordConfigured: hasValue("APP_PASSWORD", "appPassword")
  });
});

app.get("/api/settings", requireAuth, (req, res) => {
  res.json({
    baseUrl: resolveValue("BASE_URL", "baseUrl", `http://localhost:${port}`),
    maxFileSizeMb: Number(resolveValue("MAX_FILE_SIZE_MB", "maxFileSizeMb", 10)),
    tokens: {
      read: hasValue("API_TOKEN", "apiToken"),
      write: hasValue("API_TOKEN_WRITE", "apiTokenWrite")
    },
    sources: {
      baseUrl: valueSource("BASE_URL", "baseUrl"),
      maxFileSizeMb: valueSource("MAX_FILE_SIZE_MB", "maxFileSizeMb")
    },
    configPath,
    rollbackAvailable: fs.existsSync(rollbackBackup)
  });
});

app.post("/api/settings", requireAuth, storageOperation(async (req, res) => {
  const body = req.body || {};
  const patch = {};
  let restartRequired = false;

  if (body.baseUrl !== undefined) {
    const value = String(body.baseUrl || "").trim().replace(/\/+$/, "");
    if (value && !/^https?:\/\//i.test(value)) {
      return res.status(400).json({ error: "图床地址必须以 http:// 或 https:// 开头" });
    }
    if (value) patch.baseUrl = value;
  }

  if (body.maxFileSizeMb !== undefined) {
    const value = Number(body.maxFileSizeMb);
    if (!Number.isFinite(value) || value < 1 || value > 512) {
      return res.status(400).json({ error: "最大上传大小需在 1~512 MB 之间" });
    }
    patch.maxFileSizeMb = String(Math.floor(value));
    restartRequired = true;
  }

  if (Object.keys(patch).length) saveConfig(patch);

  res.json({
    ok: true,
    restartRequired,
    baseUrl: resolveValue("BASE_URL", "baseUrl", `http://localhost:${port}`),
    maxFileSizeMb: Number(resolveValue("MAX_FILE_SIZE_MB", "maxFileSizeMb", 10)),
    sources: {
      baseUrl: valueSource("BASE_URL", "baseUrl"),
      maxFileSizeMb: valueSource("MAX_FILE_SIZE_MB", "maxFileSizeMb")
    }
  });
}));

function backupPath(value, rootAllowed = false) {
  if (typeof value !== "string" || (!rootAllowed && value === "/") ||
      !/^\/(?:[^/]+(?:\/[^/]+)*)?$/.test(value) ||
      /[\\:\x00-\x1f<>"|?*]/.test(value) ||
      value.split("/").slice(1).some((part) => /[ .]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw invalid("备份包含无效路径");
  }
  try {
    if (normalizeFolder(value) === value) return value;
  } catch {}
  throw invalid("备份包含无效路径");
}

function validateBackup(manifest) {
  const { folders, images, settings } = manifest;
  if (!Array.isArray(folders) || !Array.isArray(images) || !settings ||
      typeof settings.baseUrl !== "string" || !/^https?:\/\/[^\s]+$/i.test(settings.baseUrl) ||
      !Number.isInteger(settings.maxFileSizeMb) || settings.maxFileSizeMb < 1 || settings.maxFileSizeMb > 512) {
    throw invalid("备份清单无效");
  }
  const dirs = new Set(["/"]);
  for (const folder of folders) {
    if (dirs.has(pathKey(backupPath(folder)))) throw invalid("目录路径重复");
    dirs.add(pathKey(folder));
  }
  const exactDirs = new Set(["/", ...folders]);
  const ids = new Set();
  const usedPaths = new Set();
  for (const image of images) {
    if (!image || typeof image.id !== "string" || !image.id || ids.has(image.id) ||
        !exactDirs.has(backupPath(image.folder, true)) ||
        typeof image.filename !== "string" ||
        image.path !== path.posix.join(image.folder, image.filename) ||
        path.posix.basename(image.path) !== image.filename ||
        !allowedExts.has(path.extname(image.filename).toLowerCase()) ||
        !allowedMimes.has(image.mime) || !Number.isSafeInteger(image.size) || image.size < 0 ||
        typeof image.originalName !== "string" || typeof image.createdAt !== "string" ||
        !Number.isFinite(Date.parse(image.createdAt))) {
      throw invalid("备份图片记录无效");
    }
    ids.add(image.id);
    const key = pathKey(backupPath(image.path));
    if (usedPaths.has(key) || dirs.has(key)) throw invalid("备份图片路径冲突");
    usedPaths.add(key);
  }
  for (const folder of folders) {
    if (!exactDirs.has(path.posix.dirname(folder))) throw invalid("备份缺少父目录");
  }
}

async function backupManifest() {
  const meta = await readMeta();
  const folders = [];
  async function collect(parent) {
    for (const folder of await listFolders(parent)) {
      folders.push(folder.path);
      await collect(folder.path);
    }
  }
  await collect("/");
  const manifest = {
    folders,
    images: meta.images,
    settings: {
      baseUrl: currentBaseUrl(),
      maxFileSizeMb: Number(resolveValue("MAX_FILE_SIZE_MB", "maxFileSizeMb", 10))
    }
  };
  validateBackup(manifest);
  return manifest;
}

async function planMerge(manifest, current) {
  const occupied = new Set(current.images.map((image) => pathKey(image.path)));
  const ids = new Set(current.images.map((image) => image.id));
  const blocked = new Set();
  const existing = new Map();
  async function collect(dir, relative) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      const item = path.posix.join(relative, entry.name);
      if (item.toLowerCase() === workFolder) continue;
      existing.set(pathKey(item), { item, isDirectory: entry.isDirectory() });
      if (entry.isDirectory()) await collect(path.join(dir, entry.name), item);
    }
  }
  await collect(uploadRoot, "/");
  const skippedFolders = [];
  const folders = [];
  const skippedImages = [];
  const images = [];
  for (const folder of [...manifest.folders].sort((a, b) => a.length - b.length)) {
    const entry = existing.get(pathKey(folder));
    if (blocked.has(path.posix.dirname(folder)) || (entry && (!entry.isDirectory || entry.item !== folder))) {
      blocked.add(folder);
      skippedFolders.push(folder);
    } else if (!entry) {
      folders.push(folder);
    }
  }
  for (const image of manifest.images) {
    const key = pathKey(image.path);
    if (ids.has(image.id) || blocked.has(image.folder) || occupied.has(key) || existing.has(key)) {
      skippedImages.push(image.path);
    } else {
      images.push(image);
    }
  }
  return { folders, images, skippedFolders, skippedImages };
}

function backupFilename() {
  return `qingfeng-${new Date().toISOString().slice(0, 10)}.qfbackup`;
}

app.get("/api/backup", requireAuth, storageOperation(async (req, res) => {
  const manifest = await backupManifest();
  res.set("Cache-Control", "no-store");
  res.attachment(backupFilename());
  await pipeline(encodeBackup(manifest, fileToDisk), res);
}));

app.get("/api/backup/before-restore", requireAuth, storageOperation(async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  await new Promise((resolve) => {
    res.download(rollbackBackup, `before-restore-${backupFilename()}`, (error) => {
      if (error) next(error);
      resolve();
    });
  });
}));

async function mergeBackup(stage, plan, current) {
  const created = [];
  try {
    for (const folder of plan.folders) {
      const dest = folderToDisk(folder);
      await fsp.mkdir(dest);
      created.push(dest);
    }
    for (const image of plan.images) {
      const dest = fileToDisk(image.path);
      await fsp.rename(stage(image.path), dest);
      created.push(dest);
    }
    await writeMeta({ ...current, images: [...current.images, ...plan.images] });
  } catch (error) {
    for (const dest of created.reverse()) await fsp.rm(dest, { recursive: true, force: true });
    throw error;
  }
}

async function replaceBackup(stageRoot, previousRoot, manifest) {
  const snapshot = await backupManifest();
  const temp = `${rollbackBackup}.${crypto.randomUUID()}.tmp`;
  try {
    await pipeline(encodeBackup(snapshot, fileToDisk), fs.createWriteStream(temp, { flags: "wx", mode: 0o600 }));
    await fsp.rename(temp, rollbackBackup);
  } finally {
    await fsp.rm(temp, { force: true });
  }

  const previousSettings = readConfig();
  const moved = [];
  let configChanged = false;
  async function moveEntries(from, to, exclude) {
    for (const entry of await fsp.readdir(from)) {
      if (entry === exclude) continue;
      const source = path.join(from, entry);
      const target = path.join(to, entry);
      await fsp.rename(source, target);
      moved.push([target, source]);
    }
  }
  try {
    await moveEntries(uploadRoot, previousRoot, workFolder.slice(1));
    await moveEntries(stageRoot, uploadRoot);
    saveConfig(manifest.settings);
    configChanged = true;
    await writeMeta({ images: manifest.images });
  } catch (error) {
    for (const [from, to] of moved.reverse()) await fsp.rename(from, to);
    if (configChanged) {
      saveConfig({ baseUrl: previousSettings.baseUrl, maxFileSizeMb: previousSettings.maxFileSizeMb });
    }
    throw error;
  }
}

app.post("/api/backup/restore", requireAuth, incomingBackup.single("backup"), storageOperation(async (req, res) => {
  if (!req.file) throw invalid("请选择备份文件");
  let work;
  let preserveWork = false;
  try {
    const { mode } = req.body;
    const preview = req.body.preview === "true";
    if (mode !== "merge" && mode !== "replace") throw invalid("请选择恢复方式");
    if (!preview) {
      const workRoot = path.join(uploadRoot, workFolder.slice(1));
      await fsp.mkdir(workRoot, { recursive: true, mode: 0o700 });
      work = await fsp.mkdtemp(path.join(workRoot, "restore-"));
      await fsp.mkdir(path.join(work, "incoming"));
      await fsp.mkdir(path.join(work, "previous"));
    }
    const stage = (value) => path.join(work, "incoming", `.${value}`);
    const manifest = await readBackup(req.file.path, validateBackup, preview ? null : stage);
    const current = await readMeta();
    const plan = await planMerge(manifest, current);
    if (preview) {
      return res.json({
        images: manifest.images.length, folders: manifest.folders.length,
        conflicts: plan.skippedImages.length + plan.skippedFolders.length,
        currentImages: current.images.length
      });
    }
    if (mode === "merge") {
      await mergeBackup(stage, plan, current);
      return res.json({
        restored: plan.images.length, skippedImages: plan.skippedImages, skippedFolders: plan.skippedFolders
      });
    }
    for (const folder of manifest.folders) await fsp.mkdir(stage(folder), { recursive: true });
    const previous = path.join(work, "previous");
    try {
      await replaceBackup(path.join(work, "incoming"), previous, manifest);
    } catch (error) {
      preserveWork = (await fsp.readdir(previous)).length > 0;
      throw error;
    }
    res.json({ restored: manifest.images.length, rollback: true });
  } finally {
    await fsp.rm(req.file.path, { force: true });
    if (work && !preserveWork) await fsp.rm(work, { recursive: true, force: true });
  }
}));


app.get("/api/tree", requireAuthOrToken, storageOperation(async (req, res, next) => {
  try {
    await ensureBaseDirs();
    const meta = await readMeta();
    const imageCounts = buildRecursiveImageCounts(meta.images);
    res.json(await buildTree("/", imageCounts));
  } catch (error) {
    next(error);
  }
}));

app.get("/api/items", requireAuthOrToken, storageOperation(async (req, res, next) => {
  try {
    const folder = normalizeFolder(req.query.path || "/");
    const meta = await readMeta();
    const imageCounts = buildRecursiveImageCounts(meta.images);
    const folders = (await listFolders(folder)).map((item) => ({
      ...item,
      imageCount: imageCounts.get(item.path) || 0
    }));
    const sortImages = req.query.sort === "name"
      ? (a, b) => byName.compare(a.filename, b.filename)
      : (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
    const allImages = meta.images.filter((image) => image.folder === folder).sort(sortImages);
    if (req.query.page === undefined) {
      return res.json({ path: folder, folders, images: allImages.map(withImageUrl) });
    }
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const start = (page - 1) * limit;
    res.json({
      path: folder, folders, page, total: allImages.length,
      hasMore: start + limit < allImages.length,
      images: allImages.slice(start, start + limit).map(withImageUrl)
    });
  } catch (error) {
    next(error);
  }
}));

app.get("/api/images/search", requireAuthOrToken, storageOperation(async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim().toLowerCase();
    if (!query) return res.json({ images: [] });
    const meta = await readMeta();
    const images = meta.images
      .filter((image) => {
        const haystack = `${image.filename} ${image.originalName} ${image.path} ${image.folder}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort(req.query.sort === "name"
        ? (a, b) => byName.compare(a.filename, b.filename)
        : (a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 200)
      .map(withImageUrl);
    res.json({ images });
  } catch (error) {
    next(error);
  }
}));

app.post("/api/folders", requireAuth, storageOperation(async (req, res, next) => {
  try {
    const parent = normalizeFolder(req.body.parent || "/");
    const folder = buildFolderPath(parent, req.body.path || req.body.name);
    await fsp.mkdir(folderToDisk(folder), { recursive: true });
    res.json({ ok: true, path: folder });
  } catch (error) {
    next(error);
  }
}));

app.patch("/api/folders", requireAuth, storageOperation(async (req, res) => {
  const source = normalizeFolder(req.body.path);
  if (source === "/") throw invalid("不能移动或重命名根目录");
  const hasName = typeof req.body.name === "string";
  if (hasName && (!req.body.name.trim() || /[\\/]/.test(req.body.name))) {
    throw invalid("请输入单个目录名称");
  }
  const parent = normalizeFolder(req.body.parent ?? path.posix.dirname(source));
  if (withinFolder(pathKey(parent), pathKey(source))) throw invalid("不能移动到当前目录或其子目录");
  const target = hasName ? buildFolderPath(parent, req.body.name) : path.posix.join(parent, path.posix.basename(source));
  if (target === source) return res.json({ ok: true, path: source });
  const oldDisk = folderToDisk(source);
  const newDisk = folderToDisk(target);
  if (!(await fsp.lstat(oldDisk)).isDirectory() || !(await fsp.lstat(folderToDisk(parent))).isDirectory()) {
    throw invalid("源目录或目标目录不存在");
  }
  const caseOnly = process.platform === "win32" && pathKey(source) === pathKey(target);
  if (!caseOnly && fs.existsSync(newDisk)) throw invalid("目标目录下已有同名项目");
  const meta = await readMeta();
  for (const image of meta.images) {
    if (!withinFolder(image.folder, source)) continue;
    image.folder = target + image.folder.slice(source.length);
    image.path = path.posix.join(image.folder, image.filename);
  }
  await fsp.rename(oldDisk, newDisk);
  try {
    await writeMeta(meta);
  } catch (error) {
    await fsp.rename(newDisk, oldDisk);
    throw error;
  }
  res.json({ ok: true, path: target });
}));

app.delete("/api/folders", requireAuth, storageOperation(async (req, res, next) => {
  try {
    const folder = normalizeFolder(req.query.path);
    if (folder === "/") return res.status(400).json({ error: "不能删除根目录" });
    const meta = await readMeta();
    const prefix = `${folder}/`;
    const before = meta.images.length;
    meta.images = meta.images.filter((image) => image.folder !== folder && !image.folder.startsWith(prefix));
    await fsp.rm(folderToDisk(folder), { recursive: true, force: true });
    await writeMeta(meta);
    res.json({ ok: true, deletedImages: before - meta.images.length });
  } catch (error) {
    next(error);
  }
}));

app.post("/api/upload", requireAuthOrWriteToken, upload.array("images", 50), storageOperation(async (req, res, next) => {
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
        return res.status(400).json({ error: `不支持的文件类型：${file.originalname}` });
      }
      const target = await uniqueFilePath(folder, file.originalname);
      await fsp.writeFile(target.diskPath, file.buffer);
      const dimensions = getDimensions(file.buffer, file.mimetype);
      const item = {
        id: crypto.randomUUID(),
        folder,
        filename: target.filename,
        originalName: file.originalname,
        path: target.publicPath,
        size: file.size,
        mime: file.mimetype,
        width: dimensions.width || null,
        height: dimensions.height || null,
        createdAt: new Date().toISOString()
      };
      meta.images.push(item);
      saved.push({ ...item, url: publicUrl(item.path) });
    }
    await writeMeta(meta);
    res.json({ ok: true, images: saved });
  } catch (error) {
    next(error);
  }
}));

app.patch("/api/images/:id", requireAuth, storageOperation(async (req, res, next) => {
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
    image.folder = nextFolder;
    image.filename = normalizedName;
    image.path = nextPublicPath;
    await writeMeta(meta);
    res.json({ ok: true, image: { ...image, url: publicUrl(image.path) } });
  } catch (error) {
    next(error);
  }
}));

app.delete("/api/images/:id", requireAuth, storageOperation(async (req, res, next) => {
  try {
    const meta = await readMeta();
    const index = meta.images.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "图片不存在" });
    const [image] = meta.images.splice(index, 1);
    await fsp.rm(fileToDisk(image.path), { force: true });
    await writeMeta(meta);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}));

app.get("/i/*", async (req, res, next) => {
  try {
    const publicPath = normalizePublicPath(`/${req.params[0]}`);
    res.sendFile(fileToDisk(publicPath), {
      headers: {
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }
  if (res.headersSent) return next(error);
  const status = error.status || (error.code === "ENOENT" ? 404 : 500);
  const message = status === 404 ? "资源不存在" : error.message || "服务器错误";
  res.status(status).json({ error: message });
});

ensureBaseDirs().then(() => {
  app.listen(port, () => {
    console.log(`Private image host running at http://localhost:${port}`);
  });
});
