#!/usr/bin/env bash
# Пуш в GitHub. Запуск на Linux/macOS или Git Bash на Windows.
#
#   ./scripts/push-github.sh "fix: описание"
#   ./scripts/push-github.sh --push-only
#   BRANCH=develop ./scripts/push-github.sh "feat: ..."

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BRANCH="${BRANCH:-main}"
MESSAGE=""
PUSH_ONLY=0
FORCE=0

usage() {
  echo "Usage: $0 [--push-only] [--force] [-b BRANCH] [commit message]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push-only) PUSH_ONLY=1; shift ;;
    --force) FORCE=1; shift ;;
    -b|--branch) BRANCH="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) MESSAGE="$1"; shift ;;
  esac
done

step() { echo -e "\n==> $*"; }

step "Проверка git"
[[ -d .git ]] || { echo "Нет .git в $REPO_ROOT"; exit 1; }
origin="$(git remote get-url origin 2>/dev/null || true)"
[[ -n "$origin" ]] || { echo "Настройте: git remote add origin https://github.com/USER/REPO.git"; exit 1; }
echo "origin: $origin"

step "Статус"
git status -sb

warn_if_dangerous() {
  local files
  files="$( { git diff --cached --name-only; git diff --name-only; git ls-files --others --exclude-standard; } 2>/dev/null | sort -u )"
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if [[ "$f" =~ \.env$ ]] || [[ "$f" =~ node_modules/ ]] || [[ "$f" =~ credentials ]]; then
      echo "ВНИМАНИЕ: чувствительный/лишний файл в изменениях: $f" >&2
    fi
  done <<< "$files"
}

warn_if_dangerous

if [[ "$PUSH_ONLY" -eq 0 && -n "$MESSAGE" ]]; then
  step "Коммит"
  git add -A
  if git diff --cached --quiet; then
    echo "Нет изменений для коммита."
  else
    git commit -m "$MESSAGE"
  fi
elif [[ "$PUSH_ONLY" -eq 0 && -z "$MESSAGE" ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Есть незакоммиченные изменения. Передайте сообщение коммита или --push-only." >&2
    exit 1
  fi
fi

step "Push origin/$BRANCH"
if [[ "$FORCE" -eq 1 ]]; then
  git push --force-with-lease origin "HEAD:$BRANCH"
else
  git push -u origin "HEAD:$BRANCH"
fi

step "Готово"
git status -sb
echo "Репозиторий: $origin (ветка $BRANCH)"
