#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
node -e 'if(Number(process.versions.node.split(".")[0])<22) { console.error("Node.js 22 oder neuer erforderlich"); process.exit(1) }'
exec node server.mjs
