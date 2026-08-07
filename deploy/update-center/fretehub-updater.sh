#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG_FILE="/etc/fretehub-updater.conf"
[[ -r "$CONFIG_FILE" ]] || { echo "Configuração ausente: $CONFIG_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"

: "${APP_ROOT:?APP_ROOT não configurado}"
: "${APP_USER:?APP_USER não configurado}"
: "${APP_HOME:?APP_HOME não configurado}"
: "${UPDATE_ROOT:?UPDATE_ROOT não configurado}"
: "${WEB_ROOT:?WEB_ROOT não configurado}"

PACKAGES_DIR="$UPDATE_ROOT/packages"
HISTORY_DIR="$UPDATE_ROOT/history"
ARCHIVE_DIR="$UPDATE_ROOT/archive"
STATUS_FILE="$UPDATE_ROOT/status.json"
REQUEST_FILE="$UPDATE_ROOT/install.request"
PROCESSING_FILE="$UPDATE_ROOT/install.processing"
LOCK_FILE="$UPDATE_ROOT/updater.lock"
LOG_DIR="$UPDATE_ROOT/logs"

mkdir -p "$PACKAGES_DIR" "$HISTORY_DIR" "$ARCHIVE_DIR" "$LOG_DIR"
chmod 750 "$UPDATE_ROOT" "$PACKAGES_DIR" "$HISTORY_DIR" "$ARCHIVE_DIR" "$LOG_DIR" || true

exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

[[ -f "$REQUEST_FILE" ]] || exit 0
mv "$REQUEST_FILE" "$PROCESSING_FILE"

STAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
LOG_FILE="$LOG_DIR/update-$STAMP.log"
exec > >(tee -a "$LOG_FILE") 2>&1

json_get() {
  python3 - "$1" "$2" <<'PY'
import json, sys
file, key = sys.argv[1], sys.argv[2]
with open(file, encoding='utf-8') as fh:
    value = json.load(fh)
for part in key.split('.'):
    if isinstance(value, dict):
        value = value.get(part)
    else:
        value = None
        break
if value is None:
    print('')
elif isinstance(value, bool):
    print('true' if value else 'false')
else:
    print(value)
PY
}

write_status() {
  local state="$1"
  local message="$2"
  local version="${3:-}"
  local update_id="${4:-}"
  python3 - "$STATUS_FILE" "$state" "$message" "$version" "$update_id" <<'PY'
import json, os, sys, tempfile
from datetime import datetime, timezone
file, state, message, version, update_id = sys.argv[1:]
data = {
  'state': state,
  'message': message,
  'version': version or None,
  'updateId': update_id or None,
  'updatedAt': datetime.now(timezone.utc).isoformat()
}
dirname = os.path.dirname(file)
os.makedirs(dirname, exist_ok=True)
fd, tmp = tempfile.mkstemp(prefix='.status-', dir=dirname, text=True)
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    os.chmod(tmp, 0o644)
    os.replace(tmp, file)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
PY
}

write_history() {
  local state="$1"
  local message="$2"
  local version="$3"
  local target_commit="$4"
  local old_commit="$5"
  local update_id="$6"
  local requires_migration="$7"
  local backup_file="${8:-}"
  local out="$HISTORY_DIR/${STAMP}-${version//[^0-9A-Za-z._-]/_}.json"
  python3 - "$out" "$state" "$message" "$version" "$target_commit" "$old_commit" "$update_id" "$requires_migration" "$backup_file" <<'PY'
import json, os, sys
from datetime import datetime, timezone
out, state, message, version, target_commit, old_commit, update_id, migration, backup_file = sys.argv[1:]
data = {
  'state': state,
  'message': message,
  'version': version,
  'targetCommit': target_commit,
  'previousCommit': old_commit,
  'updateId': update_id,
  'requiresDatabaseMigration': migration == 'true',
  'backupFile': backup_file or None,
  'finishedAt': datetime.now(timezone.utc).isoformat()
}
with open(out, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
    fh.write('\n')
os.chmod(out, 0o640)
PY
}

run_as_app() {
  runuser -u "$APP_USER" -- env HOME="$APP_HOME" bash -lc "source '$APP_HOME/.nvm/nvm.sh'; $*"
}

UPDATE_ID="$(json_get "$PROCESSING_FILE" updateId)"
[[ "$UPDATE_ID" =~ ^[0-9A-Za-z.-]+$ ]] || { echo "updateId inválido" >&2; rm -f "$PROCESSING_FILE"; exit 1; }
META_FILE="$PACKAGES_DIR/$UPDATE_ID.json"
PACKAGE_FILE="$PACKAGES_DIR/$UPDATE_ID.zip"
[[ -r "$META_FILE" && -r "$PACKAGE_FILE" ]] || { echo "Pacote/metadados não encontrados" >&2; rm -f "$PROCESSING_FILE"; exit 1; }

VERSION="$(json_get "$META_FILE" manifest.version)"
TARGET_COMMIT="$(json_get "$META_FILE" manifest.targetCommit)"
EXPECTED_SHA="$(json_get "$META_FILE" sha256)"
REQUIRES_MIGRATION="$(json_get "$META_FILE" manifest.requiresDatabaseMigration)"
OLD_COMMIT=""
BACKUP_FILE=""
WORKDIR="$(mktemp -d /tmp/fretehub-update.XXXXXX)"

cleanup() {
  rm -rf "$WORKDIR"
  rm -f "$PROCESSING_FILE"
}
trap cleanup EXIT

rollback_code_best_effort() {
  [[ -n "$OLD_COMMIT" ]] || return 0
  echo "Tentando restaurar o código anterior: $OLD_COMMIT"
  set +e
  run_as_app "cd '$APP_ROOT' && git reset --hard '$OLD_COMMIT'"
  run_as_app "cd '$APP_ROOT/backend' && npm ci --no-audit --no-fund && npx prisma generate"
  run_as_app "cd '$APP_ROOT/frontend' && test -f .env.production || printf 'VITE_API_URL=/api\\n' > .env.production; npm ci --no-audit --no-fund && npm run build"
  if [[ -d "$APP_ROOT/frontend/dist" ]]; then
    mkdir -p "$WEB_ROOT"
    find "$WEB_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    cp -a "$APP_ROOT/frontend/dist/." "$WEB_ROOT/"
    chown -R www-data:www-data "$WEB_ROOT"
  fi
  run_as_app "pm2 restart fretehub-api --update-env && pm2 save"
  nginx -t && systemctl reload nginx
  set -e
}

fail_update() {
  local message="$1"
  echo "FALHA: $message"
  rollback_code_best_effort
  write_status "FAILED" "$message" "$VERSION" "$UPDATE_ID"
  write_history "FAILED" "$message" "$VERSION" "$TARGET_COMMIT" "$OLD_COMMIT" "$UPDATE_ID" "$REQUIRES_MIGRATION" "$BACKUP_FILE"
  exit 1
}

write_status "PREPARING" "Validando pacote e ambiente." "$VERSION" "$UPDATE_ID"

echo "=== FreteHub updater ==="
echo "Versão alvo: $VERSION"
echo "Update ID: $UPDATE_ID"

ACTUAL_SHA="$(sha256sum "$PACKAGE_FILE" | awk '{print $1}')"
[[ "$ACTUAL_SHA" == "$EXPECTED_SHA" ]] || fail_update "Checksum do pacote não confere."

python3 - "$PACKAGE_FILE" "$WORKDIR" <<'PY'
import json, os, sys, zipfile
package, work = sys.argv[1:]
with zipfile.ZipFile(package) as zf:
    names = [n.replace('\\', '/') for n in zf.namelist()]
    for name in names:
        norm = os.path.normpath(name).replace('\\', '/')
        if name.startswith('/') or norm == '..' or norm.startswith('../'):
            raise SystemExit(f'Entrada insegura no ZIP: {name}')
    if 'manifest.json' not in names or 'fretehub.bundle' not in names:
        raise SystemExit('Pacote incompleto.')
    for name in ('manifest.json', 'fretehub.bundle'):
        target = os.path.join(work, name)
        with zf.open(name) as src, open(target, 'wb') as dst:
            dst.write(src.read())
PY

BUNDLE="$WORKDIR/fretehub.bundle"
MANIFEST="$WORKDIR/manifest.json"
MANIFEST_COMMIT="$(json_get "$MANIFEST" targetCommit)"
MANIFEST_VERSION="$(json_get "$MANIFEST" version)"
[[ "$MANIFEST_COMMIT" == "$TARGET_COMMIT" && "$MANIFEST_VERSION" == "$VERSION" ]] || fail_update "Manifesto diverge dos metadados validados."

[[ -d "$APP_ROOT/.git" ]] || fail_update "APP_ROOT não é um repositório Git."
DIRTY="$(run_as_app "cd '$APP_ROOT' && git status --porcelain")"
[[ -z "$DIRTY" ]] || fail_update "O repositório de produção possui alterações locais. Corrija antes de atualizar."

OLD_COMMIT="$(run_as_app "cd '$APP_ROOT' && git rev-parse HEAD")"

write_status "BACKUP" "Gerando backup completo antes da atualização." "$VERSION" "$UPDATE_ID"
BACKUP_OUTPUT="$(/usr/local/sbin/fretehub-backup)" || fail_update "Falha ao gerar backup preventivo."
BACKUP_FILE="$(printf '%s\n' "$BACKUP_OUTPUT" | sed -n 's/^Arquivo: //p' | tail -1)"
echo "$BACKUP_OUTPUT"

write_status "UPDATING_CODE" "Aplicando o commit da nova versão." "$VERSION" "$UPDATE_ID"
run_as_app "cd '$APP_ROOT' && git bundle verify '$BUNDLE' >/dev/null"
run_as_app "cd '$APP_ROOT' && git fetch '$BUNDLE' main"
FETCHED_COMMIT="$(run_as_app "cd '$APP_ROOT' && git rev-parse FETCH_HEAD")"
[[ "$FETCHED_COMMIT" == "$TARGET_COMMIT" ]] || fail_update "Commit recebido não corresponde ao manifesto."
run_as_app "cd '$APP_ROOT' && git merge-base --is-ancestor '$OLD_COMMIT' '$FETCHED_COMMIT'" || fail_update "A atualização não é fast-forward da versão instalada."
run_as_app "cd '$APP_ROOT' && git merge --ff-only FETCH_HEAD"

write_status "DEPENDENCIES" "Atualizando dependências e Prisma Client." "$VERSION" "$UPDATE_ID"
run_as_app "cd '$APP_ROOT/backend' && npm ci --no-audit --no-fund && npx prisma generate" || fail_update "Falha nas dependências do backend."

write_status "DATABASE" "Aplicando migrations pendentes do banco." "$VERSION" "$UPDATE_ID"
run_as_app "cd '$APP_ROOT/backend' && npx prisma migrate deploy" || fail_update "Falha ao aplicar migrations. O backup preventivo deve ser preservado."

write_status "BUILDING" "Compilando o frontend de produção." "$VERSION" "$UPDATE_ID"
run_as_app "cd '$APP_ROOT/frontend' && test -f .env.production || printf 'VITE_API_URL=/api\\n' > .env.production; npm ci --no-audit --no-fund && npm run build" || fail_update "Falha ao compilar o frontend."

write_status "PUBLISHING" "Publicando a nova versão e reiniciando a API." "$VERSION" "$UPDATE_ID"
mkdir -p "$WEB_ROOT"
find "$WEB_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
cp -a "$APP_ROOT/frontend/dist/." "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"
nginx -t || fail_update "Configuração do Nginx inválida."
run_as_app "pm2 restart fretehub-api --update-env && pm2 save" || fail_update "Falha ao reiniciar a API no PM2."
systemctl reload nginx || fail_update "Falha ao recarregar o Nginx."

write_status "HEALTHCHECK" "Validando a aplicação após a atualização." "$VERSION" "$UPDATE_ID"
sleep 3
curl -fsS --max-time 10 http://127.0.0.1:3001/health >/dev/null || fail_update "Health check da API falhou."
curl -fsSI --max-time 10 http://127.0.0.1/ >/dev/null || fail_update "Health check do frontend falhou."

python3 - "$UPDATE_ROOT/current.json" "$VERSION" "$TARGET_COMMIT" "$OLD_COMMIT" <<'PY'
import json, os, sys, tempfile
from datetime import datetime, timezone
file, version, commit, previous = sys.argv[1:]
data = {
  'application': 'fretehub',
  'version': version,
  'commit': commit,
  'previousCommit': previous,
  'installedAt': datetime.now(timezone.utc).isoformat()
}
fd, tmp = tempfile.mkstemp(prefix='.current-', dir=os.path.dirname(file), text=True)
with os.fdopen(fd, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2); fh.write('\n')
os.chmod(tmp, 0o644)
os.replace(tmp, file)
PY

write_status "SUCCESS" "Atualização instalada e validada com sucesso." "$VERSION" "$UPDATE_ID"
write_history "SUCCESS" "Atualização instalada e validada com sucesso." "$VERSION" "$TARGET_COMMIT" "$OLD_COMMIT" "$UPDATE_ID" "$REQUIRES_MIGRATION" "$BACKUP_FILE"

mv "$PACKAGE_FILE" "$ARCHIVE_DIR/${STAMP}-${VERSION}.zip"
mv "$META_FILE" "$ARCHIVE_DIR/${STAMP}-${VERSION}.json"
chmod 640 "$ARCHIVE_DIR/${STAMP}-${VERSION}.zip" "$ARCHIVE_DIR/${STAMP}-${VERSION}.json" || true

echo "ATUALIZAÇÃO CONCLUÍDA: v$VERSION"
