#!/bin/bash
PROJECT_ROOT="/home/digitalport2budget/htdocs/budget.digitalport.my"
WEB_DIR="$PROJECT_ROOT/apps/web"
DEPLOY_ENV_FILE="${WEB_DEPLOY_ENV_FILE:-$WEB_DIR/.env.deploy}"

echo "Building Web application for production..."
cd "$WEB_DIR"

if [ -f "$DEPLOY_ENV_FILE" ]; then
  set -a
  source "$DEPLOY_ENV_FILE"
  set +a
fi

npm run build

if [ $? -eq 0 ]; then
  echo "Build successful!"
else
  echo "Build failed! Check the output above."
  exit 1
fi
