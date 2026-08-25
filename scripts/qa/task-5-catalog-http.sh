#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
E="${E:?E must be the ignored task-5 evidence directory}"
PORT="${BG_PORT:-14079}"
BASE="http://127.0.0.1:${PORT}"
ORIGIN="$BASE"
REAL_HOME="$HOME"
mkdir -p "$E"
E="$(cd "$E" && pwd)"
QA_HOME="$(mktemp -d "$E/qa-home.XXXXXX")"
DB="$QA_HOME/.burnguard/burnguard.db"
BACKEND_LOG="$E/backend.log"
ADAPTER_LOG="$E/adapter.log"
ADAPTER_EVENTS="$E/adapter-events.jsonl"
REQUEST_LOG="$E/http-requests.log"
COOKIE_JAR="$E/cookies"
READY_FIFO="$E/readiness.fifo"
LINE_FIFO="$E/backend-lines.fifo"
ADAPTER_READY_FIFO="$E/adapter-ready.fifo"
ADAPTER_ABORT_FIFO="$E/adapter-abort.fifo"
BG_PID=""; WATCH_PID=""; TAIL_PID=""; ADAPTER_PID=""; ADAPTER_PORT=""
OWNED_BACKEND_PIDS=()
ADAPTER_SECRET="$(openssl rand -hex 32)"

cleanup() {
  status=$?
  for pid in "$BG_PID" "$WATCH_PID" "$TAIL_PID" "$ADAPTER_PID"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null || true; fi
    if [ -n "$pid" ]; then wait "$pid" 2>/dev/null || true; fi
  done
  rm -f "$READY_FIFO" "$LINE_FIFO" "$ADAPTER_READY_FIFO" "$ADAPTER_ABORT_FIFO" "$COOKIE_JAR"
  backend_live_count=0
  for pid in "${OWNED_BACKEND_PIDS[@]}"; do if kill -0 "$pid" 2>/dev/null; then backend_live_count=$((backend_live_count + 1)); fi; done
  adapter_live_count=0; if [ -n "$ADAPTER_PID" ] && kill -0 "$ADAPTER_PID" 2>/dev/null; then adapter_live_count=1; fi
  backend_port_count="$({ lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true; } | wc -l | tr -d ' ')"
  adapter_port_count=0; if [ -n "$ADAPTER_PORT" ]; then adapter_port_count="$({ lsof -nP -iTCP:"$ADAPTER_PORT" -sTCP:LISTEN 2>/dev/null || true; } | wc -l | tr -d ' ')"; fi
  fifos_remaining=0; for fifo in "$READY_FIFO" "$LINE_FIFO" "$ADAPTER_READY_FIFO" "$ADAPTER_ABORT_FIFO"; do if [ -e "$fifo" ]; then fifos_remaining=$((fifos_remaining + 1)); fi; done
  rm -rf "$QA_HOME"
  home_remaining=0; if [ -e "$QA_HOME" ]; then home_remaining=1; fi
  managed_remaining=0; if [ -e "$DB" ] || [ -e "$QA_HOME/.burnguard/data/systems" ]; then managed_remaining=1; fi
  QA_HOME_VALUE="$QA_HOME" REPO_ROOT_VALUE="$REPO_ROOT" find "$E" -type f -exec perl -pi -e 's/\Q$ENV{QA_HOME_VALUE}\E/<qa-home>/g; s/\Q$ENV{REPO_ROOT_VALUE}\E/<repo>/g' {} +
  if [ "$backend_live_count" -ne 0 ] || [ "$adapter_live_count" -ne 0 ] || [ "$backend_port_count" -ne 0 ] || [ "$adapter_port_count" -ne 0 ] || [ "$home_remaining" -ne 0 ] || [ "$fifos_remaining" -ne 0 ] || [ "$managed_remaining" -ne 0 ]; then status=1; fi
  jq -n --argjson exit "$status" --argjson backend_live "$backend_live_count" --argjson adapter_live "$adapter_live_count" \
    --argjson backend_ports "$backend_port_count" --argjson adapter_ports "$adapter_port_count" --argjson home_remaining "$home_remaining" \
    --argjson fifos_remaining "$fifos_remaining" --argjson managed_remaining "$managed_remaining" \
    '{processes:{backend:{exited:($backend_live==0),live_count:$backend_live},adapter:{exited:($adapter_live==0),live_count:$adapter_live}},ports:{backend_free:($backend_ports==0),backend_listener_count:$backend_ports,adapter_free:($adapter_ports==0),adapter_listener_count:$adapter_ports},browser:{status:"not_applicable",launched:false},home:{removed:($home_remaining==0),remaining_count:$home_remaining},fifos:{removed:($fifos_remaining==0),remaining_count:$fifos_remaining},managed_state:{removed:($managed_remaining==0),remaining_count:$managed_remaining},idempotent:([$backend_live,$adapter_live,$backend_ports,$adapter_ports,$home_remaining,$fifos_remaining,$managed_remaining] | all(.==0)),exit:$exit}' >"$E/cleanup.json"
  exit "$status"
}
trap cleanup EXIT INT TERM

