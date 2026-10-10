#!/bin/bash
set -e
mkdir -p src
printf 'export const limit = { perMinute: 20 }\n' > src/limiter.js
printf '{ "name": "limiter", "version": "1.0.0" }\n' > package.json
git init -q && git add -A && git -c user.email=e@e -c user.name=e commit -qm init
