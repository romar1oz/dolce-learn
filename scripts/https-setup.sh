#!/usr/bin/env bash
# HTTPS для доступа к Dolce Learn с телефонов в локальной сети.
# Создаёт собственный локальный центр сертификации (CA, один раз) и сертификат сервера для
# localhost, имени компьютера (*.local) и всех текущих IPv4-адресов. Файлы — в .certs/ (в git не попадают).
#   ./scripts/https-setup.sh            — создать/обновить сертификат сервера (CA сохраняется)
#   ./scripts/https-setup.sh --new-ca   — пересоздать и CA (тогда его нужно заново установить на телефоны)
# Закрытый ключ CA не покидает этот компьютер. На телефоны устанавливается только ca.crt.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/.certs"
mkdir -p "$DIR"
chmod 700 "$DIR"
HOST="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"

if [ "${1:-}" = "--new-ca" ]; then rm -f "$DIR"/ca.*; fi

if [ ! -f "$DIR/ca.key" ]; then
  echo "• Создаю локальный центр сертификации"
  openssl genrsa -out "$DIR/ca.key" 2048 2>/dev/null
  chmod 600 "$DIR/ca.key"
  cat > "$DIR/ca.ext" <<EOF
[req]
distinguished_name=dn
x509_extensions=v3_ca
prompt=no
[dn]
CN=Dolce Learn Local CA ($HOST)
O=Dolce Pharm (local dev)
[v3_ca]
basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
EOF
  openssl req -x509 -new -key "$DIR/ca.key" -sha256 -days 1825 -config "$DIR/ca.ext" -out "$DIR/ca.crt"
fi

# все IPv4 адреса интерфейсов (кроме loopback)
IPS=$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2}' | sort -u)
SAN="DNS:localhost,DNS:$HOST.local,IP:127.0.0.1"
for ip in $IPS; do SAN="$SAN,IP:$ip"; done

echo "• Выпускаю сертификат сервера: $SAN"
openssl genrsa -out "$DIR/server.key" 2048 2>/dev/null
chmod 600 "$DIR/server.key"
openssl req -new -key "$DIR/server.key" -subj "/CN=$HOST.local/O=Dolce Learn" -out "$DIR/server.csr"
cat > "$DIR/server.ext" <<EOF
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$SAN
EOF
# iOS принимает сертификаты сервера сроком не более 825 дней
openssl x509 -req -in "$DIR/server.csr" -CA "$DIR/ca.crt" -CAkey "$DIR/ca.key" -CAserial "$DIR/ca.srl" -CAcreateserial \
  -days 825 -sha256 -extfile "$DIR/server.ext" -out "$DIR/server.crt" 2>/dev/null
rm -f "$DIR/server.csr"
openssl verify -CAfile "$DIR/ca.crt" "$DIR/server.crt" >/dev/null

# сертификат CA доступен для скачивания с телефона: https://<адрес>:4443/dolce-local-ca.crt
cp "$DIR/ca.crt" "$ROOT/frontend/public/dolce-local-ca.crt"

echo
echo "Готово. Адреса для телефона (после запуска ./scripts/dev.sh --https):"
for ip in $IPS; do echo "   https://$ip:4443"; done
echo "   https://$HOST.local:4443   (iPhone; на Android .local может не работать)"
echo "Сертификат CA для установки на телефон: .certs/ca.crt  (или /dolce-local-ca.crt на сервере)"
echo "SHA-256 отпечаток CA (сверьте на телефоне):"
openssl x509 -in "$DIR/ca.crt" -noout -fingerprint -sha256 | sed 's/^.*=/   /'
