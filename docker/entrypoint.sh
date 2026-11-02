#!/bin/sh
# Container entrypoint: prepare /data, render pi config from env, run a mode.
#
#   gui (default)  OpenCandle browser GUI
#   cli [args]     OpenCandle terminal agent (run with -it)
#   doctor         Setup checks (data dirs, model server, opencandle doctor)
#   shell          /bin/sh
#   <anything>     exec'd as-is
set -eu

LIB=/opt/opencandle-docker/lib
umask 077

for dir in "$OPENCANDLE_HOME" "$PI_CODING_AGENT_DIR" "$HOME" /data/workspace; do
  mkdir -p "$dir" 2>/dev/null || true
  if [ ! -w "$dir" ]; then
    echo "WARN: $dir is not writable by uid $(id -u). Check volume/bind-mount ownership (APP_UID/APP_GID)." >&2
  fi
done

case "${BIND_ADDRESS:-127.0.0.1}" in
  127.*|localhost|::1) ;;
  *) echo "WARN: GUI is published on ${BIND_ADDRESS}. It has no authentication; anyone who can reach that address can use it." >&2 ;;
esac

# Writes models.json / seeds settings.json. Never fatal: a broken model
# config should not stop the GUI from starting (doctor reports it instead).
node "$LIB/render-config.mjs" || echo "WARN: could not render pi model config (see above)." >&2

mode="${1:-gui}"
[ $# -gt 0 ] && shift

case "$mode" in
  gui)    exec opencandle gui "$@" ;;
  cli)    exec opencandle "$@" ;;
  doctor) exec node "$LIB/doctor.mjs" "$@" ;;
  shell)  exec /bin/sh "$@" ;;
  *)      exec "$mode" "$@" ;;
esac
