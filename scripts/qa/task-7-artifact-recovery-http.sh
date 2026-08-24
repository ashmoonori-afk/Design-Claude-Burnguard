#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
E="${E:?E must be the ignored task-7 evidence directory}"
PORT="${BG_PORT:-14087}"; BASE="http://127.0.0.1:${PORT}"; ORIGIN="$BASE"; REAL_HOME="$HOME"
mkdir -p "$E"; E="$(cd "$E" && pwd)"; QA_HOME="$(mktemp -d "$E/qa-home.XXXXXX")"
DB="$QA_HOME/.burnguard/burnguard.db"; LOG="$E/backend.log"; COOKIE="$E/cookies"; READY="$E/readiness.fifo"
BG_PID=""; SSE_PID=""; WATCH_PIDS=(); OWNED_PIDS=(); CAP=""; PROJECT_ID=""; SESSION_ID=""; PROJECT_DIR=""; TURN_BARRIER=""; TURN_OP_SCOPE=""

stop_backend() {
  if [ -n "$BG_PID" ] && kill -0 "$BG_PID" 2>/dev/null; then kill -KILL "$BG_PID" 2>/dev/null || true; fi
  if [ -n "$BG_PID" ]; then wait "$BG_PID" 2>/dev/null || true; fi
  BG_PID=""
}
stop_sse() {
  if [ -n "$SSE_PID" ] && kill -0 "$SSE_PID" 2>/dev/null; then kill -KILL "$SSE_PID" 2>/dev/null || true; fi
  if [ -n "$SSE_PID" ]; then wait "$SSE_PID" 2>/dev/null || true; fi
  SSE_PID=""
}
cleanup() {
  status=$?; stop_sse; stop_backend
  for pid in ${WATCH_PIDS[@]+"${WATCH_PIDS[@]}"}; do kill -KILL "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; done
  rm -f "$READY" "$COOKIE" "$E"/*.fifo
  live=0; for pid in ${OWNED_PIDS[@]+"${OWNED_PIDS[@]}"}; do kill -0 "$pid" 2>/dev/null && live=$((live+1)) || true; done
  listeners="$({ lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true; } | tail -n +2 | wc -l | tr -d ' ')"
  rm -rf "$QA_HOME"; home_remaining=0; [ -e "$QA_HOME" ] && home_remaining=1
  fifo_remaining="$(find "$E" -type p | wc -l | tr -d ' ')"; temp_remaining="$(find "$E" -type f \( -name cookies -o -name '*.fifo' -o -name '*.tmp' \) | wc -l | tr -d ' ')"
  QA_HOME_VALUE="$QA_HOME" REPO_ROOT_VALUE="$REPO_ROOT" REAL_HOME_VALUE="$REAL_HOME" find "$E" -type f -exec perl -pi -e 's/\Q$ENV{QA_HOME_VALUE}\E/<qa-home>/g; s/\Q$ENV{REPO_ROOT_VALUE}\E/<repo>/g; s/\Q$ENV{REAL_HOME_VALUE}\E/<home>/g' {} +
  sanitized=true; if rg -l -F "$QA_HOME" "$E" >/dev/null || rg -l -F "$REPO_ROOT" "$E" >/dev/null || rg -l -F "$REAL_HOME" "$E" >/dev/null; then sanitized=false; status=1; fi
  residue=$((live + listeners + home_remaining + fifo_remaining + temp_remaining)); [ "$residue" -eq 0 ] || status=1
  full_process_exit=false; if [ -f "$E/full-tests.exit" ] && [ "$(tr -d '[:space:]' <"$E/full-tests.exit")" = 0 ]; then full_process_exit=true; fi
  gate_args=(--argjson full_process_exit "$full_process_exit")
  for gate in exact-acceptance affected-tests full-attribution typecheck build diff-check static-scan; do
    gate_file="$E/$gate.exit"; gate_value=false
    if [ -f "$gate_file" ] && [ "$(tr -d '[:space:]' <"$gate_file")" = 0 ]; then gate_value=true; else status=1; fi
    gate_args+=(--argjson "${gate//-/_}" "$gate_value")
  done
  jq -n --argjson exit "$status" --argjson live "$live" --argjson listeners "$listeners" --argjson home "$home_remaining" --argjson fifo "$fifo_remaining" --argjson temp "$temp_remaining" --argjson sanitized "$sanitized" \
    '{remaining:{processes:$live,listeners:$listeners,isolated_homes:$home,fifos:$fifo,evidence_temp_files:$temp},checks:{processes_exited:($live==0),ports_free:($listeners==0),home_removed:($home==0),fifos_removed:($fifo==0),evidence_temps_removed:($temp==0),sanitized:$sanitized},exit:$exit}' >"$E/cleanup.json"
  manifest_tmp="$(mktemp -t burnguard-task7-manifest.XXXXXX)"
  find "$E" -type f ! -name manifest.json ! -name cookies -print0 | LC_ALL=C sort -z | while IFS= read -r -d '' file; do relative="${file#$E/}"; case "$relative" in *.source|*.html|*.css) class=artifact_bytes;; *.headers|*.status|requests.log) class=http;; *sse*) class=event_stream;; *operation*|*receipt*|events.json|cleanup.json) class=receipt;; source-*) class=source_identity;; *.exit) class=gate;; *.log|*.stderr|*.raw) class=runtime_log;; *) class=evidence;; esac; jq -nc --arg path "$relative" --arg class "$class" --arg sha "$(shasum -a 256 "$file" | awk '{print $1}')" --argjson size "$(stat -f %z "$file")" '{path:$path,class:$class,size:$size,sha256:$sha}' >>"$manifest_tmp"; done
  entries="$(jq -s . "$manifest_tmp")"; rm -f "$manifest_tmp"; mutations='{}'; [ ! -f "$E/operations.json" ] || mutations="$(jq '{total:length,committed:map(select(.status=="committed"))|length,recovered:map(select(.status=="recovered"))|length,conflicted:map(select(.status=="conflicted"))|length,cancelled:map(select(.status=="cancelled"))|length}' "$E/operations.json")"
  http_ok=false; [ ! -f "$E/qa-receipt.json" ] || http_ok="$(jq -r '.ok' "$E/qa-receipt.json")"; source_identity='{}'; [ ! -f "$E/source-identity.json" ] || source_identity="$(cat "$E/source-identity.json")"
  jq -n --argjson http "$http_ok" --argjson cleanup "$([ "$status" -eq 0 ] && echo true || echo false)" "${gate_args[@]}" --argjson entries "$entries" --argjson mutations "$mutations" --argjson source "$source_identity" '{schema_version:1,gates:{http:$http,cleanup:$cleanup,exact_acceptance:$exact_acceptance,affected_tests:$affected_tests,full_attribution:$full_attribution,typecheck:$typecheck,build:$build,diff_check:$diff_check,static_scan:$static_scan},observations:{full_process_exit:$full_process_exit},source_identity:$source,mutations:$mutations,files:$entries,checks:{all_files_hashed:($entries|all(.sha256|test("^[0-9a-f]{64}$"))),all_sizes_nonnegative:($entries|all(.size>=0)),all_classified:($entries|all(.class|length>0))}} | .ok=([.gates[],.checks[]]|all)' >"$E/manifest.json"
  exit "$status"
}
trap cleanup EXIT INT TERM

start_backend() {
  fault_id="${1:-}"; rm -f "$READY"; mkfifo "$READY"; touch "$LOG"
  (tail -n 0 -F "$LOG" | awk -v expected="[burnguard] listening on $BASE" '$0==expected {print "ready";fflush();exit}') >"$READY" & watcher=$!; WATCH_PIDS+=("$watcher")
  runtime_env=(); [ -z "$fault_id" ] || runtime_env+=(BG_ARTIFACT_QA=1 BG_ARTIFACT_FAULT_OPERATION_ID="$fault_id"); [ -z "$TURN_BARRIER" ] || runtime_env+=(BG_ARTIFACT_QA=1 BG_ARTIFACT_TURN_OPERATION_ID="$TURN_OP_SCOPE" BG_ARTIFACT_TURN_BARRIER="$TURN_BARRIER")
  env ${runtime_env[@]+"${runtime_env[@]}"} BG_NO_OPEN=1 HOME="$QA_HOME" CODEX_HOME="$REAL_HOME/.codex" BG_PORT="$PORT" bun packages/backend/src/index.ts >>"$LOG" 2>&1 &
  BG_PID=$!; OWNED_PIDS+=("$BG_PID")
  if ! IFS= read -r -t 60 ready <"$READY" || [ "$ready" != ready ]; then echo readiness_failed >&2; exit 1; fi
  kill -0 "$BG_PID"; rm -f "$READY"
  bootstrap="$(curl -sS -c "$COOKIE" -H "Origin: $ORIGIN" "$BASE/api/bootstrap")"; CAP="$(printf '%s' "$bootstrap" | jq -er '.data.capability')"
  printf '%s' "$bootstrap" | jq 'del(.data.capability)' >"$E/bootstrap.json"
}
request() {
  name="$1" method="$2" route="$3" payload="$4" expected="$5"; shift 5; out="$E/$name.response.json"
  args=(-sS --connect-timeout 5 --max-time 45 -o "$out" -w '%{http_code}' -b "$COOKIE" -H "Origin: $ORIGIN" -H "x-burnguard-capability: $CAP" -X "$method" "$@")
  if [ -n "$payload" ]; then args+=(-H 'content-type: application/json' --data-binary "@$payload"); fi
  status="$(curl "${args[@]}" "$BASE$route")"; printf '%s\n' "$status" >"$E/$name.status"; printf '%s %s -> %s\n' "$method" "$route" "$status" >>"$E/requests.log"; [ "$status" = "$expected" ]
}
db_json() { HOME="$QA_HOME" bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(JSON.stringify(d.query(process.argv[2]).all()))' "$DB" "$1"; }
db_value() { HOME="$QA_HOME" bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);const r=d.query(process.argv[2]).get(process.argv[3]);console.log(r[process.argv[4]])' "$DB" "$1" "$2" "$3"; }
predicate() { if "$@" >/dev/null 2>&1; then printf '%s\n' true; else printf '%s\n' false; fi; }
json_predicate() { if jq -e "$@" >/dev/null 2>&1; then printf '%s\n' true; else printf '%s\n' false; fi; }
build_receipt() {
  proofs_file="$1"; output_file="$2"
  jq -n --slurpfile proofs "$proofs_file" --arg project "$PROJECT_ID" --arg patch "$OP_PATCH" --arg turn "$TURN_OP" --arg normal_turn "$NORMAL_OP" --arg crash "$CRASH_OP" --arg restore "$RESTORE_OP" --arg final "$FINAL_DIGEST" --argjson events "$seq_count" \
    '{project_id:$project,operations:{patch:$patch,turn:$turn,normal_turn:$normal_turn,crash:$crash,restore:$restore},proofs:$proofs[0],event_count:$events,final_digest:$final} | .ok=(.proofs|to_entries|all(.value==true))' >"$output_file"
}
start_sse() {
  cursor="${1:-0}"; expected_token="${2:-}"; stop_sse; : >"$E/sse.headers"; : >"$E/sse.log"; [ -z "$expected_token" ] || arm_sse "$expected_token"; fifo="$E/sse-header.fifo"; rm -f "$fifo"; mkfifo "$fifo"
  (tail -n 0 -F "$E/sse.headers" | awk '/^HTTP\//{print;fflush();exit}') >"$fifo" & watcher=$!; WATCH_PIDS+=("$watcher")
  curl -sS --connect-timeout 5 --max-time 120 -N -D "$E/sse.headers" -b "$COOKIE" -H "Origin: $ORIGIN" -H "x-burnguard-capability: $CAP" -H "Last-Event-ID: $cursor" "$BASE/api/sessions/$SESSION_ID/stream" >"$E/sse.log" & SSE_PID=$!; OWNED_PIDS+=("$SSE_PID")
  IFS= read -r -t 20 header <"$fifo"; printf '%s\n' "$header" | rg ' 200 ' >/dev/null; rm -f "$fifo"
}
arm_sse() {
  token="$1"; fifo="$E/sse-event.fifo"; ready="$E/sse-arm-ready.fifo"; rm -f "$fifo" "$ready"; mkfifo "$fifo" "$ready"
  (tail -n 0 -F "$E/sse.log" | awk -v token="$token" -v ready="$ready" -v fifo="$fifo" 'BEGIN{print "ready" > ready;close(ready)} index($0,token){print $0 > fifo;close(fifo);exit}') >/dev/null & ARMED_PID=$!; WATCH_PIDS+=("$ARMED_PID")
  IFS= read -r -t 10 armed <"$ready"; [ "$armed" = ready ]; rm -f "$ready"
}
await_sse() { timeout_seconds="${1:-30}"; fifo="$E/sse-event.fifo"; IFS= read -r -t "$timeout_seconds" observed <"$fifo"; printf '%s\n' "$observed" >>"$E/sse-observed.log"; rm -f "$fifo"; }
header_value() { awk -v key="$2" 'tolower($1)==tolower(key ":"){gsub("\r","");print $2}' "$1"; }
source_get() {
  name="$1"; node="${2:-}"; route="/api/projects/$PROJECT_ID/fs/index.html"; [ -z "$node" ] || route="$route?node_bg_id=$node"
  curl -sS -D "$E/$name.headers" -o "$E/$name.source" -b "$COOKIE" -H "Origin: $ORIGIN" -H "x-burnguard-capability: $CAP" "$BASE$route"
}

cd "$REPO_ROOT"; bun run scripts/qa/preflight.ts --json >"$E/preflight.json"
git rev-parse HEAD >"$E/source-head.txt"; git diff --binary | shasum -a 256 | awk '{print $1}' >"$E/source-diff.sha256"
git -c core.quotePath=false ls-files --cached --others --exclude-standard | LC_ALL=C sort -u | while IFS= read -r file; do case "$file" in .omo/*|.debug-journal.md|node_modules/*|*/node_modules/*|dist/*|*/dist/*|coverage/*|*/coverage/*) ;; *) printf '%s\n' "$file";; esac; done >"$E/source-product.paths"
while IFS= read -r file; do printf '%s\0%s\0%s\0' "$file" "$(stat -f %z "$file")" "$(shasum -a 256 "$file" | awk '{print $1}')"; done <"$E/source-product.paths" | shasum -a 256 | awk '{print $1}' >"$E/source-product.sha256"
printf '%s\n' 'all tracked and unignored workspace files in LC_ALL=C bytewise path order; excludes only .omo control/evidence, .debug-journal.md, dependency, dist, and coverage trees; digest records path NUL size NUL SHA-256 NUL' >"$E/source-product.algorithm.txt"

TURN_OP_SCOPE="qa-turn-race"; TURN_BARRIER="abort"
start_backend
jq -n '{name:"Task 7 Artifact Recovery",type:"prototype",design_system_id:null,backend_id:"codex"}' >"$E/project.payload.json"
request project POST /api/projects "$E/project.payload.json" 201; PROJECT_ID="$(jq -er '.data.id' "$E/project.response.json")"; SESSION_ID="$(jq -er '.data.session_id' "$E/project.response.json")"; PROJECT_DIR="$(jq -er '.data.dir_path' "$E/project.response.json")"
source_get base; NODE_ID="$(perl -ne 'if(/data-bg-node-id="([^"]+)"/){print $1;exit}' "$E/base.source")"; [ -n "$NODE_ID" ]; source_get identity "$NODE_ID"
REV="$(header_value "$E/identity.headers" x-burnguard-revision)"; DIGEST="$(header_value "$E/identity.headers" x-burnguard-artifact-digest)"; FILE_HASH="$(header_value "$E/identity.headers" x-burnguard-file-hash)"; FINGERPRINT="$(header_value "$E/identity.headers" x-burnguard-node-fingerprint)"
start_sse 0
jq -n --argjson r "$REV" --arg d "$DIGEST" --arg h "$FILE_HASH" --arg n "$NODE_ID" --arg f "$FINGERPRINT" '{expected_revision:$r,expected_artifact_digest:$d,expected_file_hash:$h,node_bg_id:$n,node_fingerprint:$f,text:"Task 7 patched"}' >"$E/patch.payload.json"
arm_sse 'artifact.operation'; request patch PATCH "/api/projects/$PROJECT_ID/fs/index.html" "$E/patch.payload.json" 200; await_sse
OP_PATCH="$(jq -er '.data.operation_id' "$E/patch.response.json")"; PATCH_REV="$(jq -er '.data.result_revision' "$E/patch.response.json")"; PATCH_DIGEST="$(jq -er '.data.result_digest' "$E/patch.response.json")"
request operation GET "/api/projects/$PROJECT_ID/operations/$OP_PATCH" '' 200; jq -e '.data.diff|length==1' "$E/operation.response.json" >/dev/null; source_get patched; rg -F 'Task 7 patched' "$E/patched.source" >/dev/null
request stale-patch PATCH "/api/projects/$PROJECT_ID/fs/index.html" "$E/patch.payload.json" 409
jq -n --argjson r "$PATCH_REV" --arg d "$PATCH_DIGEST" '{rel_path:"index.html",x_pct:10,y_pct:20,body:"anchored",artifact_revision:$r,artifact_digest:$d}' >"$E/comment.payload.json"; request comment POST "/api/projects/$PROJECT_ID/comments" "$E/comment.payload.json" 201; COMMENT_ID="$(jq -er '.data.id' "$E/comment.response.json")"
jq '.artifact_revision=0|.artifact_digest="stale"' "$E/comment.payload.json" >"$E/stale-comment.payload.json"; request stale-comment POST "/api/projects/$PROJECT_ID/comments" "$E/stale-comment.payload.json" 409
request draw PUT "/api/projects/$PROJECT_ID/draws/index.html" '' 200 -H "x-burnguard-revision: $PATCH_REV" -H "if-match: $PATCH_DIGEST" -H 'content-type: image/svg+xml' --data-binary '<svg/>'
request stale-draw PUT "/api/projects/$PROJECT_ID/draws/index.html" '' 409 -H 'x-burnguard-revision: 0' -H 'if-match: stale' -H 'content-type: image/svg+xml' --data-binary '<svg/>'
jq -n --argjson r "$PATCH_REV" --arg d "$PATCH_DIGEST" '{expected_revision:$r,expected_artifact_digest:$d}' >"$E/undo.payload.json"; request undo POST "/api/projects/$PROJECT_ID/operations/$OP_PATCH/undo" "$E/undo.payload.json" 200; UNDO_OP="$(jq -er '.data.operation_id' "$E/undo.response.json")"
UNDO_DIGEST="$(jq -er '.data.result_digest' "$E/undo.response.json")"; [ "$UNDO_DIGEST" = "$DIGEST" ]; source_get undone; cmp "$E/base.source" "$E/undone.source"

arm_sse 'artifact.operation'; printf 'stable css\n' >"$PROJECT_DIR/stable.css"; request external-signal POST "/api/projects/$PROJECT_ID/qa/filesystem-signal" '' 200 -H "x-burnguard-qa-operation: $TURN_OP_SCOPE"; await_sse
EXTERNAL_OP="$(db_value 'SELECT id FROM artifact_operations WHERE project_id=? AND status="committed" ORDER BY created_at DESC LIMIT 1' "$PROJECT_ID" id)"; request external-operation GET "/api/projects/$PROJECT_ID/operations/$EXTERNAL_OP" '' 200; jq -e '.data.diff|length==1 and .[0].path=="stable.css"' "$E/external-operation.response.json" >/dev/null; source_get external-base; EXT_REV="$(header_value "$E/external-base.headers" x-burnguard-revision)"; EXT_DIGEST="$(header_value "$E/external-base.headers" x-burnguard-artifact-digest)"

jq -n '{type:"user.message",text:"Use the shell to append exactly <!-- task-7-real-cli-commit --> to index.html, then finish. You must perform this file edit."}' >"$E/turn.payload.json"
OPS_BEFORE_FAIL="$(db_value 'SELECT COUNT(*) value FROM artifact_operations WHERE project_id=?' "$PROJECT_ID" value)"; ln -s "$E" "$PROJECT_DIR/unsafe-link"; request snapshot-fail-turn POST "/api/sessions/$SESSION_ID/events" "$E/turn.payload.json" 500; rm "$PROJECT_DIR/unsafe-link"; OPS_AFTER_FAIL="$(db_value 'SELECT COUNT(*) value FROM artifact_operations WHERE project_id=?' "$PROJECT_ID" value)"; [ "$OPS_BEFORE_FAIL" = "$OPS_AFTER_FAIL" ]

jq --arg o "$TURN_OP_SCOPE" '.operation_id=$o' "$E/turn.payload.json" >"$E/race-turn.payload.json"; request turn POST "/api/sessions/$SESSION_ID/events" "$E/race-turn.payload.json" 200; TURN_OP="$(jq -er '.data.operation_id' "$E/turn.response.json")"; [ "$TURN_OP" = "$TURN_OP_SCOPE" ]
[ "$(db_value 'SELECT status value FROM artifact_operations WHERE id=?' "$TURN_OP" value)" = working ]; arm_sse '"outcome":"conflicted"'; printf 'racing external\n' >"$PROJECT_DIR/index.html"; request race-signal POST "/api/projects/$PROJECT_ID/qa/filesystem-signal" '' 200 -H "x-burnguard-qa-operation: $TURN_OP_SCOPE"; await_sse; [ "$(db_value 'SELECT status value FROM artifact_operations WHERE id=?' "$TURN_OP" value)" = conflicted ]; request interrupt POST "/api/sessions/$SESSION_ID/interrupt" '' 200; TURN_BARRIER=""; TURN_OP_SCOPE=""
source_get after-race; RACE_DIGEST="$(header_value "$E/after-race.headers" x-burnguard-artifact-digest)"; [ "$RACE_DIGEST" = "$EXT_DIGEST" ]; cmp "$E/undone.source" "$E/after-race.source"

mkdir -p "$PROJECT_DIR/.meta/checkpoints/snapshots/qa-crash"; cp "$PROJECT_DIR/index.html" "$PROJECT_DIR/.meta/checkpoints/snapshots/qa-crash/index.html"; cp "$PROJECT_DIR/stable.css" "$PROJECT_DIR/.meta/checkpoints/snapshots/qa-crash/stable.css"; printf 'crash desired html\n' >"$PROJECT_DIR/.meta/checkpoints/snapshots/qa-crash/index.html"; printf 'crash desired css\n' >"$PROJECT_DIR/.meta/checkpoints/snapshots/qa-crash/stable.css"
BASE_TREE="$(HOME="$QA_HOME" bun -e 'import {inspectCanonicalTree} from "./packages/backend/src/services/canonical-tree-manifest";console.log((await inspectCanonicalTree(process.argv[1])).tree_digest)' "$PROJECT_DIR")"; cp "$PROJECT_DIR/index.html" "$E/pre-crash.index.html"; cp "$PROJECT_DIR/stable.css" "$E/pre-crash.stable.css"
stop_sse; stop_backend; CRASH_OP="qa-crash-operation"; start_backend "$CRASH_OP"
source_get crash-identity; CRASH_REV="$(header_value "$E/crash-identity.headers" x-burnguard-revision)"; CRASH_DIGEST="$(header_value "$E/crash-identity.headers" x-burnguard-artifact-digest)"
jq -n --argjson r "$CRASH_REV" --arg d "$CRASH_DIGEST" --arg o "$CRASH_OP" '{expected_revision:$r,expected_artifact_digest:$d,operation_id:$o}' >"$E/crash-restore.payload.json"
set +e; curl -sS --connect-timeout 5 --max-time 45 -b "$COOKIE" -H "Origin: $ORIGIN" -H "x-burnguard-capability: $CAP" -H 'content-type: application/json' --data-binary "@$E/crash-restore.payload.json" "$BASE/api/projects/$PROJECT_ID/checkpoints/qa-crash/restore" >"$E/crash.response.raw" 2>"$E/crash.curl.stderr"; crash_curl=$?; set -e
printf '%s\n' "$crash_curl" >"$E/crash.curl.exit"; if kill -0 "$BG_PID" 2>/dev/null; then echo crash_fault_did_not_kill >&2; exit 1; fi; wait "$BG_PID" 2>/dev/null || true; BG_PID=""
start_backend; source_get recovered; RECOVERED_DIGEST="$(header_value "$E/recovered.headers" x-burnguard-artifact-digest)"; [ "$RECOVERED_DIGEST" = "$BASE_TREE" ]; cmp "$E/pre-crash.index.html" "$PROJECT_DIR/index.html"; cmp "$E/pre-crash.stable.css" "$PROJECT_DIR/stable.css"
db_json "SELECT id,status,base_revision,base_digest,result_revision,result_digest,diff_json,retention_json,replay_json FROM artifact_operations WHERE project_id='$PROJECT_ID' ORDER BY created_at,id" | jq -S . >"$E/operations-after-recovery.json"; jq -e --arg id "$CRASH_OP" '[.[]|select(.id==$id and .status=="recovered")]|length==1' "$E/operations-after-recovery.json" >/dev/null
jq -n --argjson r "$CRASH_REV" --arg d "$CRASH_DIGEST" '{expected_revision:$r,expected_artifact_digest:$d}' >"$E/restore-success.payload.json"; request restore-success POST "/api/projects/$PROJECT_ID/checkpoints/qa-crash/restore" "$E/restore-success.payload.json" 200; RESTORE_OP="$(jq -er '.data.operation_id' "$E/restore-success.response.json")"; RESTORE_REV="$(jq -er '.data.result_revision' "$E/restore-success.response.json")"; RESTORE_DIGEST="$(jq -er '.data.result_digest' "$E/restore-success.response.json")"; rg -F 'crash desired html' "$PROJECT_DIR/index.html" >/dev/null
jq -n --argjson r "$RESTORE_REV" --arg d "$RESTORE_DIGEST" '{expected_revision:$r,expected_artifact_digest:$d}' >"$E/restore-undo.payload.json"; request restore-undo POST "/api/projects/$PROJECT_ID/operations/$RESTORE_OP/undo" "$E/restore-undo.payload.json" 200; RESTORE_UNDO_OP="$(jq -er '.data.operation_id' "$E/restore-undo.response.json")"; RESTORE_UNDO_DIGEST="$(jq -er '.data.result_digest' "$E/restore-undo.response.json")"; [ "$RESTORE_UNDO_DIGEST" = "$BASE_TREE" ]; cmp "$E/pre-crash.index.html" "$PROJECT_DIR/index.html"; cmp "$E/pre-crash.stable.css" "$PROJECT_DIR/stable.css"
source_get before-normal-turn; NORMAL_BASE="$(header_value "$E/before-normal-turn.headers" x-burnguard-artifact-digest)"; NORMAL_REV="$(header_value "$E/before-normal-turn.headers" x-burnguard-revision)"; NORMAL_CURSOR="$(db_value 'SELECT COALESCE(MAX(sequence),0) value FROM events WHERE session_id=?' "$SESSION_ID" value)"; start_sse "$NORMAL_CURSOR"; arm_sse 'artifact.operation'; request normal-turn POST "/api/sessions/$SESSION_ID/events" "$E/turn.payload.json" 200; NORMAL_OP="$(jq -er '.data.operation_id' "$E/normal-turn.response.json")"; await_sse 120; source_get after-normal-turn; NORMAL_RESULT="$(header_value "$E/after-normal-turn.headers" x-burnguard-artifact-digest)"; NORMAL_RESULT_REV="$(header_value "$E/after-normal-turn.headers" x-burnguard-revision)"; [ "$NORMAL_RESULT" != "$NORMAL_BASE" ]; [ "$NORMAL_RESULT_REV" -eq "$((NORMAL_REV+1))" ]; rg -F '<!-- task-7-real-cli-commit -->' "$E/after-normal-turn.source" >/dev/null; [ "$(db_value 'SELECT status value FROM artifact_operations WHERE id=?' "$NORMAL_OP" value)" = committed ]; [ "$(db_value 'SELECT json_array_length(diff_json) value FROM artifact_operations WHERE id=?' "$NORMAL_OP" value)" -gt 0 ]; TRACE="$QA_HOME/.burnguard/logs/$SESSION_ID.trace.log"; STAGE_TRACE_COUNT="$(rg -F -c "adapter_stage_dir" "$TRACE")"; [ "$STAGE_TRACE_COUNT" -ge 1 ]; rg -F ".meta/artifact-operations/$NORMAL_OP/stage" "$TRACE" >"$E/adapter-stage-trace.jsonl"

LAST_SEQUENCE="$(db_value 'SELECT COALESCE(MAX(sequence),0) value FROM events WHERE session_id=?' "$SESSION_ID" value)"; HOME="$QA_HOME" bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);const s=process.argv[2],n=Number(process.argv[3]),t=424242;for(let i=1;i<=2;i++){const q=n+i,e={id:`qa-same-${i}`,ts:t,type:"status.running"};d.run("INSERT INTO events(id,session_id,direction,type,payload_json,processed_at,created_at,sequence) VALUES (?,?,\"down\",?,?,?, ?,?)",e.id,s,e.type,JSON.stringify(e),t,t,q)}' "$DB" "$SESSION_ID" "$LAST_SEQUENCE"
request same-ms GET "/api/sessions/$SESSION_ID/events?after_sequence=$LAST_SEQUENCE" '' 200; jq -e --argjson a "$((LAST_SEQUENCE+1))" --argjson b "$((LAST_SEQUENCE+2))" '[.data[].sequence]==[$a,$b]' "$E/same-ms.response.json" >/dev/null
start_sse "$LAST_SEQUENCE" "id: $((LAST_SEQUENCE+2))"; await_sse

request stale-external-undo POST "/api/projects/$PROJECT_ID/operations/$EXTERNAL_OP/undo" "$E/undo.payload.json" 409
request project-detail GET "/api/projects/$PROJECT_ID" '' 200; request operations GET "/api/projects/$PROJECT_ID/operations" '' 200; request reopened-operation GET "/api/projects/$PROJECT_ID/operations/$OP_PATCH" '' 200; source_get final-source

stop_sse; db_json "SELECT id,status,base_revision,base_digest,result_revision,result_digest,diff_json,retention_json,replay_json FROM artifact_operations WHERE project_id='$PROJECT_ID' ORDER BY created_at,id" | jq -S . >"$E/operations.json"; db_json "SELECT sequence,type,payload_json FROM events WHERE session_id='$SESSION_ID' ORDER BY sequence" | jq -S . >"$E/events.json"
seq_count="$(jq 'length' "$E/events.json")"; seq_unique="$(jq '[.[].sequence]|unique|length' "$E/events.json")"; [ "$seq_count" = "$seq_unique" ]; grep '^id:' "$E/sse.log" | tr -d '\r' >"$E/sse.ids"; [ "$(sort "$E/sse.ids" | uniq -d | wc -l | tr -d ' ')" = 0 ]
source_get final-identity; FINAL_DIGEST="$(header_value "$E/final-identity.headers" x-burnguard-artifact-digest)"
db_json "SELECT id,artifact_revision,artifact_digest FROM comments WHERE id='$COMMENT_ID'" | jq -S . >"$E/comment-anchor-row.json"
PATCH_COMMITTED="$(json_predicate --arg id "$OP_PATCH" --argjson rev "$PATCH_REV" --arg digest "$PATCH_DIGEST" '.[]|select(.id==$id and .status=="committed" and .result_revision==$rev and .result_digest==$digest and (.diff_json|fromjson|length)>0)' "$E/operations.json")"
STALE_PATCH_REJECTED="$(predicate test "$(cat "$E/stale-patch.status")" = 409)"
UNDO_NEW_COMMIT="$(json_predicate --arg id "$UNDO_OP" --arg parent "$OP_PATCH" --arg digest "$DIGEST" '.[]|select(.id==$id and .status=="committed" and .result_digest==$digest and (.replay_json|fromjson|.parent_operation_id)==$parent)' "$E/operations.json")"
UNDO_EXACT_BASE="$(predicate test "$UNDO_DIGEST" = "$DIGEST")"
COMMENT_ANCHOR="$(json_predicate --arg id "$COMMENT_ID" --argjson rev "$PATCH_REV" --arg digest "$PATCH_DIGEST" 'length==1 and .[0].id==$id and .[0].artifact_revision==$rev and .[0].artifact_digest==$digest' "$E/comment-anchor-row.json")"
DRAW_ANCHOR="$(json_predicate --argjson rev "$PATCH_REV" --arg digest "$PATCH_DIGEST" '.data.anchor.artifact_revision==$rev and .data.anchor.artifact_digest==$digest and .data.bytes>0' "$E/draw.response.json")"
RESTORE_COMMITTED="$(json_predicate --arg id "$RESTORE_OP" --argjson rev "$RESTORE_REV" --arg digest "$RESTORE_DIGEST" '.[]|select(.id==$id and .status=="committed" and .result_revision==$rev and .result_digest==$digest and (.diff_json|fromjson|length)>0)' "$E/operations.json")"
RESTORE_UNDO_EXACT="$(json_predicate --arg id "$RESTORE_UNDO_OP" --arg parent "$RESTORE_OP" --arg digest "$BASE_TREE" '.[]|select(.id==$id and .status=="committed" and .result_digest==$digest and (.replay_json|fromjson|.parent_operation_id)==$parent)' "$E/operations.json")"
EXTERNAL_ACCOUNTED="$(json_predicate --arg id "$EXTERNAL_OP" --arg digest "$EXT_DIGEST" '.[]|select(.id==$id and .status=="committed" and .result_digest==$digest and (.diff_json|fromjson|length)==1)' "$E/operations.json")"
EXTERNAL_RACE_CONFLICTED="$(json_predicate --arg id "$TURN_OP" '.[]|select(.id==$id and .status=="conflicted")' "$E/operations.json")"
CANCEL_STABLE="$(predicate test "$RACE_DIGEST" = "$EXT_DIGEST")"
SNAPSHOT_FAILURE_PREVENTED="$(jq -n --arg status "$(cat "$E/snapshot-fail-turn.status")" --argjson before "$OPS_BEFORE_FAIL" --argjson after "$OPS_AFTER_FAIL" '$status=="500" and $before==$after')"
CRASH_RECOVERED="$(json_predicate --arg id "$CRASH_OP" --arg digest "$BASE_TREE" '.[]|select(.id==$id and .status=="recovered" and .base_digest==$digest and .result_digest==null)' "$E/operations.json")"
ADAPTER_COMMITTED="$(json_predicate --arg id "$NORMAL_OP" --arg base "$NORMAL_BASE" --arg result "$NORMAL_RESULT" --argjson base_rev "$NORMAL_REV" '.[]|select(.id==$id and .status=="committed" and .base_digest==$base and .result_digest==$result and .result_revision==($base_rev+1) and (.diff_json|fromjson|length)>0)' "$E/operations.json")"
ADAPTER_STAGE="$(predicate rg -F ".meta/artifact-operations/$NORMAL_OP/stage" "$E/adapter-stage-trace.jsonl")"
SAME_MS_SEQUENCE="$(json_predicate --argjson a "$((LAST_SEQUENCE+1))" --argjson b "$((LAST_SEQUENCE+2))" '[.data[].sequence]==[$a,$b]' "$E/same-ms.response.json")"
SSE_RECONNECT="$(predicate grep -Fx "id: $((LAST_SEQUENCE+2))" "$E/sse.ids")"
SEQUENCE_UNIQUE="$(jq -n --argjson count "$seq_count" --argjson unique "$seq_unique" '$count==$unique')"
jq -n --argjson patch "$PATCH_COMMITTED" --argjson stage "$ADAPTER_STAGE" --argjson adapter "$ADAPTER_COMMITTED" --argjson stale "$STALE_PATCH_REJECTED" --argjson undo "$UNDO_NEW_COMMIT" --argjson undo_exact "$UNDO_EXACT_BASE" --argjson restore "$RESTORE_COMMITTED" --argjson restore_undo "$RESTORE_UNDO_EXACT" --argjson external "$EXTERNAL_ACCOUNTED" --argjson race "$EXTERNAL_RACE_CONFLICTED" --argjson stable "$CANCEL_STABLE" --argjson snapshot "$SNAPSHOT_FAILURE_PREVENTED" --argjson crash "$CRASH_RECOVERED" --argjson comment "$COMMENT_ANCHOR" --argjson draw "$DRAW_ANCHOR" --argjson same_ms "$SAME_MS_SEQUENCE" --argjson reconnect "$SSE_RECONNECT" --argjson unique "$SEQUENCE_UNIQUE" \
  '{patch_committed:$patch,adapter_used_owned_stage:$stage,adapter_committed_exact_diff:$adapter,stale_patch_rejected:$stale,undo_new_commit:$undo,undo_exact_base_digest:$undo_exact,checkpoint_restore_committed:$restore,restore_undo_exact_digest:$restore_undo,external_accounted:$external,external_race_conflicted:$race,cancel_stable_digest:$stable,snapshot_failure_prevented_operation:$snapshot,crash_recovered:$crash,comment_anchor:$comment,draw_anchor:$draw,same_ms_sequence:$same_ms,sse_reconnect:$reconnect,sequence_unique:$unique}' >"$E/qa-proofs.json"
jq '.patch_committed=false' "$E/qa-proofs.json" >"$E/qa-proofs-deliberately-false.json"; build_receipt "$E/qa-proofs-deliberately-false.json" "$E/qa-receipt-self-test.json"; jq -e '.ok==false' "$E/qa-receipt-self-test.json" >/dev/null; rm "$E/qa-proofs-deliberately-false.json" "$E/qa-receipt-self-test.json"
build_receipt "$E/qa-proofs.json" "$E/qa-receipt.json"; jq -e '.ok==true' "$E/qa-receipt.json" >/dev/null
jq -n --arg head "$(cat "$E/source-head.txt")" --arg diff "$(cat "$E/source-diff.sha256")" --arg product "$(cat "$E/source-product.sha256")" --arg algorithm "$(cat "$E/source-product.algorithm.txt")" --argjson count "$(wc -l <"$E/source-product.paths" | tr -d ' ')" '{head:$head,diff_sha256:$diff,canonical_product:{sha256:$product,included_file_count:$count,algorithm:$algorithm,path_list:"source-product.paths"}}' >"$E/source-identity.json"
jq -n --argjson tests "$(jq -r '.ok' "$E/qa-receipt.json")" --arg source "$(cat "$E/source-product.sha256")" '{schema_version:1,gates:{http:$tests},source_identity:$source,artifacts:["qa-receipt.json","operations.json","events.json","sse.log","requests.log","cleanup.json"],ok:$tests}' >"$E/manifest.json"
