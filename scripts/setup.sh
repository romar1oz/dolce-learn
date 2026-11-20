#!/usr/bin/env bash
# Установка зависимостей для локального запуска без Docker (macOS arm64/x64, Linux x64).
# Скачивает переносимые Node.js (nodejs.org) и PostgreSQL (Maven Central, io.zonky) в .tools/,
# создаёт Python-окружение backend/.venv и ставит npm-пакеты.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/.tools"
OS=$(uname -s | tr A-Z a-z); ARCH=$(uname -m)
NODE_V=v24.22.3; PG_V=17.12.0
case "$OS-$ARCH" in
  darwin-arm64) NODE_PKG="node-$NODE_V-darwin-arm64"; PG_ART=darwin-arm64v8 ;;
  darwin-x86_64) NODE_PKG="node-$NODE_V-darwin-x64"; PG_ART=darwin-amd64 ;;
  linux-x86_64) NODE_PKG="node-$NODE_V-linux-x64"; PG_ART=linux-amd64 ;;
  *) echo "Платформа $OS-$ARCH не поддерживается скриптом — используйте Docker"; exit 1 ;;
esac
TMP=$(mktemp -d)
if [ ! -x "$ROOT/.tools/node/bin/node" ]; then
  curl -fsSL "https://nodejs.org/dist/$NODE_V/$NODE_PKG.tar.gz" -o "$TMP/node.tgz"
  curl -fsSL "https://nodejs.org/dist/$NODE_V/SHASUMS256.txt" | grep " $NODE_PKG.tar.gz\$" | awk '{print $1"  '"$TMP"'/node.tgz"}' | shasum -a 256 -c -
  tar xzf "$TMP/node.tgz" -C "$ROOT/.tools" && mv "$ROOT/.tools/$NODE_PKG" "$ROOT/.tools/node"
fi
if [ ! -x "$ROOT/.tools/pgsql/bin/postgres" ]; then
  URL="https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-$PG_ART/$PG_V/embedded-postgres-binaries-$PG_ART-$PG_V.jar"
  curl -fsSL "$URL" -o "$TMP/pg.jar"
  [ "$(shasum "$TMP/pg.jar" | awk '{print $1}')" = "$(curl -fsSL "$URL.sha1")" ] || { echo "Контрольная сумма PostgreSQL не совпала"; exit 1; }
  (cd "$TMP" && unzip -oq pg.jar && mkdir -p "$ROOT/.tools/pgsql" && tar xJf *.txz -C "$ROOT/.tools/pgsql")
fi
rm -rf "$TMP"
[ -d "$ROOT/backend/.venv" ] || python3 -m venv "$ROOT/backend/.venv"
"$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements-dev.txt"
cd "$ROOT/frontend" && PATH="$ROOT/.tools/node/bin:$PATH" npm install --no-audit --no-fund
echo "Готово. Запуск: ./scripts/dev.sh"
