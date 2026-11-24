#!/bin/zsh
# Phase 4 reliability harness. Run from ~/code/markdown-memory-orca.
set -uo pipefail
PORT=4600
BASE="http://127.0.0.1:$PORT"
ROOT="$HOME/code/markdown-memory-orca"
TB="$ROOT/testbed"
export MEMORY_ROOT="$TB/memory-root"
METRICS="$TB/memory-root/.metrics/opencode.jsonl"
PASS=0; FAIL=0
ok()  { echo "PASS: $1"; PASS=$((PASS+1)) }
bad() { echo "FAIL: $1"; FAIL=$((FAIL+1)) }
jqr() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1" 2>/dev/null; }
step() { echo "\n== $1 [$(date +%H:%M:%S)] =="; }

echo "== starting opencode serve from testbed [$(date +%H:%M:%S)] =="
rm -rf "$TB/memory-root"
mkdir -p "$TB/memory-root"
printf '# Global memory\n\n- concise answers\n- approval gates belong to the user\n' > "$TB/memory-root/GLOBAL.md"
cd "$TB" && opencode serve --port $PORT > "$ROOT/.serve.log" 2>&1 &
SRV=$!
cd "$ROOT"
trap "kill $SRV 2>/dev/null" EXIT
for i in {1..60}; do curl -s "$BASE/session" -o /dev/null && break; sleep 0.5; done
curl -s "$BASE/session" -o /dev/null && ok "server up" || { bad "server up"; exit 1; }

step "A. compaction e2e"
SID=$(curl -s -X POST "$BASE/session" -H content-type:application/json -d '{"title":"phase4"}' | jqr "d['id']")
[[ -n "$SID" ]] && ok "session created" || bad "session create"
curl -s -X POST "$BASE/session/$SID/message" -H content-type:application/json -d '{"model":{"providerID":"opencode-go","modelID":"glm-5.3-flash"},"parts":[{"type":"text","text":"Use the memory tool: action=save kind=decision content=(Compaction e2e decision) status=confirmed. Then reply DONE."}]}' -o .msgA.json
[[ -s .msgA.json ]] && ok "prompt turn completed" || bad "prompt turn"
curl -s -X POST "$BASE/session/$SID/summarize" -H content-type:application/json -d '{"providerID":"opencode-go","modelID":"glm-5.3-flash"}' -o .sumA.json && ok "summarize accepted" || bad "summarize call"
for i in {1..60}; do
  S=$(sqlite3 ~/.local/share/opencode/opencode.db "SELECT COUNT(*) FROM message WHERE session_id='$SID' AND json_extract(data,'\$.role')='assistant' AND json_extract(data,'\$.summary')=1;" 2>/dev/null)
  [[ "${S:-0}" -ge 1 ]] && break
  sleep 2
done
[[ "${S:-0}" -ge 1 ]] && ok "summary message in session (real compaction)" || bad "summary message"
/usr/bin/grep -q '"kind":"compact"' "$METRICS" && ok "compaction hook fired" || bad "compaction hook fired"
/usr/bin/grep -q "Compaction e2e decision" "$TB/memory-root/PROJECTS/testbed/CURRENT.md" && ok "memory written pre-compaction" || bad "memory written"
RINJ=$(/usr/bin/grep '"kind":"inject"' "$METRICS" | tail -2 | head -1 | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['injectedTokens']>0 and d['systemCharsBefore']<d['systemCharsAfter'])")
[[ "$RINJ" == "True" ]] && ok "memory reinjected into post-compaction request" || bad "post-compaction reinjection: $RINJ"

step "B. session restart and resume"
# true restart scenario: the server that created the session must be gone
kill $SRV 2>/dev/null; pkill -f "opencode serve"; sleep 2
RES=$(opencode run -s "$SID" --dir "$TB" "Reply exactly: RESUMED_OK" 2>/dev/null | tail -1)
echo "$RES" | /usr/bin/grep -q "RESUMED_OK" && ok "session resumed after server restart" || bad "resume reply: $RES"
CNT=$(/usr/bin/grep -c "\"kind\":\"inject\",\"sessionID\":\"$SID\"" "$METRICS")
[[ "$CNT" -ge 3 ]] && ok "injection logged across restart ($CNT entries)" || bad "injection count $CNT"
SUMOK=$(opencode run -s "$SID" --dir "$TB" "Reply exactly: POST_COMPACT_OK" > /dev/null 2>&1; sqlite3 ~/.local/share/opencode/opencode.db "SELECT COUNT(*) FROM message WHERE session_id='$SID' AND json_extract(data,'\$.role')='assistant';")
[[ "${SUMOK:-0}" -ge 4 ]] && ok "post-compaction turns continue" || bad "post-compaction turns: $SUMOK"

