# Пуш изменений в GitHub (origin/main)
# Использование:
#   .\scripts\push-github.ps1 -Message "fix: описание"
#   .\scripts\push-github.ps1              # только push без коммита
#   .\scripts\push-github.ps1 -Branch develop -Message "feat: ..."

param(
    [string]$Message = "",
    [string]$Branch = "main",
    [switch]$SkipCommit,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

function Write-Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

Write-Step "Проверка git"
if (-not (Test-Path ".git")) {
    throw "Не найден .git. Запустите скрипт из корня репозитория drm."
}

$remoteUrl = (git remote get-url origin 2>$null)
if (-not $remoteUrl) {
    throw "Remote origin не настроен. Выполните: git remote add origin https://github.com/USER/REPO.git"
}
Write-Host "origin: $remoteUrl"

$currentBranch = (git branch --show-current).Trim()
if ($currentBranch -ne $Branch) {
    Write-Host "Текущая ветка: $currentBranch (целевая: $Branch)" -ForegroundColor Yellow
}

Write-Step "Статус"
git status -sb

# Предупреждения о секретах и мусоре
$staged = git diff --cached --name-only 2>$null
$unstaged = git diff --name-only 2>$null
$untracked = git ls-files --others --exclude-standard 2>$null
$allChanged = @($staged + $unstaged + $untracked) | Where-Object { $_ } | Select-Object -Unique

$dangerPatterns = @(
    "\.env$",
    "\.env\.",
    "credentials",
    "secret",
    "id_rsa",
    "node_modules/"
)
foreach ($file in $allChanged) {
    foreach ($pat in $dangerPatterns) {
        if ($file -match $pat) {
            Write-Host "ВНИМАНИЕ: в изменениях есть чувствительный/лишний файл: $file" -ForegroundColor Red
        }
    }
}

if (-not $SkipCommit -and $Message) {
    Write-Step "Добавление файлов и коммит"
    git add -A
    $hasChanges = git diff --cached --quiet; $exit = $LASTEXITCODE
    if ($exit -eq 0) {
        Write-Host "Нет изменений для коммита." -ForegroundColor Yellow
    } else {
        git commit -m $Message
        if ($LASTEXITCODE -ne 0) { throw "git commit завершился с ошибкой" }
    }
} elseif (-not $SkipCommit -and -not $Message) {
    $dirty = git status --porcelain
    if ($dirty) {
        Write-Host "Есть незакоммиченные изменения. Укажите -Message 'текст' или -SkipCommit для только push." -ForegroundColor Yellow
        exit 1
    }
}

Write-Step "Push в origin/$Branch"
if ($Force) {
    Write-Host "Force push включён — используйте только если уверены." -ForegroundColor Red
    git push --force-with-lease origin "HEAD:$Branch"
} else {
    git push -u origin "HEAD:$Branch"
}

if ($LASTEXITCODE -ne 0) { throw "git push завершился с ошибкой" }

Write-Step "Готово"
git status -sb
Write-Host "`nРепозиторий: $remoteUrl (ветка $Branch)" -ForegroundColor Green
