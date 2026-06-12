#!/usr/bin/env node
/**
 * npm run push                    # коммит (сообщение по умолчанию) + push в GitHub
 * npm run push -- "fix: описание"
 * npm run push -- --push-only     # push без коммита
 * npm run deploy                  # обновление на VPS по SSH
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const message = positional[0] ?? "";
const pushOnly = flags.has("--push-only");
const deployOnly = flags.has("--deploy-only");
const force = flags.has("--force");

function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) {
    console.error(`\nОшибка запуска ${cmd}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    return "";
  }
  return (result.stdout ?? "").trim();
}

function step(text) {
  console.log(`\n==> ${text}`);
}

function loadDeployConfig() {
  const localPath = join(repoRoot, "deploy.local.json");
  const examplePath = join(repoRoot, "deploy.config.example.json");

  if (!existsSync(localPath)) {
    console.error("\nНе найден deploy.local.json");
    console.error("Скопируйте пример и укажите IP сервера:");
    console.error("  copy deploy.config.example.json deploy.local.json");
    console.error("  notepad deploy.local.json");
    if (existsSync(examplePath)) {
      console.error("\nПример:");
      console.error(readFileSync(examplePath, "utf8"));
    }
    process.exit(1);
  }

  const config = JSON.parse(readFileSync(localPath, "utf8"));
  if (!config.host || config.host === "YOUR_SERVER_IP") {
    console.error("\nВ deploy.local.json укажите реальный host (IP VPS).");
    process.exit(1);
  }
  return {
    host: config.host,
    user: config.user ?? "root",
    path: config.path ?? "/var/www/lemeexp",
    branch: config.branch ?? "main",
    pm2Name: config.pm2Name ?? "lemeexp-api",
  };
}

function defaultCommitMessage() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `chore: deploy ${ts}`;
}

function hasUncommittedChanges() {
  return Boolean(runCapture("git", ["status", "--porcelain"]));
}

function warnDangerousFiles() {
  const patterns = [/\.env$/i, /\.env\./i, /credentials/i, /node_modules\//i];
  const files = [
    ...runCapture("git", ["diff", "--cached", "--name-only"]).split("\n"),
    ...runCapture("git", ["diff", "--name-only"]).split("\n"),
    ...runCapture("git", ["ls-files", "--others", "--exclude-standard"]).split("\n"),
  ]
    .map((f) => f.trim())
    .filter(Boolean);

  for (const file of [...new Set(files)]) {
    if (patterns.some((p) => p.test(file))) {
      console.warn(`\nВНИМАНИЕ: в изменениях есть чувствительный файл: ${file}`);
    }
  }
}

function commitChanges(explicitMessage) {
  if (!hasUncommittedChanges()) {
    return;
  }

  const commitMessage = explicitMessage || defaultCommitMessage();
  step("Коммит");
  if (!explicitMessage) {
    console.log(`Сообщение: ${commitMessage}`);
  }

  run("git", ["add", "-A"]);
  const staged = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd: repoRoot,
    shell: false,
  });
  if (staged.status === 0) {
    console.log("Нет изменений для коммита.");
  } else {
    run("git", ["commit", "-m", commitMessage]);
  }
}

function pushToGithub() {
  step("Проверка git");
  if (!existsSync(join(repoRoot, ".git"))) {
    console.error("Запустите из корня репозитория.");
    process.exit(1);
  }

  const origin = runCapture("git", ["remote", "get-url", "origin"]);
  if (!origin) {
    console.error("Remote origin не настроен.");
    process.exit(1);
  }
  console.log(`origin: ${origin}`);

  step("Статус");
  run("git", ["status", "-sb"]);
  warnDangerousFiles();

  const branch = runCapture("git", ["branch", "--show-current"]) || "main";

  if (!pushOnly && !deployOnly) {
    commitChanges(message || undefined);
  }

  step(`Push в origin/${branch}`);
  if (force) {
    run("git", ["push", "--force-with-lease", "origin", `HEAD:${branch}`]);
  } else {
    run("git", ["push", "-u", "origin", `HEAD:${branch}`]);
  }

  console.log(`\nGitHub: ${origin} (${branch})`);
}

function deployToServer() {
  const config = loadDeployConfig();
  const target = `${config.user}@${config.host}`;
  const remoteScript = [
    "set -e",
    `cd ${config.path}`,
    `git pull origin ${config.branch}`,
    "cd backend",
    "npm ci --omit=dev",
    "npm run db:migrate",
    `pm2 restart ${config.pm2Name}`,
    "cd ../frontend",
    "npm ci",
    "npm run build",
    'echo "Deploy on server finished"',
  ].join(" && ");

  step(`Обновление на сервере ${target}`);
  console.log(`Путь: ${config.path}`);

  run("ssh", [target, remoteScript]);
  console.log(`\nСайт обновлён: http://${config.host}/`);
}

function main() {
  if (deployOnly) {
    deployToServer();
    return;
  }

  pushToGithub();
}

main();