step "C. role switching"
cat >> "$TB/memory-root/GLOBAL.md" <<'EOF'

<!-- memory:roles="ux" -->
## UX tagged
UX-only content marker.
<!-- /memory:roles -->
EOF
opencode run --dir "$TB" "Reply exactly: ROLE_OK" > /dev/null 2>&1
opencode run --dir "$TB" "Reply exactly: ROLE_OK" > /dev/null 2>&1
MEMORY_ROLE=ux opencode run --dir "$TB" "Reply exactly: ROLE_OK" > /dev/null 2>&1
H_GEN=$(/usr/bin/grep '"kind":"inject"' "$METRICS" | grep '"hash":"[0-9a-f]' | grep -v '"role":"ux"' | tail -1 | python3 -c "import sys,json;print(json.load(sys.stdin)['hash'])")
H_UX=$(/usr/bin/grep '"kind":"inject"' "$METRICS" | grep '"hash":"[0-9a-f]' | grep '"role":"ux"' | tail -1 | python3 -c "import sys,json;print(json.load(sys.stdin)['hash'])")
[[ -n "$H_UX" && -n "$H_GEN" && "$H_UX" != "$H_GEN" ]] && ok "role changes injected block ($H_GEN vs $H_UX)" || bad "role hashes: gen=$H_GEN ux=$H_UX"

step "D. supersede e2e"
opencode run --dir "$TB" "Use the memory tool: action=save kind=decision content=(Supersede e2e replacement) supersedes=D-01. Reply the tool result text." > .supersede.out 2>/dev/null
CUR="$TB/memory-root/PROJECTS/testbed/CURRENT.md"
/usr/bin/grep -q "superseded by D-02" "$CUR" && ok "D-01 marked superseded" || bad "supersede marker"
/usr/bin/grep -q "Supersede e2e replacement" "$CUR" && ok "D-02 row present" || bad "D-02 row"

step "E. cross-project isolation"
mkdir -p "$ROOT/testbed2"
git init -q "$ROOT/testbed2" 2>/dev/null
cat > "$ROOT/testbed2/opencode.json" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "opencode-go/glm-5.3-flash"
}
EOF
OUT2=$(opencode run --dir "$ROOT/testbed2" "Use the memory tool: action=save kind=discovery scope=testbed content=(cross project write attempt). Reply the tool result text." 2>/dev/null | tail -1)
# state check first; model paraphrases the refusal, so the wording regex stays loose
! /usr/bin/grep -q "cross project write attempt" "$TB/memory-root/PROJECTS/testbed/CURRENT.md" && echo "$OUT2" | /usr/bin/grep -qiE "n.?t match|blocked|nothing was (saved|written)" && ok "cross-project write blocked" || bad "isolation: $OUT2"
SLUG2=$(opencode run --dir "$ROOT/testbed2" "Reply exactly: ISO_OK" > /dev/null 2>&1; /usr/bin/grep '"kind":"inject"' "$METRICS" | grep '"hash":"[0-9a-f]' | tail -1 | python3 -c "import sys,json;print(json.load(sys.stdin)['slug'])")
[[ "$SLUG2" == "testbed2" ]] && ok "second project resolves own slug" || bad "slug=$SLUG2"
opencode run --dir "$ROOT/testbed2" "Use the memory tool: action=save kind=discovery content=(testbed2 own discovery). Reply DONE." > /dev/null 2>&1
[[ -f "$TB/memory-root/PROJECTS/testbed2/CURRENT.md" ]] && ok "separate project memory created" || bad "testbed2 memory dir"
! /usr/bin/grep -q "testbed2 own discovery" "$TB/memory-root/PROJECTS/testbed/CURRENT.md" && ok "testbed memory untouched by testbed2" || bad "cross-project leakage"

step "F. fail-open"
DEAD="$ROOT/.memdead"; mkdir -p "$DEAD"; chmod 000 "$DEAD"
OUTF=$(MEMORY_ROOT="$DEAD" opencode run --dir "$TB" "Reply exactly: FAILSAFE_OK" 2>&1 | tail -1)
chmod 755 "$DEAD"
echo "$OUTF" | /usr/bin/grep -q "FAILSAFE_OK" && ok "unreadable memory root fails open" || bad "fail-open: $OUTF"

echo "\n== RESULT: $PASS passed, $FAIL failed [$(date +%H:%M:%S)] =="
exit $FAIL
