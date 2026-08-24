#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
E="${E:?E must be the ignored task-6 evidence directory}"
PORT="${BG_PORT:-14086}"; BASE="http://127.0.0.1:${PORT}"; ORIGIN="$BASE"; REAL_HOME="$HOME"
mkdir -p "$E"; E="$(cd "$E" && pwd)"; QA_HOME="$(mktemp -d "$E/qa-home.XXXXXX")"
DB="$QA_HOME/.burnguard/burnguard.db"; LOG="$E/backend.log"; COOKIE="$E/cookies"; READY="$E/readiness.fifo"; LINES="$E/backend-lines.fifo"
BG_PID=""; WATCH_PID=""; TAIL_PID=""; CAP=""; OWNED_PIDS=()

stop_backend() {
  for pid in "$BG_PID" "$WATCH_PID" "$TAIL_PID"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null || true; fi
    if [ -n "$pid" ]; then wait "$pid" 2>/dev/null || true; fi
  done
  BG_PID=""; WATCH_PID=""; TAIL_PID=""
}
cleanup() {
  status=$?; observed_pids="$(printf '%s\n' ${OWNED_PIDS[@]+"${OWNED_PIDS[@]}"} | jq -Rsc 'split("\n")|map(select(length>0)|tonumber)')"
  owned_listeners="$(for pid in ${OWNED_PIDS[@]+"${OWNED_PIDS[@]}"}; do lsof -nP -a -p "$pid" -iTCP -sTCP:LISTEN -FnPT 2>/dev/null || true; done | sort -u | jq -Rsc 'split("\n")|map(select(length>0))')"
  stop_backend; rm -f "$READY" "$LINES" "$COOKIE" "$E/turn-path.fifo"
  live=0; for pid in ${OWNED_PIDS[@]+"${OWNED_PIDS[@]}"}; do if kill -0 "$pid" 2>/dev/null; then live=$((live+1)); fi; done
  listeners="$({ lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true; } | tail -n +2 | wc -l | tr -d ' ')"
  rm -rf "$QA_HOME"; home_remaining=0; [ -e "$QA_HOME" ] && home_remaining=1
  fifo_remaining="$(find "$E" -type p | wc -l | tr -d ' ')"; db_remaining="$(find "$E" -type f \( -name '*.db' -o -name '*.db-*' \) | wc -l | tr -d ' ')"
  staging_remaining="$(find "$E" -mindepth 1 -type d \( -name 'qa-home.*' -o -name 'staging*' -o -name 'tmp*' \) | wc -l | tr -d ' ')"
  evidence_temp_remaining="$(find "$E" -type f \( -name 'cookies' -o -name '*.tmp' -o -name '*.fifo' \) | wc -l | tr -d ' ')"
  QA_HOME_VALUE="$QA_HOME" REPO_ROOT_VALUE="$REPO_ROOT" REAL_HOME_VALUE="$REAL_HOME" find "$E" -type f -exec perl -pi -e 's/\Q$ENV{QA_HOME_VALUE}\E/<qa-home>/g; s/\Q$ENV{REPO_ROOT_VALUE}\E/<repo>/g; s/\Q$ENV{REAL_HOME_VALUE}\E/<home>/g' {} +
  sanitized=true; if rg -l -F "$QA_HOME" "$E" >/dev/null || rg -l -F "$REPO_ROOT" "$E" >/dev/null || rg -l -F "$REAL_HOME" "$E" >/dev/null; then sanitized=false; status=1; fi
  residue=$((live + listeners + home_remaining + fifo_remaining + db_remaining + staging_remaining + evidence_temp_remaining)); if [ "$residue" -ne 0 ]; then status=1; fi
  jq -n --argjson exit "$status" --argjson pids "$observed_pids" --argjson owned_listeners "$owned_listeners" --argjson live "$live" --argjson listeners "$listeners" --argjson home "$home_remaining" --argjson fifo "$fifo_remaining" --argjson db "$db_remaining" --argjson staging "$staging_remaining" --argjson temp "$evidence_temp_remaining" --argjson sanitized "$sanitized" --arg port "$PORT" \
    '{observed:{owned_pids:$pids,owned_listener_records:$owned_listeners,backend_port:($port|tonumber),adapter_worker_ports:[]},remaining:{processes:$live,backend_listeners:$listeners,isolated_homes:$home,fifos:$fifo,temp_databases:$db,staging_directories:$staging,evidence_temp_files:$temp},checks:{processes_exited:($live==0),ports_free:($listeners==0),home_removed:($home==0),fifos_removed:($fifo==0),temp_databases_removed:($db==0),staging_removed:($staging==0),evidence_temps_removed:($temp==0),evidence_sanitized:$sanitized},browser:{status:"not_applicable",launched:false},exit:$exit}' >"$E/cleanup.json"
  exit "$status"
}
trap cleanup EXIT INT TERM