stop_backend() {
  for pid in "$BG_PID" "$WATCH_PID" "$TAIL_PID"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null || true; fi
    if [ -n "$pid" ]; then wait "$pid" 2>/dev/null || true; fi
  done
  BG_PID=""; WATCH_PID=""; TAIL_PID=""
}

start_backend() {
  rm -f "$READY_FIFO" "$LINE_FIFO"; mkfifo "$READY_FIFO" "$LINE_FIFO"
  touch "$BACKEND_LOG"
  tail -n 0 -F "$BACKEND_LOG" >"$LINE_FIFO" & TAIL_PID=$!
  awk -v expected="[burnguard] listening on $BASE" '$0 == expected { print "ready"; fflush(); exit }' <"$LINE_FIFO" >"$READY_FIFO" & WATCH_PID=$!
  BG_NO_OPEN=1 HOME="$QA_HOME" CODEX_HOME="$REAL_HOME/.codex" BG_PORT="$PORT" \
  BG_EXTRACTION_QA_ADAPTER_SOURCE_URL="$SOURCE_URL" BG_EXTRACTION_QA_ADAPTER_STALL_URL="$STALL_URL" \
  BG_EXTRACTION_QA_ADAPTER_RESOURCE_URLS="$RESOURCE_URLS" BG_EXTRACTION_QA_ADAPTER_SECRET="$ADAPTER_SECRET" \
  BG_CATALOG_FAULT_PREPARED_ID="task-5-prepared" BG_CATALOG_FAULT_DB_AFTER_FS_ID="task-5-db-fault" \
  BG_CATALOG_FAULT_RM_ID="task-5-rm-fault" BG_CATALOG_FAULT_PURGE_DB_ID="task-5-purge-db" \
    bun packages/backend/src/index.ts >>"$BACKEND_LOG" 2>&1 & BG_PID=$!
  OWNED_BACKEND_PIDS+=("$BG_PID")
  if ! IFS= read -r -t 60 ready <"$READY_FIFO" || [ "$ready" != "ready" ]; then echo readiness_failed >&2; exit 1; fi
  kill -0 "$BG_PID"
}

request() {
  name="$1"; method="$2"; route="$3"; payload="$4"; expected="$5"; response="$E/$name.response"
  args=(-sS -o "$response" -w '%{http_code}' -b "$COOKIE_JAR" -H "Origin: $ORIGIN" -H "x-burnguard-capability: $CAP" -X "$method")
  if [ -n "$payload" ]; then args+=(-H 'content-type: application/json' --data-binary "@$payload"); fi
  status="$(curl "${args[@]}" "$BASE$route")"
  printf '%s %s [%s] -> %s\n' "$method" "$route" "$name" "$status" >>"$REQUEST_LOG"
  if [ -n "$payload" ]; then printf 'payload[%s]=' "$name" >>"$REQUEST_LOG"; jq -c . "$payload" >>"$REQUEST_LOG"; fi
  printf 'response[%s]=' "$name" >>"$REQUEST_LOG"; jq -c . "$response" >>"$REQUEST_LOG" 2>/dev/null || printf '<non-json>\n' >>"$REQUEST_LOG"
  printf '%s\n' "$status" >"$E/$name.status"
  if [ "$status" != "$expected" ]; then echo "$name expected $expected got $status" >&2; return 1; fi
}

json_payload() { printf '%s\n' "$2" >"$E/$1.payload.json"; }

