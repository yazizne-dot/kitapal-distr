#!/usr/bin/env bash
# Run from Terminal: bash scripts/publish-login-fix.sh
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

for tool in node npm npx git; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Қажетті бағдарлама табылмады: $tool" >&2
    exit 1
  fi
done

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo 'Алдымен main веткасына ауысыңыз.' >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Commit жасалмаған өзгерістер бар. Алдымен оларды тексеріп, сақтаңыз.' >&2
  exit 1
fi
if ! git merge-base --is-ancestor e48aa8d HEAD; then
  echo 'Логин түзетуінің e48aa8d commit-і бұл веткада жоқ.' >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm ci
fi
node scripts/check-account-login-update.mjs
npm run build

# Login takes place in your browser; no password or token is stored in this script.
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo 'Supabase аккаунтына кіріңіз. Браузердегі растау кодын осы Terminal-ға енгізіңіз.'
  npx --yes supabase login --agent no --output-format text
fi

echo 'Supabase: admin-users функциясы жариялануда...'
npx --yes supabase functions deploy admin-users --project-ref tgiwtfavkuphllpgtuck

# Only push the frontend after the backend deployment succeeds.
echo 'GitHub: сайт түзетуі жіберілуде...'
git push origin main

echo 'Дайын: admin-users жарияланды, main GitHub-қа жіберілді.'
echo 'Vercel жаңартуды аяқтаған соң сайтты Ctrl+Shift+R арқылы жаңартыңыз.'
echo 'Supabase кестелеріне SQL миграция орындалған жоқ.'
