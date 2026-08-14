import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mobileDir = join(root, "mobile");
const apkSrc = join(mobileDir, "build", "app", "outputs", "flutter-apk", "app-release.apk");
const apkDestDir = join(root, "frontend", "public", "downloads");
const apkDest = join(apkDestDir, "lemexplain.apk");

const flutter =
  process.env.FLUTTER_BIN ||
  (process.platform === "win32" ? "flutter.bat" : "flutter");

console.log("==> flutter build apk --release");
const build = spawnSync(
  flutter,
  ["build", "apk", "--release", "--dart-define=API_BASE_URL=https://api.lemexplain.com"],
  { cwd: mobileDir, stdio: "inherit", shell: true, env: process.env }
);

if (build.status !== 0) {
  console.error("Сборка APK не удалась. Проверьте: flutter doctor");
  process.exit(build.status || 1);
}

if (!existsSync(apkSrc)) {
  console.error(`APK не найден: ${apkSrc}`);
  process.exit(1);
}

mkdirSync(apkDestDir, { recursive: true });
copyFileSync(apkSrc, apkDest);
const mb = (statSync(apkDest).size / (1024 * 1024)).toFixed(1);
console.log(`==> Скопировано в frontend/public/downloads/lemexplain.apk (${mb} MB)`);
console.log("После деплоя frontend файл будет доступен: /downloads/lemexplain.apk");