cd "$REPO_ROOT"
bun run scripts/qa/preflight.ts --json >"$E/preflight.json"
rm -f "$ADAPTER_READY_FIFO" "$ADAPTER_ABORT_FIFO"; mkfifo "$ADAPTER_READY_FIFO" "$ADAPTER_ABORT_FIFO"
touch "$ADAPTER_LOG" "$ADAPTER_EVENTS" "$BACKEND_LOG"
BG_QA_ADAPTER_SECRET="$ADAPTER_SECRET" BG_QA_ADAPTER_EVENTS="$ADAPTER_EVENTS" BG_QA_ADAPTER_READY_FIFO="$ADAPTER_READY_FIFO" BG_QA_ADAPTER_ABORT_FIFO="$ADAPTER_ABORT_FIFO" \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/qa/extraction-stall-server.ts >"$ADAPTER_LOG" 2>&1 & ADAPTER_PID=$!
if ! IFS= read -r -t 30 adapter_ready <"$ADAPTER_READY_FIFO"; then echo adapter_readiness_failed >&2; exit 1; fi
ADAPTER_PORT="$(printf '%s' "$adapter_ready" | jq -er '.port')"
SOURCE_URL="http://127.0.0.1:${ADAPTER_PORT}/source"; STALL_URL="http://127.0.0.1:${ADAPTER_PORT}/stall"
RESOURCE_URLS="$SOURCE_URL,$STALL_URL,http://127.0.0.1:${ADAPTER_PORT}/styles.css,http://127.0.0.1:${ADAPTER_PORT}/brand-logo.svg"
start_backend

BOOTSTRAP="$(curl -sS -D "$E/bootstrap.headers.raw" -c "$COOKIE_JAR" -H "Origin: $ORIGIN" "$BASE/api/bootstrap")"
CAP="$(printf '%s' "$BOOTSTRAP" | jq -er '.data.capability')"
printf '%s\n' "$BOOTSTRAP" | jq 'del(.data.capability) | .data.authority_redacted=true' >"$E/bootstrap.json"
awk 'BEGIN{IGNORECASE=1} /^set-cookie:/ {print "set-cookie: <redacted>"; next} {print}' "$E/bootstrap.headers.raw" >"$E/bootstrap.headers"
rm -f "$E/bootstrap.headers.raw"

for system in alpha beta; do
  jq --arg url "$SOURCE_URL" --arg id "task-5-$system" --arg name "Task 5 $system" '.source_url=$url | .system_id=$id | .name=$name' scripts/qa/fixtures/valid-extraction.json >"$E/extract-$system.payload.json"
  request "extract-$system" POST /api/design-systems/extract "$E/extract-$system.payload.json" 201
  jq -e --arg id "task-5-$system" '.data.system.id == $id' "$E/extract-$system.response" >/dev/null
done
ALPHA_RECEIPT="$(bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(d.query("SELECT id FROM design_system_receipts WHERE design_system_id=? AND operation=\"content\"").get("task-5-alpha").id)' "$DB")"
ALPHA_DIGEST="$(bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(d.query("SELECT digest FROM design_system_receipts WHERE id=?").get(process.argv[2]).digest)' "$DB" "$ALPHA_RECEIPT")"

bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);d.run("UPDATE design_system_receipts SET digest=? WHERE id=?","not-the-byte-digest",process.argv[2])' "$DB" "$ALPHA_RECEIPT"
bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(JSON.stringify({parent:d.query("SELECT id,lifecycle FROM design_systems WHERE id=\"task-5-alpha\"").get(),receipt:d.query("SELECT id,status,digest FROM design_system_receipts WHERE id=?").get(process.argv[2]),child:d.query("SELECT id FROM design_systems WHERE id=\"task-5-digest-mismatch\"").get()??null}))' "$DB" "$ALPHA_RECEIPT" >"$E/digest-probe-before.json"
( cd "$QA_HOME/.burnguard/data/systems/task-5-alpha" && find . -type f -print0 | sort -z | xargs -0 shasum -a 256 ) >"$E/digest-probe-before.sha256"
json_payload digest-mismatch '{"id":"task-5-digest-mismatch","name":"Digest mismatch"}'
request digest-mismatch POST /api/design-systems/task-5-alpha/duplicate "$E/digest-mismatch.payload.json" 409
jq -e '.error.code == "catalog_digest_mismatch"' "$E/digest-mismatch.response" >/dev/null
bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(JSON.stringify({parent:d.query("SELECT id,lifecycle FROM design_systems WHERE id=\"task-5-alpha\"").get(),receipt:d.query("SELECT id,status,digest FROM design_system_receipts WHERE id=?").get(process.argv[2]),child:d.query("SELECT id FROM design_systems WHERE id=\"task-5-digest-mismatch\"").get()??null}))' "$DB" "$ALPHA_RECEIPT" >"$E/digest-probe-after.json"
( cd "$QA_HOME/.burnguard/data/systems/task-5-alpha" && find . -type f -print0 | sort -z | xargs -0 shasum -a 256 ) >"$E/digest-probe-after.sha256"
cmp -s "$E/digest-probe-before.json" "$E/digest-probe-after.json" && cmp -s "$E/digest-probe-before.sha256" "$E/digest-probe-after.sha256"
bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);d.run("UPDATE design_system_receipts SET digest=? WHERE id=?",process.argv[3],process.argv[2])' "$DB" "$ALPHA_RECEIPT" "$ALPHA_DIGEST"

ALPHA_README="$QA_HOME/.burnguard/data/systems/task-5-alpha/README.md"
README_BEFORE_HASH="$(shasum -a 256 "$ALPHA_README" | awk '{print $1}')"
cp "$ALPHA_README" "$E/readme-restoration.original"
printf '\nactual-byte-mutation\n' >>"$ALPHA_README"
README_MUTATED_HASH="$(shasum -a 256 "$ALPHA_README" | awk '{print $1}')"
bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(JSON.stringify({parent:d.query("SELECT id,lifecycle FROM design_systems WHERE id=\"task-5-alpha\"").get(),receipt_count:d.query("SELECT COUNT(*) count FROM design_system_receipts").get().count,child:d.query("SELECT id FROM design_systems WHERE id=\"task-5-byte-mutation\"").get()??null}))' "$DB" >"$E/byte-mutation-before.json"
json_payload byte-mutation '{"id":"task-5-byte-mutation","name":"Byte mutation"}'
request byte-mutation POST /api/design-systems/task-5-alpha/duplicate "$E/byte-mutation.payload.json" 409
jq -e '.error.code == "catalog_digest_mismatch"' "$E/byte-mutation.response" >/dev/null
bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(JSON.stringify({parent:d.query("SELECT id,lifecycle FROM design_systems WHERE id=\"task-5-alpha\"").get(),receipt_count:d.query("SELECT COUNT(*) count FROM design_system_receipts").get().count,child:d.query("SELECT id FROM design_systems WHERE id=\"task-5-byte-mutation\"").get()??null}))' "$DB" >"$E/byte-mutation-after.json"
cmp -s "$E/byte-mutation-before.json" "$E/byte-mutation-after.json"
cp "$E/readme-restoration.original" "$ALPHA_README"
README_RESTORED_HASH="$(shasum -a 256 "$ALPHA_README" | awk '{print $1}')"
jq -n --arg before "$README_BEFORE_HASH" --arg mutated "$README_MUTATED_HASH" --arg restored "$README_RESTORED_HASH" '{before_sha256:$before,mutated_sha256:$mutated,restored_sha256:$restored,mutation_changed:($before!=$mutated),byte_identical_restoration:($before==$restored)}' >"$E/byte-mutation-restoration.json"
rm "$E/readme-restoration.original"

