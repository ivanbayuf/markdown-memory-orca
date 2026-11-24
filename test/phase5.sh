#!/bin/zsh
# Phase 5: scripted A/B benchmark. BASE = --pure (plugin off), EXP = plugin on. 3 fresh sessions each.
cd "${0:A:h}/.."
export MEMORY_ROOT="$PWD/testbed/memory-root"
TB="$PWD/testbed"; DB=~/.local/share/opencode/opencode.db
P_HEAD="Read the files README.md and opencode.json in this project with the read tool."
P_EXP="$P_HEAD Then use the memory tool: action=save kind=discovery content=(main files and their purpose). Then reply DONE."
P_BASE="$P_HEAD Then summarize their purpose in one sentence. Then reply DONE."
typeset -A SIDS

run_variant() { # $1=name $2..=opencode args
  local name=$1; shift; local ids=()
  for i in 1 2 3; do
    local t0=$(( $(date +%s) * 1000 ))
    local s=$(date +%s); "$@" > ".phase5.$name.$i.out" 2>&1; local rc=$?
    local sid=$(sqlite3 "$DB" "SELECT id FROM session WHERE directory='$TB' AND parent_id IS NULL AND time_created >= $t0 ORDER BY time_created LIMIT 1;")
    echo "$name run $i: sid=$sid rc=$rc wall=$(( $(date +%s) - s ))s"
    ids+=("'$sid'")
  done
  SIDS[$name]=${(j:,:)ids}
}

rm -rf "$TB/memory-root"
run_variant BASE opencode run --pure --dir "$TB" "$P_BASE"
rm -rf "$TB/memory-root"
run_variant EXP opencode run --dir "$TB" "$P_EXP"

for v in BASE EXP; do
  echo "\n== $v sessions: ${SIDS[$v]} =="
  sqlite3 -header -column "$DB" "SELECT session_id, COUNT(*) turns,
    SUM(json_extract(data,'\$.tokens.input')) input, SUM(json_extract(data,'\$.tokens.output')) output,
    SUM(json_extract(data,'\$.tokens.cache.read')) cache_read, SUM(json_extract(data,'\$.tokens.cache.write')) cache_write,
    ROUND(SUM(json_extract(data,'\$.cost')),6) cost
    FROM message WHERE session_id IN (${SIDS[$v]}) AND json_extract(data,'\$.role')='assistant'
    GROUP BY session_id UNION ALL
    SELECT 'TOTAL', COUNT(*), SUM(json_extract(data,'\$.tokens.input')), SUM(json_extract(data,'\$.tokens.output')),
    SUM(json_extract(data,'\$.tokens.cache.read')), SUM(json_extract(data,'\$.tokens.cache.write')),
    ROUND(SUM(json_extract(data,'\$.cost')),6)
    FROM message WHERE session_id IN (${SIDS[$v]}) AND json_extract(data,'\$.role')='assistant';"
  sqlite3 "$DB" "SELECT 'mean input/turn: ' || ROUND(AVG(json_extract(data,'\$.tokens.input')),1)
    FROM message WHERE session_id IN (${SIDS[$v]}) AND json_extract(data,'\$.role')='assistant';"
  echo "tool calls:"
  sqlite3 "$DB" "SELECT '  ' || json_extract(data,'\$.tool') || ' x' || COUNT(*) || ' (' ||
    SUM(json_extract(data,'\$.state.status')='error') || ' errors)'
    FROM part WHERE session_id IN (${SIDS[$v]}) AND json_extract(data,'\$.type')='tool' GROUP BY 1=1, json_extract(data,'\$.tool');"
done

echo "\n== EXP injected tokens (hash!=null) =="
python3 - "$TB/memory-root/.metrics/opencode.jsonl" "${SIDS[EXP]//\'/}" <<'EOF'
import sys, json
ids = set(sys.argv[2].split(","))
rows = [r for r in map(json.loads, open(sys.argv[1])) if r.get("kind") == "inject" and r.get("hash") and r.get("sessionID") in ids]
assert rows, "no inject rows for EXP sessions"
print(f"requests={len(rows)} mean_injected={sum(r['injectedTokens'] for r in rows)/len(rows):.1f} values={[r['injectedTokens'] for r in rows]}")
EOF
