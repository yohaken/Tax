#!/usr/bin/env bash
# Create permanent Tax Hosting site on MyNote Firebase and deploy.
# Requires: firebase login (or GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_TOKEN)
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-mynote-f1bbc}"
SITE_ID="${SITE_ID:-mynote-tax}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Project: $PROJECT_ID"
echo "Site:    $SITE_ID  →  https://${SITE_ID}.web.app"

npx --yes firebase-tools@latest use "$PROJECT_ID"
npx --yes firebase-tools@latest hosting:sites:create "$SITE_ID" --project "$PROJECT_ID" --non-interactive || true
npx --yes firebase-tools@latest target:apply hosting tax "$SITE_ID" --project "$PROJECT_ID" --non-interactive
npx --yes firebase-tools@latest deploy --only hosting:tax,firestore:rules --project "$PROJECT_ID" --non-interactive

echo
echo "Done. Permanent link: https://${SITE_ID}.web.app"
echo "Also add mynote-tax.web.app in Firebase Auth → Authorized domains if login fails."