ALPHA_MANIFEST="$(bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(d.query("SELECT manifest_json manifest FROM design_system_receipts WHERE id=?").get(process.argv[2]).manifest)' "$DB" "$ALPHA_RECEIPT")"
MANIFEST_BEFORE_HASH="$(printf '%s' "$ALPHA_MANIFEST" | shasum -a 256 | awk '{print $1}')"
bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);d.run("UPDATE design_system_receipts SET manifest_json=? WHERE id=?",JSON.stringify({schema_version:1,digest_algorithm:"sha256",tree_digest:"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",files:[],publication_state:"validated"}),process.argv[2])' "$DB" "$ALPHA_RECEIPT"
bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(JSON.stringify({parent:d.query("SELECT id,lifecycle FROM design_systems WHERE id=\"task-5-alpha\"").get(),receipt_count:d.query("SELECT COUNT(*) count FROM design_system_receipts").get().count,child:d.query("SELECT id FROM design_systems WHERE id=\"task-5-manifest-omission\"").get()??null}))' "$DB" >"$E/manifest-omission-before.json"
json_payload manifest-omission '{"id":"task-5-manifest-omission","name":"Manifest omission"}'
request manifest-omission POST /api/design-systems/task-5-alpha/duplicate "$E/manifest-omission.payload.json" 409
jq -e '.error.code == "catalog_digest_mismatch"' "$E/manifest-omission.response" >/dev/null
bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(JSON.stringify({parent:d.query("SELECT id,lifecycle FROM design_systems WHERE id=\"task-5-alpha\"").get(),receipt_count:d.query("SELECT COUNT(*) count FROM design_system_receipts").get().count,child:d.query("SELECT id FROM design_systems WHERE id=\"task-5-manifest-omission\"").get()??null}))' "$DB" >"$E/manifest-omission-after.json"
cmp -s "$E/manifest-omission-before.json" "$E/manifest-omission-after.json"
MANIFEST_MUTATED="$(bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(d.query("SELECT manifest_json manifest FROM design_system_receipts WHERE id=?").get(process.argv[2]).manifest)' "$DB" "$ALPHA_RECEIPT")"
MANIFEST_MUTATED_HASH="$(printf '%s' "$MANIFEST_MUTATED" | shasum -a 256 | awk '{print $1}')"
bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);d.run("UPDATE design_system_receipts SET manifest_json=? WHERE id=?",process.argv[3],process.argv[2])' "$DB" "$ALPHA_RECEIPT" "$ALPHA_MANIFEST"
MANIFEST_RESTORED="$(bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(d.query("SELECT manifest_json manifest FROM design_system_receipts WHERE id=?").get(process.argv[2]).manifest)' "$DB" "$ALPHA_RECEIPT")"
MANIFEST_RESTORED_HASH="$(printf '%s' "$MANIFEST_RESTORED" | shasum -a 256 | awk '{print $1}')"
jq -n --arg before "$MANIFEST_BEFORE_HASH" --arg mutated "$MANIFEST_MUTATED_HASH" --arg restored "$MANIFEST_RESTORED_HASH" '{before_sha256:$before,mutated_sha256:$mutated,restored_sha256:$restored,mutation_changed:($before!=$mutated),byte_identical_restoration:($before==$restored)}' >"$E/manifest-omission-restoration.json"

CONTENT_RECEIPTS_BEFORE_METADATA="$(bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(d.query("SELECT COUNT(*) count FROM design_system_receipts WHERE design_system_id=\"task-5-alpha\" AND operation=\"content\"").get().count)' "$DB")"
json_payload metadata '{"expected_revision":0,"name":"Task 5 Alpha","description":"QA","tags":[" É ","é","BRAND","brand"],"kind":"design-system","provenance":"observed","license":"declared"}'
request metadata PATCH /api/design-systems/task-5-alpha "$E/metadata.payload.json" 200
jq -e '.data.metadata_revision == 1 and .data.tags == ["brand","é"]' "$E/metadata.response" >/dev/null
CONTENT_RECEIPTS_AFTER_METADATA="$(bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(d.query("SELECT COUNT(*) count FROM design_system_receipts WHERE design_system_id=\"task-5-alpha\" AND operation=\"content\"").get().count)' "$DB")"
json_payload stale '{"expected_revision":0,"name":"stale","tags":["stale"]}'
request stale PATCH /api/design-systems/task-5-alpha "$E/stale.payload.json" 412
jq -e '.error.code == "expected_revision_conflict"' "$E/stale.response" >/dev/null
request list GET '/api/design-systems?query=task%205&kind=design-system&owner=local&sort=name&direction=asc' '' 200
jq -e '.data | map(.id) | index("task-5-alpha") != null and index("task-5-beta") != null' "$E/list.response" >/dev/null
request malformed-filter GET '/api/design-systems?kind=wrong&unknown=x' '' 400
json_payload malformed-body '{"expected_revision":"0","tags":7,"unknown":true}'
request malformed-body PATCH /api/design-systems/task-5-alpha "$E/malformed-body.payload.json" 400

