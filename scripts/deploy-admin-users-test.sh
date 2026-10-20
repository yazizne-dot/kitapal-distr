#!/usr/bin/env bash
# Deploy only the missing user-management function to the test Supabase project.
# JWT verification stays enabled; the function also verifies the admin role.
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

npx --yes supabase functions deploy admin-users \
  --project-ref bfssfdstlobqsedizhiv \
  --use-api
