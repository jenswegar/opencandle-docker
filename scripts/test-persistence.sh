#!/usr/bin/env bash
# Verifies that state survives `down`/`up` and an image rebuild, using the
# isolated test project (its own volumes). Usage: scripts/test-persistence.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=opencandle-test
c() { HOST_PORT=${TEST_HOST_PORT:-24567} docker compose -p "$PROJECT" -f compose.yaml -f test/compose.test.yaml --profile fake-llm "$@"; }
pass() { echo "PASS  $*"; }
die() { echo "FAIL  $*" >&2; exit 1; }
trap 'c down -v --remove-orphans >/dev/null 2>&1 || true' EXIT

snapshot() {
  c exec -T opencandle sh -c 'cat /data/opencandle/.persist-marker /data/pi-agent/.persist-marker /data/workspace/.persist-marker; sha256sum /data/pi-agent/settings.json'
}

c up -d --build --wait --wait-timeout 120 >/dev/null 2>&1 || die "stack did not start"
marker="persist-$(date +%s)"
c exec -T opencandle sh -c "for d in /data/opencandle /data/pi-agent /data/workspace; do echo $marker > \$d/.persist-marker; done"
# A user edit that must survive restarts (render-config must not reset it).
c exec -T opencandle node -e '
  const f="/data/pi-agent/settings.json", fs=require("fs");
  const s=JSON.parse(fs.readFileSync(f)); s.userTweak=true; fs.writeFileSync(f, JSON.stringify(s));'
before=$(snapshot)
pass "seeded markers and a settings edit"

c down >/dev/null 2>&1 && c up -d --wait --wait-timeout 120 >/dev/null 2>&1
[[ "$(snapshot)" == "$before" ]] && pass "state survives down/up" || die "state changed after down/up"

c build --no-cache opencandle >/dev/null 2>&1 && c up -d --force-recreate --wait --wait-timeout 120 >/dev/null 2>&1
[[ "$(snapshot)" == "$before" ]] && pass "state survives rebuild + recreate" || die "state changed after rebuild"

c exec -T opencandle grep -q userTweak /data/pi-agent/settings.json && pass "user settings edit kept" || die "settings edit lost"

c down -v >/dev/null 2>&1
c up -d --wait --wait-timeout 120 >/dev/null 2>&1
c exec -T opencandle test ! -e /data/opencandle/.persist-marker && pass "down -v removes data (state lives only in volumes)" || die "data outlived down -v"

echo "All persistence checks passed."