json_payload duplicate '{"id":"task-5-duplicate","name":"Task 5 Duplicate"}'
request duplicate POST /api/design-systems/task-5-alpha/duplicate "$E/duplicate.payload.json" 201
jq -e --arg digest "$ALPHA_DIGEST" '.data.content.digest == $digest and .data.lineage.operation == "duplicate"' "$E/duplicate.response" >/dev/null
jq -n --arg id "$ALPHA_RECEIPT" --arg digest "$ALPHA_DIGEST" '{id:"task-5-derived",name:"Task 5 Derived",parent_receipt_id:$id,parent_content_digest:$digest,reason:"QA derive",metadata:{source:"task-5"}}' >"$E/derive.payload.json"
request derive POST /api/design-systems/task-5-alpha/derive "$E/derive.payload.json" 201
jq -e --arg receipt "$ALPHA_RECEIPT" --arg digest "$ALPHA_DIGEST" '.data.lineage.parent_receipt_id == $receipt and .data.lineage.parent_digest == $digest' "$E/derive.response" >/dev/null
json_payload collision '{"id":"task-5-beta","name":"collision"}'
request collision POST /api/design-systems/task-5-alpha/duplicate "$E/collision.payload.json" 409
jq '.parent_content_digest="ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" | .id="task-5-stale-derived"' "$E/derive.payload.json" >"$E/stale-lineage.payload.json"
request stale-lineage POST /api/design-systems/task-5-alpha/derive "$E/stale-lineage.payload.json" 409

json_payload project '{"name":"Task 5 Reference","type":"prototype","design_system_id":"task-5-beta","backend_id":"codex"}'
request project POST /api/projects "$E/project.payload.json" 201
json_payload empty '{}'
request referenced-trash POST /api/design-systems/task-5-beta/trash "$E/empty.payload.json" 409
jq -e '.error.code == "has_active_projects"' "$E/referenced-trash.response" >/dev/null
request trash POST /api/design-systems/task-5-alpha/trash "$E/empty.payload.json" 200
jq -e '.data.lifecycle == "trashed"' "$E/trash.response" >/dev/null
request restore POST /api/design-systems/task-5-alpha/restore "$E/empty.payload.json" 200
jq -e --arg digest "$ALPHA_DIGEST" '.data.id == "task-5-alpha" and .data.lifecycle == "active" and .data.content.digest == $digest' "$E/restore.response" >/dev/null
request duplicate-trash POST /api/design-systems/task-5-duplicate/trash "$E/empty.payload.json" 200
request duplicate-purge DELETE /api/design-systems/task-5-duplicate/purge '' 204

test ! -e "$QA_HOME/.burnguard/data/systems/task-5-duplicate"
for child in prepared db-fault rm-fault purge-db; do
  jq -n --arg id "task-5-$child" --arg name "$child" '{id:$id,name:$name}' >"$E/$child.payload.json"
done
request prepared POST /api/design-systems/task-5-alpha/duplicate "$E/prepared.payload.json" 500
request db-fault POST /api/design-systems/task-5-alpha/duplicate "$E/db-fault.payload.json" 500
request rm-create POST /api/design-systems/task-5-alpha/duplicate "$E/rm-fault.payload.json" 201
request purge-db-create POST /api/design-systems/task-5-alpha/duplicate "$E/purge-db.payload.json" 201
request rm-trash POST /api/design-systems/task-5-rm-fault/trash "$E/empty.payload.json" 200
request rm-purge DELETE /api/design-systems/task-5-rm-fault/purge '' 500
request purge-db-trash POST /api/design-systems/task-5-purge-db/trash "$E/empty.payload.json" 200
request purge-db DELETE /api/design-systems/task-5-purge-db/purge '' 500

printf 'outside-sentinel\n' >"$E/external-sentinel"
ln -s "$E" "$QA_HOME/.burnguard/data/systems/task-5-alpha/escape"
request symlink-read GET /api/design-systems/task-5-alpha/files/escape/external-sentinel '' 404
request symlink-trash POST /api/design-systems/task-5-alpha/trash "$E/empty.payload.json" 409
rm "$QA_HOME/.burnguard/data/systems/task-5-alpha/escape"
request traversal-read GET '/api/design-systems/task-5-alpha/files/%2e%2e/%2e%2e/external-sentinel' '' 404
bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);d.run("UPDATE design_systems SET dir_path=? WHERE id=?",process.argv[2],"task-5-derived")' "$DB" "$E"
request outside-trash POST /api/design-systems/task-5-derived/trash "$E/empty.payload.json" 409
test "$(cat "$E/external-sentinel")" = "outside-sentinel"

