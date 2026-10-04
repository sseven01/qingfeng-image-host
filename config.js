const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const dataRoot = path.resolve(__dirname, process.env.DATA_DIR || "data");
const configPath = path.join(dataRoot, "config.json");

let cache = null;
let cacheKey = null;

function configMtime() {
  try {
    return fs.statSync(configPath).mtimeMs;
  } catch {
    return null;
  }
}

function readConfig() {
  const mtime = configMtime();
  if (mtime === null) {
    cache = {};
    cacheKey = null;
    return cache;
  }
  if (cache && cacheKey === mtime) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(configPath, "utf8") || "{}");
    cacheKey = mtime;
  } catch {
    cache = {};
    cacheKey = null;
  }
  return cache;
}

function saveConfig(partial) {
  const next = { ...readConfig(), ...partial };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined || next[key] === null || next[key] === "") {
      delete next[key];
    }
  }
  fs.mkdirSync(dataRoot, { recursive: true });
  const tmp = `${configPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tmp, configPath);
  cache = null;
  cacheKey = null;
  return next;
}

// 解析顺序：环境变量（可选覆盖） > data/config.json > 默认值
function resolveValue(envName, configKey, fallback) {
  const env = process.env[envName];
  if (env !== undefined && env !== "") return env;
  const value = readConfig()[configKey];
  if (value !== undefined && value !== null && value !== "") return String(value);
  return fallback;
}

function hasValue(envName, configKey) {
  const env = process.env[envName];
  if (env !== undefined && env !== "") return true;
  const value = readConfig()[configKey];
  return value !== undefined && value !== null && value !== "";
}

// 返回值来源：env / file / default，用于 CLI 提示"环境变量会覆盖配置文件"
function valueSource(envName, configKey) {
  const env = process.env[envName];
  if (env !== undefined && env !== "") return "env";
  const value = readConfig()[configKey];
  if (value !== undefined && value !== null && value !== "") return "file";
  return "default";
}

function ensureSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const cfg = readConfig();
  if (cfg.sessionSecret) return cfg.sessionSecret;
  const generated = crypto.randomBytes(32).toString("hex");
  saveConfig({ sessionSecret: generated });
  return generated;
}

module.exports = { configPath, readConfig, saveConfig, resolveValue, hasValue, valueSource, ensureSessionSecret };
