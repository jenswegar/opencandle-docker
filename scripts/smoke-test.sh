#!/usr/bin/env bash
# Smoke test against the fake LLM, in an isolated compose project with its own
# volumes (never touches real data). Usage: scripts/smoke-test.sh [--keep]
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=opencandle-test
PORT=${TEST_HOST_PORT:-24567}
c() { HOST_PORT=$PORT docker compose -p "$PROJECT" -f compose.yaml -f test/compose.test.yaml --profile fake-llm "$@"; }
pass() { echo "PASS  $*"; }
die() { echo "FAIL  $*" >&2; exit 1; }

cleanup() { [[ "${1:-}" == "--keep" ]] || c down -v --remove-orphans >/dev/null 2>&1 || true; }
trap 'cleanup "${KEEP:-}"' EXIT
[[ "${1:-}" == "--keep" ]] && KEEP=--keep

c up -d --build --wait --wait-timeout 120 >/dev/null 2>&1 || { c logs opencandle | tail -30; die "stack did not become healthy"; }
pass "stack healthy"

code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")
[[ "$code" == 200 ]] && pass "GUI answers on 127.0.0.1:$PORT" || die "GUI returned $code"

[[ "$(c port opencandle 14567)" == 127.0.0.1:* ]] && pass "port published on loopback only" || die "port not loopback-only"

uid=$(c exec -T opencandle id -u)
[[ "$uid" != 0 ]] && pass "runs as uid $uid" || die "runs as root"

c exec -T opencandle sh -c 'grep -q "\"\$LOCAL_LLM_API_KEY\"" $PI_CODING_AGENT_DIR/models.json && ! grep -q test-key $PI_CODING_AGENT_DIR/models.json' \
  && pass "models.json references the key, does not contain it" || die "models.json key handling"

perms=$(c exec -T opencandle stat -c %a /data/pi-agent/models.json)
[[ "$perms" == 600 ]] && pass "models.json mode 600" || die "models.json mode $perms"

c run --rm -T opencandle doctor >/tmp/opencandle-doctor.$$ 2>&1 || true
grep -q "fake: model fake-model available" /tmp/opencandle-doctor.$$ && pass "doctor sees fake model" || { cat /tmp/opencandle-doctor.$$; die "doctor"; }
rm -f /tmp/opencandle-doctor.$$

n=$(c exec -T opencandle find /data/opencandle /data/pi-agent -type f | wc -l)
[[ "$n" -gt 0 ]] && pass "state written under /data ($n files)" || die "no state under /data"

changes=$(docker diff "$(c ps -q opencandle)" | grep -vE ' /tmp(/|$)' || true)
[[ -z "$changes" ]] && pass "no writes outside volumes and /tmp" || die "unexpected writes: $changes"

echo "All smoke checks passed."
