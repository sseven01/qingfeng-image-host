#!/usr/bin/env node
/**
 * 青枫图床命令行工具：敏感信息只在终端设置，不经过网页。
 *
 *   node cli.js status            查看配置状态（Token 会显示明文，方便复制）
 *   node cli.js password          设置/修改后台登录密码
 *   node cli.js password <新密码>  非交互方式设置（适合脚本）
 *   node cli.js token             生成/重置只读 Token（主题/插件/AI 用）
 *   node cli.js token --write     生成/重置读写 Token（上传用）
 *
 * 注意：环境变量（APP_PASSWORD / API_TOKEN / API_TOKEN_WRITE）优先于配置文件，
 * 存在同名环境变量时对应命令会拒绝执行，避免"设置了却不生效"。
 */
const crypto = require("crypto");
const readline = require("readline");
const { configPath, readConfig, saveConfig, resolveValue, hasValue, valueSource } = require("./config");

function fail(message) {
  console.error(`错误：${message}`);
  process.exit(1);
}

function guardEnvOverride(envName, what) {
  if (process.env[envName]) {
    fail(
      `${what}由环境变量 ${envName} 控制（当前值来自环境变量，配置文件不会生效）。\n` +
        `请修改 docker run / compose 中的 ${envName}，或移除该环境变量后重试。`
    );
  }
}

function prompt(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    if (hidden) {
      // 手动打印提示，随后接管 readline 回显以隐藏输入
      process.stdout.write(question);
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = function (str) {
        if (str.includes("\n")) rl.output.write("\n");
      };
    }
    const ask = hidden ? "" : question;
    rl.question(ask, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function cmdPassword(argv) {
  guardEnvOverride("APP_PASSWORD", "后台登录密码");
  let password = argv[0];
  if (!password) {
    password = await prompt("新密码：", { hidden: true });
    if (!password) fail("密码不能为空");
    const confirm = await prompt("再次输入：", { hidden: true });
    if (confirm !== password) fail("两次输入不一致");
  }
  if (password.length < 6) fail("密码至少 6 位");
  saveConfig({ appPassword: password });
  console.log("后台登录密码已设置（保存在配置文件，立即生效，无需重启）。");
}

function cmdToken(argv) {
  const write = argv.includes("--write");
  const envName = write ? "API_TOKEN_WRITE" : "API_TOKEN";
  const configKey = write ? "apiTokenWrite" : "apiToken";
  const what = write ? "读写 Token（上传接口用）" : "只读 Token（主题/插件/AI 列表与搜索用）";
  guardEnvOverride(envName, what);
  const token = crypto.randomBytes(18).toString("base64url");
  saveConfig({ [configKey]: token });
  console.log(`${what}已生成（保存在配置文件，立即生效，无需重启）：`);
  console.log(token);
}

function sourceLabel(envName, configKey) {
  const src = valueSource(envName, configKey);
  if (src === "env") return "环境变量（优先，配置文件同名项不生效）";
  if (src === "file") return "配置文件";
  return "未设置";
}

function cmdStatus() {
  const cfg = readConfig();
  const passwordSet = hasValue("APP_PASSWORD", "appPassword");
  const readToken = resolveValue("API_TOKEN", "apiToken", "");
  const writeToken = resolveValue("API_TOKEN_WRITE", "apiTokenWrite", "");

  console.log("青枫图床配置状态");
  console.log(`  配置文件：${configPath}${cfg.sessionSecret ? "" : "（尚未生成）"}`);
  console.log(`  后台密码：${passwordSet ? "已设置" : "未设置"}（${sourceLabel("APP_PASSWORD", "appPassword")}）`);
  console.log(`  图床地址：${resolveValue("BASE_URL", "baseUrl", "http://localhost:3000")}（${sourceLabel("BASE_URL", "baseUrl")}）`);
  console.log(`  上传大小：${resolveValue("MAX_FILE_SIZE_MB", "maxFileSizeMb", "10")} MB（${sourceLabel("MAX_FILE_SIZE_MB", "maxFileSizeMb")}，修改需重启）`);
  console.log(`  只读 Token：${readToken || "未设置"}（${sourceLabel("API_TOKEN", "apiToken")}）`);
  console.log(`  读写 Token：${writeToken || "未设置"}（${sourceLabel("API_TOKEN_WRITE", "apiTokenWrite")}）`);
}

function help() {
  console.log(`用法：node cli.js <命令> [参数]

  status            查看配置状态（Token 明文显示，可直接复制）
  password [新密码]  设置后台登录密码（不带参数则交互输入）
  token [--write]   生成只读 Token；--write 生成读写 Token
  help              显示本帮助

敏感信息只通过本命令设置，网页后台不展示、不修改密码与 Token。
非敏感项（图床地址、上传大小）在网页后台「设置」中修改。`);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  switch (command) {
    case "password":
      await cmdPassword(argv);
      break;
    case "token":
      cmdToken(argv);
      break;
    case "status":
      cmdStatus();
      break;
    case "help":
    case undefined:
      help();
      break;
    default:
      fail(`未知命令：${command}（可用：status / password / token / help）`);
  }
}

main().catch((error) => fail(error.message));