stop_backend
start_backend
BOOTSTRAP="$(curl -sS -c "$COOKIE_JAR" -H "Origin: $ORIGIN" "$BASE/api/bootstrap")"; CAP="$(printf '%s' "$BOOTSTRAP" | jq -er '.data.capability')"
request recovered-db GET /api/design-systems/task-5-db-fault '' 200
jq -e '.data.lifecycle == "active" and .data.warning == null' "$E/recovered-db.response" >/dev/null
bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(JSON.stringify({systems:d.query("SELECT id,lifecycle,metadata_revision FROM design_systems WHERE id LIKE \"task-5-%\" ORDER BY id").all(),receipts:d.query("SELECT design_system_id,operation,status,digest FROM design_system_receipts WHERE design_system_id LIKE \"task-5-%\" ORDER BY design_system_id,created_at").all()}))' "$DB" >"$E/db-evidence.json"
(
  cd "$QA_HOME/.burnguard/data/systems"
  find . -type f -print0 | sort -z | xargs -0 shasum -a 256
) >"$E/managed-tree.sha256"
if find "$QA_HOME/.burnguard/data/systems" -maxdepth 1 -name '*.catalog-staging-*' -print | grep . >/dev/null; then echo orphan_staging >&2; exit 1; fi
rm -f "$COOKIE_JAR"
statuses="$(for file in "$E"/*.status; do name="$(basename "$file" .status)"; jq -n --arg key "$name" --argjson value "$(cat "$file")" '{key:$key,value:$value}'; done | jq -s 'from_entries')"
metadata_no_content_receipt=false; if [ "$CONTENT_RECEIPTS_BEFORE_METADATA" = "$CONTENT_RECEIPTS_AFTER_METADATA" ]; then metadata_no_content_receipt=true; fi
lineage_exact=false; if jq -e --arg receipt "$ALPHA_RECEIPT" --arg digest "$ALPHA_DIGEST" '.data.content.digest == $digest and .data.lineage.parent_receipt_id == $receipt and .data.lineage.parent_digest == $digest' "$E/derive.response" >/dev/null; then lineage_exact=true; fi
same_id_restore=false; if jq -e --arg digest "$ALPHA_DIGEST" '.data.id == "task-5-alpha" and .data.lifecycle == "active" and .data.content.digest == $digest' "$E/restore.response" >/dev/null && [ -d "$QA_HOME/.burnguard/data/systems/task-5-alpha" ]; then same_id_restore=true; fi
bytes_first_purge=false; if [ ! -e "$QA_HOME/.burnguard/data/systems/task-5-duplicate" ] && bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);process.exit(d.query("SELECT id FROM design_systems WHERE id=\"task-5-duplicate\"").get()===null?0:1)' "$DB"; then bytes_first_purge=true; fi
startup_reconciliation=false; if jq -e '.data.lifecycle == "active" and .data.warning == null' "$E/recovered-db.response" >/dev/null && bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);process.exit(d.query("SELECT status FROM design_system_receipts WHERE design_system_id=\"task-5-db-fault\" AND operation=\"duplicate\"").get()?.status==="committed"?0:1)' "$DB"; then startup_reconciliation=true; fi
path_containment=false; if [ "$(cat "$E/symlink-read.status")" = 404 ] && [ "$(cat "$E/symlink-trash.status")" = 409 ] && [ "$(cat "$E/traversal-read.status")" = 404 ] && [ "$(cat "$E/outside-trash.status")" = 409 ]; then path_containment=true; fi
outside_root_unchanged=false; if [ "$(cat "$E/external-sentinel")" = "outside-sentinel" ]; then outside_root_unchanged=true; fi
zero_staging_orphans=false; orphan_count="$(find "$QA_HOME/.burnguard/data/systems" -maxdepth 1 -name '*.catalog-staging-*' -print | wc -l | tr -d ' ')"; if [ "$orphan_count" = 0 ]; then zero_staging_orphans=true; fi
digest_mismatch_blocked=false; if [ "$(cat "$E/digest-mismatch.status")" = 409 ] && jq -e '.error.code == "catalog_digest_mismatch"' "$E/digest-mismatch.response" >/dev/null && cmp -s "$E/digest-probe-before.json" "$E/digest-probe-after.json" && cmp -s "$E/digest-probe-before.sha256" "$E/digest-probe-after.sha256"; then digest_mismatch_blocked=true; fi
byte_mutation_blocked=false; if [ "$(cat "$E/byte-mutation.status")" = 409 ] && cmp -s "$E/byte-mutation-before.json" "$E/byte-mutation-after.json" && jq -e '.mutation_changed and .byte_identical_restoration' "$E/byte-mutation-restoration.json" >/dev/null; then byte_mutation_blocked=true; fi
manifest_omission_blocked=false; if [ "$(cat "$E/manifest-omission.status")" = 409 ] && cmp -s "$E/manifest-omission-before.json" "$E/manifest-omission-after.json" && jq -e '.mutation_changed and .byte_identical_restoration' "$E/manifest-omission-restoration.json" >/dev/null; then manifest_omission_blocked=true; fi
QA_HOME_VALUE="$QA_HOME" REPO_ROOT_VALUE="$REPO_ROOT" find "$E" -type f -exec perl -pi -e 's/\Q$ENV{QA_HOME_VALUE}\E/<qa-home>/g; s/\Q$ENV{REPO_ROOT_VALUE}\E/<repo>/g' {} +
evidence_sanitized=false; if ! rg -l -F "$ADAPTER_SECRET" "$E" >/dev/null && ! rg -l -F "$QA_HOME" "$E" >/dev/null && ! rg -l -F "$REPO_ROOT" "$E" >/dev/null; then evidence_sanitized=true; fi
jq -n --argjson statuses "$statuses" --arg digest "$ALPHA_DIGEST" --argjson metadata "$metadata_no_content_receipt" \
  --argjson lineage "$lineage_exact" --argjson restore "$same_id_restore" --argjson purge "$bytes_first_purge" \
  --argjson recovery "$startup_reconciliation" --argjson containment "$path_containment" --argjson sentinel "$outside_root_unchanged" \
  --argjson orphans "$zero_staging_orphans" --argjson sanitized "$evidence_sanitized" --argjson mismatch "$digest_mismatch_blocked" \
  --argjson byte_mutation "$byte_mutation_blocked" --argjson manifest_omission "$manifest_omission_blocked" \
  --argjson orphan_count "$orphan_count" --slurpfile db "$E/db-evidence.json" \
  '{statuses:$statuses,content_digest:$digest,metadata_no_content_receipt:$metadata,lineage_exact:$lineage,same_id_restore:$restore,bytes_first_purge:$purge,startup_reconciliation:$recovery,path_containment:$containment,outside_root_unchanged:$sentinel,zero_staging_orphans:$orphans,evidence_sanitized:$sanitized,digest_mismatch_blocked_without_mutation:$mismatch,actual_byte_mutation_blocked_without_mutation:$byte_mutation,manifest_omission_blocked_without_mutation:$manifest_omission,browser:{status:"not_applicable",launched:false},observations:{orphan_count:$orphan_count,db:$db[0],managed_tree_hashes:"managed-tree.sha256",digest_probe:{before:"digest-probe-before.json",after:"digest-probe-after.json",before_hashes:"digest-probe-before.sha256",after_hashes:"digest-probe-after.sha256"},byte_mutation_restoration:"byte-mutation-restoration.json"}} | .ok=([.metadata_no_content_receipt,.lineage_exact,.same_id_restore,.bytes_first_purge,.startup_reconciliation,.path_containment,.outside_root_unchanged,.zero_staging_orphans,.evidence_sanitized,.digest_mismatch_blocked_without_mutation,.actual_byte_mutation_blocked_without_mutation,.manifest_omission_blocked_without_mutation] | all)' >"$E/qa-receipt.json"
jq -e '.ok and .digest_mismatch_blocked_without_mutation and .actual_byte_mutation_blocked_without_mutation and .manifest_omission_blocked_without_mutation and .browser.status == "not_applicable"' "$E/qa-receipt.json" >/dev/null
