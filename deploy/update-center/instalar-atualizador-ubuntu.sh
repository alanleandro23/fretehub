#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="/home/fretehubadmin/fretehub"
APP_USER="fretehubadmin"
APP_HOME="/home/fretehubadmin"
UPDATE_ROOT="/var/lib/fretehub/updates"
WEB_ROOT="/var/www/fretehub"
ENV_FILE="$APP_ROOT/backend/.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[[ "$EUID" -eq 0 ]] || { echo "Execute com sudo." >&2; exit 1; }
[[ -d "$APP_ROOT" ]] || { echo "Projeto não encontrado em $APP_ROOT" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo ".env não encontrado em $ENV_FILE" >&2; exit 1; }

install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$UPDATE_ROOT"
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" \
  "$UPDATE_ROOT/packages" "$UPDATE_ROOT/history" "$UPDATE_ROOT/archive" "$UPDATE_ROOT/logs"

install -m 0750 "$SCRIPT_DIR/fretehub-updater.sh" /usr/local/sbin/fretehub-updater
install -m 0644 "$SCRIPT_DIR/fretehub-updater.service" /etc/systemd/system/fretehub-updater.service
install -m 0644 "$SCRIPT_DIR/fretehub-updater.path" /etc/systemd/system/fretehub-updater.path

cat > /etc/fretehub-updater.conf <<CONF
APP_ROOT="$APP_ROOT"
APP_USER="$APP_USER"
APP_HOME="$APP_HOME"
UPDATE_ROOT="$UPDATE_ROOT"
WEB_ROOT="$WEB_ROOT"
CONF
chmod 0644 /etc/fretehub-updater.conf

touch "$UPDATE_ROOT/agent.ready"
chown "$APP_USER:$APP_USER" "$UPDATE_ROOT/agent.ready"
chmod 0640 "$UPDATE_ROOT/agent.ready"

python3 - "$ENV_FILE" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
updates = {
    'FRETEHUB_UPDATE_DIR': '/var/lib/fretehub/updates',
    'FRETEHUB_UPDATER_ENABLED': 'true',
}
lines = text.splitlines()
seen = set()
out = []
for line in lines:
    key = line.split('=', 1)[0].strip() if '=' in line and not line.lstrip().startswith('#') else None
    if key in updates:
        out.append(f'{key}={updates[key]}')
        seen.add(key)
    else:
        out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f'{key}={value}')
p.write_text('\n'.join(out).rstrip() + '\n', encoding='utf-8')
PY
chmod 0600 "$ENV_FILE"
chown "$APP_USER:$APP_USER" "$ENV_FILE"

systemctl daemon-reload
systemctl enable --now fretehub-updater.path

runuser -u "$APP_USER" -- env HOME="$APP_HOME" bash -lc "source '$APP_HOME/.nvm/nvm.sh'; pm2 restart fretehub-api --update-env && pm2 save"

echo
echo "ATUALIZADOR FRETEHUB INSTALADO"
echo "Path unit: $(systemctl is-active fretehub-updater.path)"
echo "Diretório: $UPDATE_ROOT"