start_backend() {
  rm -f "$READY" "$LINES"; mkfifo "$READY" "$LINES"; touch "$LOG"
  tail -n 0 -F "$LOG" >"$LINES" & TAIL_PID=$!
  awk -v expected="[burnguard] listening on $BASE" '$0==expected {print "ready"; fflush(); exit}' <"$LINES" >"$READY" & WATCH_PID=$!
  BG_NO_OPEN=1 HOME="$QA_HOME" CODEX_HOME="$REAL_HOME/.codex" BG_PORT="$PORT" BG_LEARNING_FAULT_BEFORE_CHECKPOINT_ID="qa-crash-cp" \
    bun packages/backend/src/index.ts >>"$LOG" 2>&1 & BG_PID=$!; OWNED_PIDS+=("$BG_PID")
  if ! IFS= read -r -t 60 ready <"$READY" || [ "$ready" != ready ]; then echo readiness_failed >&2; exit 1; fi
  kill -0 "$BG_PID"; bootstrap="$(curl -sS -c "$COOKIE" -H "Origin: $ORIGIN" "$BASE/api/bootstrap")"
  CAP="$(printf '%s' "$bootstrap" | jq -er '.data.capability')"; printf '%s' "$bootstrap" | jq 'del(.data.capability)' >"$E/bootstrap.json"
}
request() {
  name="$1" method="$2" route="$3" payload="$4" expected="$5"; out="$E/$name.response.json"
  args=(-sS -o "$out" -w '%{http_code}' -b "$COOKIE" -H "Origin: $ORIGIN" -H "x-burnguard-capability: $CAP" -X "$method")
  if [ -n "$payload" ]; then args+=(-H 'content-type: application/json' --data-binary "@$payload"); fi
  status="$(curl "${args[@]}" "$BASE$route")"; printf '%s\n' "$status" >"$E/$name.status"
  printf '%s %s -> %s\n' "$method" "$route" "$status" >>"$E/requests.log"; [ "$status" = "$expected" ]
}
payload() { printf '%s\n' "$2" >"$E/$1.payload.json"; }
db_json() { HOME="$QA_HOME" bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(JSON.stringify(d.query(process.argv[2]).all()))' "$DB" "$1"; }
db_count() { HOME="$QA_HOME" bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(d.query(process.argv[2]).get().count)' "$DB" "$1"; }

cd "$REPO_ROOT"; bun run scripts/qa/preflight.ts --json >"$E/preflight.json"
git rev-parse HEAD >"$E/source-head.txt"; git diff --binary | shasum -a 256 | awk '{print $1}' >"$E/source-diff.sha256"
git -c core.quotePath=false ls-files --cached --others --exclude-standard | LC_ALL=C sort -u | while IFS= read -r path; do
  case "$path" in
    .omo/*|.debug-journal.md|node_modules/*|*/node_modules/*|dist/*|*/dist/*|coverage/*|*/coverage/*|*.db|*.db-*|*.fifo|qa-home.*/*|*/qa-home.*/*|staging/*|staging.*/*|*/staging/*|*/staging.*/*|tmp/*|tmp.*/*|*/tmp/*|*/tmp.*/*) ;;
    *) printf '%s\n' "$path" ;;
  esac
done >"$E/source-product.paths"
while IFS= read -r path; do printf '%s\0%s\0%s\0' "$path" "$(stat -f %z "$path")" "$(shasum -a 256 "$path" | awk '{print $1}')"; done <"$E/source-product.paths" | shasum -a 256 | awk '{print $1}' >"$E/source-product.sha256"
printf '%s\n' 'include=all literal paths from git -c core.quotePath=false ls-files --cached --others --exclude-standard, LC_ALL=C sorted unique; exclude=.omo/**,.debug-journal.md,any node_modules/**,any dist/**,any coverage/**,*.db,*.db-*,*.fifo,and qa-home/staging/tmp transient directory trees; digest=SHA-256 of concatenated UTF-8 path NUL decimal-size NUL file-SHA-256 NUL records' >"$E/source-product.algorithm.txt"
wc -l <"$E/source-product.paths" | tr -d ' ' >"$E/source-product.count"
start_backend; payload empty '{}'; request seed POST /api/learning/seed "$E/empty.payload.json" 200
payload seed-delete '{"expected_revision":0}'; request seed-protected DELETE /api/learning/items/burnguard-learning-contrast "$E/seed-delete.payload.json" 403
payload project '{"name":"Task 6 Project","type":"prototype","design_system_id":null,"backend_id":"codex"}'
request project POST /api/projects "$E/project.payload.json" 201; PROJECT_ID="$(jq -er '.data.id' "$E/project.response.json")"
HOME="$QA_HOME" bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);d.run("UPDATE projects SET current_revision=7,current_digest=\"qa-digest-7\" WHERE id=?",process.argv[2])' "$DB" "$PROJECT_ID"
jq -n --arg p "$PROJECT_ID" '{id:"qa-item",kind:"example",title:"Original",content:{summary:"QA item"},project_id:$p}' >"$E/item.payload.json"
request item POST /api/learning/items "$E/item.payload.json" 201

BEFORE_MALFORMED="$(db_count 'SELECT COUNT(*) count FROM learning_items')"
payload malformed-unknown '{"id":"qa-unknown","kind":"lesson","title":"Bad","content":{"summary":"x","unknown":true},"project_id":null}'
payload forged-seed '{"id":"qa-forged","kind":"lesson","title":"Bad","content":{"summary":"x"},"project_id":null,"owner":"system","seed_key":"contrast"}'
payload malformed-id '{"id":"../bad","kind":"lesson","title":"Bad","content":{"summary":"x"},"project_id":null}'
payload negative-revision '{"expected_revision":-1,"title":"Bad"}'
request malformed-unknown POST /api/learning/items "$E/malformed-unknown.payload.json" 400
request forged-seed POST /api/learning/items "$E/forged-seed.payload.json" 400
request malformed-id POST /api/learning/items "$E/malformed-id.payload.json" 400
request negative-revision PATCH /api/learning/items/qa-item "$E/negative-revision.payload.json" 400
route_cases=(
  'route-traversal|..%2Fbad' 'route-encoded-traversal|%252e%252e%252fbad'
  'route-slash|bad%2Fslash' 'route-backslash|bad%5Cslash' 'route-absolute|%2Fabsolute'
  'route-drive|C%3A%5Cbad' 'route-control|bad%00id' 'route-reserved|CON'
  'route-malformed|%25ZZ' "route-oversize|$(printf 'a%.0s' {1..129})"
)
for entry in "${route_cases[@]}"; do name="${entry%%|*}"; path="${entry#*|}"; request "$name" GET "/api/learning/items/$path" '' 400; jq -e '.error.code=="invalid_learning_id"' "$E/$name.response.json" >/dev/null; done
AFTER_MALFORMED="$(db_count 'SELECT COUNT(*) count FROM learning_items')"; [ "$BEFORE_MALFORMED" = "$AFTER_MALFORMED" ]
request reseed-after-user POST /api/learning/seed "$E/empty.payload.json" 200; request user-after-reseed GET /api/learning/items/qa-item '' 200

payload rename '{"expected_revision":0,"title":"Renamed"}'; request rename PATCH /api/learning/items/qa-item "$E/rename.payload.json" 200
payload duplicate '{"id":"qa-copy","title":"Copy"}'; request duplicate POST /api/learning/items/qa-item/duplicate "$E/duplicate.payload.json" 201
payload left '{"expected_revision":0,"state":"in_progress","feedback_draft":"left-draft"}'; payload right '{"expected_revision":0,"state":"completed","feedback_draft":"right-draft"}'
request cas-left PATCH /api/learning/items/qa-item/progress "$E/left.payload.json" "$(true; echo 200)" & LEFT_PID=$!
request cas-right PATCH /api/learning/items/qa-item/progress "$E/right.payload.json" "$(true; echo 412)" & RIGHT_PID=$!
set +e; wait "$LEFT_PID"; L=$?; wait "$RIGHT_PID"; R=$?; set -e
if [ "$L" -ne 0 ] || [ "$R" -ne 0 ]; then
  CAS_SORTED="$(printf '%s\n%s\n' "$(cat "$E/cas-left.status")" "$(cat "$E/cas-right.status")" | sort | tr '\n' ' ' | sed 's/ $//')"; [ "$CAS_SORTED" = "200 412" ]
fi
request detail GET /api/learning/items/qa-item '' 200

jq -n --arg p "$PROJECT_ID" '{id:"qa-crash-cp",project_id:$p,artifact_revision:7,artifact_digest:"qa-digest-7",feedback:"crash",parent_checkpoint_id:null,next_context:{kind:"iteration",parent_checkpoint_id:"qa-crash-cp",schema_revision:1,artifact_revision:7,artifact_digest:"qa-digest-7"},evidence:{kind:"complete"}}' >"$E/crash.payload.json"
request crash POST /api/learning/items/qa-item/checkpoints "$E/crash.payload.json" 500
db_count 'SELECT COUNT(*) count FROM learning_checkpoints WHERE id="qa-crash-cp"' >"$E/crash-count-before-restart.txt"; [ "$(cat "$E/crash-count-before-restart.txt")" = 0 ]
stop_backend; start_backend; db_count 'SELECT COUNT(*) count FROM learning_checkpoints WHERE id="qa-crash-cp"' >"$E/crash-count-after-restart.txt"; [ "$(cat "$E/crash-count-after-restart.txt")" = 0 ]
jq '.id="qa-partial-cp"|.next_context.parent_checkpoint_id="qa-partial-cp"|.evidence={kind:"partial",code:"missing_artifact_evidence"}' "$E/crash.payload.json" >"$E/partial.payload.json"
request partial POST /api/learning/items/qa-item/checkpoints "$E/partial.payload.json" 200
jq '.id="qa-good-cp"|.feedback="committed-feedback"|.next_context.parent_checkpoint_id="qa-good-cp"' "$E/crash.payload.json" >"$E/good.payload.json"
request good POST /api/learning/items/qa-item/checkpoints "$E/good.payload.json" 201
request checkpoint-duplicate POST /api/learning/items/qa-item/checkpoints "$E/good.payload.json" 409

HOME="$QA_HOME" bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);const out={};for(const [k,sql] of [["update","UPDATE learning_checkpoints SET feedback=\"changed\" WHERE id=\"qa-good-cp\""],["delete","DELETE FROM learning_checkpoints WHERE id=\"qa-good-cp\""]]){try{d.run(sql);out[k]={blocked:false}}catch(e){out[k]={blocked:true,message:e instanceof Error?e.message:"unknown"}}}console.log(JSON.stringify(out))' "$DB" >"$E/direct-sql-immutability.json"
jq -e '.update.blocked and .delete.blocked' "$E/direct-sql-immutability.json" >/dev/null

HOME="$QA_HOME" bun -e 'import {buildPrompt} from "./packages/backend/src/harness/prompt-builder";const p=process.argv[1];const text=await buildPrompt({project:{project_id:p,project_name:"QA",project_type:"prototype",entrypoint:"index.html",project_dir:"/tmp/qa",options_json:null},files:[],attachments:[],designSystem:null,openComments:[]},{type:"user.message",text:"iterate"});console.log(text)' "$PROJECT_ID" >"$E/context-compatible.raw.txt"
rg -F '<burnguard-learning-context-v1>' "$E/context-compatible.raw.txt" >/dev/null; ! rg -F 'left-draft' "$E/context-compatible.raw.txt" >/dev/null; ! rg -F 'right-draft' "$E/context-compatible.raw.txt" >/dev/null

payload delete '{"expected_revision":1}'; request delete DELETE /api/learning/items/qa-item "$E/delete.payload.json" 200; request hidden GET /api/learning/items/qa-item '' 404
payload stale-restore '{"expected_revision":1}'; request stale-restore POST /api/learning/items/qa-item/restore "$E/stale-restore.payload.json" 412
payload restore '{"expected_revision":2}'; request restore POST /api/learning/items/qa-item/restore "$E/restore.payload.json" 200
payload reset '{"expected_revision":1}'; request reset POST /api/learning/items/qa-item/reset "$E/reset.payload.json" 200; request stale-reset POST /api/learning/items/qa-item/reset "$E/reset.payload.json" 412

jq -n --arg p "$PROJECT_ID" '{id:"qa-life",kind:"example",title:"Life",content:{summary:"Life"},project_id:$p}' >"$E/life.payload.json"; request life POST /api/learning/items "$E/life.payload.json" 201
payload life-delete '{"expected_revision":0}'
request life-delete-left DELETE /api/learning/items/qa-life "$E/life-delete.payload.json" 200 & A=$!; request life-delete-right DELETE /api/learning/items/qa-life "$E/life-delete.payload.json" 412 & B=$!; set +e; wait "$A"; X=$?; wait "$B"; Y=$?; set -e
if [ "$X" -ne 0 ] || [ "$Y" -ne 0 ]; then [ "$(printf '%s\n%s\n' "$(cat "$E/life-delete-left.status")" "$(cat "$E/life-delete-right.status")" | sort | tr '\n' ' ' | sed 's/ $//')" = "200 412" ]; fi
payload life-restore '{"expected_revision":1}'
request life-restore-left POST /api/learning/items/qa-life/restore "$E/life-restore.payload.json" 200 & A=$!; request life-restore-right POST /api/learning/items/qa-life/restore "$E/life-restore.payload.json" 412 & B=$!; set +e; wait "$A"; X=$?; wait "$B"; Y=$?; set -e
if [ "$X" -ne 0 ] || [ "$Y" -ne 0 ]; then [ "$(printf '%s\n%s\n' "$(cat "$E/life-restore-left.status")" "$(cat "$E/life-restore-right.status")" | sort | tr '\n' ' ' | sed 's/ $//')" = "200 412" ]; fi
jq -n --arg p "$PROJECT_ID" '{id:"qa-opposite",kind:"example",title:"Opposite",content:{summary:"Opposite"},project_id:$p}' >"$E/opposite.payload.json"; request opposite POST /api/learning/items "$E/opposite.payload.json" 201
payload opposite-state '{"expected_revision":0}'
request opposite-delete DELETE /api/learning/items/qa-opposite "$E/opposite-state.payload.json" 200 & A=$!; request opposite-restore POST /api/learning/items/qa-opposite/restore "$E/opposite-state.payload.json" 412 & B=$!; set +e; wait "$A"; X=$?; wait "$B"; Y=$?; set -e
if [ "$X" -ne 0 ] || [ "$Y" -ne 0 ]; then [ "$(printf '%s\n%s\n' "$(cat "$E/opposite-delete.status")" "$(cat "$E/opposite-restore.status")" | sort | tr '\n' ' ' | sed 's/ $//')" = "200 412" ]; fi

HOME="$QA_HOME" bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);d.exec("PRAGMA busy_timeout=5000");const p=process.argv[2];d.run("INSERT INTO learning_checkpoints(id,item_id,project_id,artifact_revision,artifact_digest,feedback,next_context_json,created_at) VALUES (?,?,?,?,?,?,?,?)","qa-bad-parent","qa-item",p,7,"qa-digest-7","bad","{",9999999999998);d.run("INSERT INTO learning_checkpoints(id,item_id,project_id,parent_checkpoint_id,artifact_revision,artifact_digest,feedback,next_context_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)","qa-bad-child","qa-item",p,"qa-bad-parent",7,"qa-digest-7","suspect",JSON.stringify({kind:"iteration",parent_checkpoint_id:"qa-bad-child",schema_revision:1,artifact_revision:7,artifact_digest:"qa-digest-7"}),9999999999999)' "$DB" "$PROJECT_ID"
HOME="$QA_HOME" bun -e 'import {selectPromptLearning} from "./packages/backend/src/db/learning-store";import {Database} from "bun:sqlite";console.log(JSON.stringify(selectPromptLearning(new Database(process.argv[1]),process.argv[2])))' "$DB" "$PROJECT_ID" >"$E/corrupt-lineage-selection.json"
jq -e '.context==null and .warning=="incompatible_checkpoint"' "$E/corrupt-lineage-selection.json" >/dev/null

SESSION_ID="$(HOME="$QA_HOME" bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(d.query("SELECT id FROM sessions WHERE project_id=?").get(process.argv[2]).id)' "$DB" "$PROJECT_ID")"
TRACE="$QA_HOME/.burnguard/logs/$SESSION_ID.trace.log"; TURN_FIFO="$E/turn-path.fifo"; rm -f "$TURN_FIFO"; mkfifo "$TURN_FIFO"
( tail -n 0 -F "$TRACE" 2>/dev/null | awk '/"level":"prompt_built"/{print;fflush();exit}' >"$TURN_FIFO" ) & TRACE_PID=$!; OWNED_PIDS+=("$TRACE_PID")
payload turn '{"type":"user.message","text":"Return a one-line acknowledgement without editing files."}'; request turn POST "/api/sessions/$SESSION_ID/events" "$E/turn.payload.json" 200
IFS= read -r -t 60 TURN_LINE <"$TURN_FIFO"; printf '%s\n' "$TURN_LINE" >"$E/turn-prompt-built.jsonl"; kill "$TRACE_PID" 2>/dev/null || true; wait "$TRACE_PID" 2>/dev/null || true; rm -f "$TURN_FIFO"
request interrupt POST "/api/sessions/$SESSION_ID/interrupt" "$E/empty.payload.json" 200

CANONICAL_QUERY='SELECT id,item_id,project_id,parent_checkpoint_id,artifact_revision,artifact_digest,feedback,next_context_json FROM learning_checkpoints ORDER BY id'
db_json "$CANONICAL_QUERY" | jq -S . >"$E/checkpoints.canonical.json"; BEFORE_HASH="$(shasum -a 256 "$E/checkpoints.canonical.json" | awk '{print $1}')"
stop_backend; start_backend; db_json "$CANONICAL_QUERY" | jq -S . >"$E/checkpoints-after-restart.canonical.json"; AFTER_HASH="$(shasum -a 256 "$E/checkpoints-after-restart.canonical.json" | awk '{print $1}')"
[ "$BEFORE_HASH" = "$AFTER_HASH" ]
db_json 'SELECT id,kind,title,project_id,parent_item_id,deleted_at,content_json FROM learning_items ORDER BY id' | jq -S . >"$E/items.canonical.json"
db_json 'SELECT item_id,state,revision,feedback_draft FROM learning_progress ORDER BY item_id' | jq -S . >"$E/progress.canonical.json"

statuses="$(for file in "$E"/*.status; do jq -n --arg key "$(basename "$file" .status)" --argjson value "$(cat "$file")" '{key:$key,value:$value}'; done | jq -s 'from_entries')"
jq -n --argjson statuses "$statuses" --arg before "$BEFORE_HASH" --arg after "$AFTER_HASH" --argjson malformed_before "$BEFORE_MALFORMED" --argjson malformed_after "$AFTER_MALFORMED" \
  --slurpfile direct "$E/direct-sql-immutability.json" --slurpfile lineage "$E/corrupt-lineage-selection.json" --rawfile compatible "$E/context-compatible.raw.txt" \
  --rawfile crash_before "$E/crash-count-before-restart.txt" --rawfile crash_after "$E/crash-count-after-restart.txt" --rawfile turn "$E/turn-prompt-built.jsonl" \
  '{statuses:$statuses,malformed_no_mutation:($malformed_before==$malformed_after),crash_no_fabrication:(($crash_before|tonumber)==0 and ($crash_after|tonumber)==0),checkpoint_restart:{before_sha256:$before,after_sha256:$after,equal:($before==$after)},direct_sql:$direct[0],lineage:$lineage[0],context:{compatible:($compatible|contains("<burnguard-learning-context-v1>")),draft_excluded:(($compatible|contains("left-draft")|not) and ($compatible|contains("right-draft")|not))},turn_path:{prompt_built:($turn|length>0)},browser:{status:"not_applicable",launched:false}} | .ok=(.malformed_no_mutation and .crash_no_fabrication and .checkpoint_restart.equal and .direct_sql.update.blocked and .direct_sql.delete.blocked and .lineage.context==null and .lineage.warning=="incompatible_checkpoint" and .context.compatible and .context.draft_excluded and .turn_path.prompt_built)' >"$E/qa-receipt.json"
jq -e '.ok' "$E/qa-receipt.json" >/dev/null
jq -n --arg head "$(cat "$E/source-head.txt")" --arg diff "$(cat "$E/source-diff.sha256")" --arg product "$(cat "$E/source-product.sha256")" --argjson count "$(cat "$E/source-product.count")" --arg algorithm "$(cat "$E/source-product.algorithm.txt")" '{head:$head,diff_sha256:$diff,canonical_product:{sha256:$product,included_file_count:$count,algorithm:$algorithm,path_list:"source-product.paths"}}' >"$E/source-identity.json"
