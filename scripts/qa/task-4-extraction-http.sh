#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
E="${E:?E must be the ignored task-4 evidence directory}"
PORT="${BG_PORT:-14079}"
BASE="http://127.0.0.1:${PORT}"
ORIGIN="$BASE"
REAL_HOME="$HOME"
mkdir -p "$E"
E="$(cd "$E" && pwd)"
QA_HOME="$(mktemp -d "$E/qa-home.XXXXXX")"
READY_FIFO="$E/readiness.fifo"
LINE_FIFO="$E/backend-lines.fifo"
ADAPTER_READY_FIFO="$E/adapter-ready.fifo"
ADAPTER_ABORT_FIFO="$E/adapter-abort.fifo"
BACKEND_LOG="$E/backend.log"
ADAPTER_LOG="$E/adapter.log"
ADAPTER_EVENTS="$E/adapter-events.jsonl"
REQUEST_LOG="$E/http-requests.log"
COOKIE_JAR="$E/cookies"
TEMP_MARKER="$E/temp-start.marker"
BG_PID=""
WATCH_PID=""
TAIL_PID=""
ADAPTER_PID=""
ADAPTER_PORT=""
ADAPTER_SECRET="$(openssl rand -hex 32)"
touch "$TEMP_MARKER"

cleanup() {
  status=$?
  backend_children=""
  if [ -n "$BG_PID" ]; then backend_children="$(pgrep -P "$BG_PID" 2>/dev/null || true)"; fi
  for pid in "$BG_PID" "$WATCH_PID" "$TAIL_PID" "$ADAPTER_PID"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null || true; fi
    if [ -n "$pid" ]; then wait "$pid" 2>/dev/null || true; fi
  done
  rm -f "$READY_FIFO" "$LINE_FIFO" "$ADAPTER_READY_FIFO" "$ADAPTER_ABORT_FIFO" "$COOKIE_JAR" "$E"/*.payload.json
  QA_HOME_VALUE="$QA_HOME" REPO_ROOT_VALUE="$REPO_ROOT" find "$E" -type f -exec perl -pi -e 's/\Q$ENV{QA_HOME_VALUE}\E/<qa-home>/g; s/\Q$ENV{REPO_ROOT_VALUE}\E/<repo>/g' {} +
  rm -rf "$QA_HOME"

  backend_exited=true
  adapter_exited=true
  if [ -n "$BG_PID" ] && kill -0 "$BG_PID" 2>/dev/null; then backend_exited=false; fi
  if [ -n "$ADAPTER_PID" ] && kill -0 "$ADAPTER_PID" 2>/dev/null; then adapter_exited=false; fi
  workers_exited=true
  for pid in $backend_children; do if kill -0 "$pid" 2>/dev/null; then workers_exited=false; fi; done
  backend_port_free=true
  adapter_port_free=true
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then backend_port_free=false; fi
  if [ -n "$ADAPTER_PORT" ] && lsof -nP -iTCP:"$ADAPTER_PORT" -sTCP:LISTEN >/dev/null 2>&1; then adapter_port_free=false; fi
  home_removed=true
  fifos_removed=true
  managed_state_removed=true
  temp_dirs_removed=true
  if [ -e "$QA_HOME" ]; then home_removed=false; fi
  if [ -e "$READY_FIFO" ] || [ -e "$LINE_FIFO" ] || [ -e "$ADAPTER_READY_FIFO" ] || [ -e "$ADAPTER_ABORT_FIFO" ]; then fifos_removed=false; fi
  if [ -e "$QA_HOME/.burnguard/burnguard.db" ] || [ -e "$QA_HOME/.burnguard/data/systems" ]; then managed_state_removed=false; fi
  if find "${TMPDIR:-/tmp}" -maxdepth 1 -type d -name 'burnguard-ds-extract-*' -newer "$TEMP_MARKER" -print | grep . >/dev/null; then temp_dirs_removed=false; fi
  jq -n --argjson exit "$status" --argjson backend_exited "$backend_exited" --argjson adapter_exited "$adapter_exited" \
    --argjson workers_exited "$workers_exited" --argjson backend_port_free "$backend_port_free" --argjson adapter_port_free "$adapter_port_free" \
    --argjson home_removed "$home_removed" --argjson fifos_removed "$fifos_removed" --argjson managed_state_removed "$managed_state_removed" --argjson temp_dirs_removed "$temp_dirs_removed" \
    '{processes:{backend:{exited:$backend_exited},adapter:{exited:$adapter_exited},workers:{exited:$workers_exited}},ports:{backend_free:$backend_port_free,adapter_free:$adapter_port_free},browser:{status:"not_applicable",launched:false},home:{removed:$home_removed},fifos:{removed:$fifos_removed},managed_state:{removed:$managed_state_removed},temporary_extraction_directories:{removed:$temp_dirs_removed},idempotent:($backend_exited and $adapter_exited and $workers_exited and $backend_port_free and $adapter_port_free and $home_removed and $fifos_removed and $managed_state_removed and $temp_dirs_removed),exit:$exit}' >"$E/cleanup.json"
  exit "$status"
}
trap cleanup EXIT INT TERM

cd "$REPO_ROOT"
bun run scripts/qa/preflight.ts --json >"$E/preflight.json"
rm -f "$READY_FIFO" "$LINE_FIFO" "$ADAPTER_READY_FIFO" "$ADAPTER_ABORT_FIFO"
mkfifo "$READY_FIFO" "$LINE_FIFO" "$ADAPTER_READY_FIFO" "$ADAPTER_ABORT_FIFO"
touch "$ADAPTER_LOG" "$ADAPTER_EVENTS" "$BACKEND_LOG"
BG_QA_ADAPTER_SECRET="$ADAPTER_SECRET" BG_QA_ADAPTER_EVENTS="$ADAPTER_EVENTS" \
BG_QA_ADAPTER_READY_FIFO="$ADAPTER_READY_FIFO" BG_QA_ADAPTER_ABORT_FIFO="$ADAPTER_ABORT_FIFO" \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/qa/extraction-stall-server.ts >"$ADAPTER_LOG" 2>&1 &
ADAPTER_PID=$!
if ! IFS= read -r -t 30 adapter_ready <"$ADAPTER_READY_FIFO"; then printf 'adapter_readiness_failed\n' >&2; exit 1; fi
ADAPTER_PORT="$(printf '%s' "$adapter_ready" | jq -er '.port')"
SOURCE_URL="http://127.0.0.1:${ADAPTER_PORT}/source"
STALL_URL="http://127.0.0.1:${ADAPTER_PORT}/stall"
RESOURCE_URLS="$SOURCE_URL,$STALL_URL,http://127.0.0.1:${ADAPTER_PORT}/styles.css,http://127.0.0.1:${ADAPTER_PORT}/brand-logo.svg"
kill -0 "$ADAPTER_PID"

tail -n 0 -F "$BACKEND_LOG" >"$LINE_FIFO" &
TAIL_PID=$!
awk -v expected="[burnguard] listening on $BASE" '$0 == expected { print "ready"; fflush(); exit }' <"$LINE_FIFO" >"$READY_FIFO" &
WATCH_PID=$!
BG_NO_OPEN=1 HOME="$QA_HOME" CODEX_HOME="$REAL_HOME/.codex" BG_PORT="$PORT" \
BG_EXTRACTION_QA_ADAPTER_SOURCE_URL="$SOURCE_URL" BG_EXTRACTION_QA_ADAPTER_STALL_URL="$STALL_URL" \
BG_EXTRACTION_QA_ADAPTER_RESOURCE_URLS="$RESOURCE_URLS" BG_EXTRACTION_QA_ADAPTER_SECRET="$ADAPTER_SECRET" \
BG_EXTRACTION_TIMEOUT_MS="10000" BG_EXTRACTION_QA_STALL_TIMEOUT_MS="1000" \
BG_EXTRACTION_FAULT_AFTER_PUBLISH_ID="task-4-fault" \
  bun packages/backend/src/index.ts >"$BACKEND_LOG" 2>&1 &
BG_PID=$!
if ! IFS= read -r -t 60 ready <"$READY_FIFO" || [ "$ready" != "ready" ]; then printf 'readiness_failed\n' >&2; exit 1; fi
kill -0 "$BG_PID"

RAW_HEADERS="$QA_HOME/bootstrap.headers.raw"
BOOTSTRAP="$(curl -sS -D "$RAW_HEADERS" -c "$COOKIE_JAR" -H "Origin: $ORIGIN" "$BASE/api/bootstrap")"
CAP="$(printf '%s' "$BOOTSTRAP" | jq -er '.data.capability')"
awk 'BEGIN{IGNORECASE=1} /^set-cookie:/ {print "set-cookie: <redacted>"; next} {print}' "$RAW_HEADERS" >"$E/bootstrap.headers"
printf '%s\n' "$BOOTSTRAP" | jq 'del(.data.capability) | .data.authority_redacted=true' >"$E/bootstrap.json"
printf 'GET /api/bootstrap -> %s\n' "$(awk 'NR==1 {print $2}' "$E/bootstrap.headers")" >"$REQUEST_LOG"

request() {
  name="$1"; payload="$2"; expected="$3"; response="$E/$name.response"
  status="$(curl -sS -o "$response" -w '%{http_code}' -b "$COOKIE_JAR" -H "Origin: $ORIGIN" -H "x-burnguard-capability: $CAP" -H 'content-type: application/json' --data-binary "@$payload" "$BASE/api/design-systems/extract")"
  printf 'POST /api/design-systems/extract [%s] -> %s\n' "$name" "$status" >>"$REQUEST_LOG"
  printf '%s\n' "$status" >"$E/$name.status"
  if [ "$status" != "$expected" ]; then printf '%s expected %s got %s\n' "$name" "$expected" "$status" >&2; return 1; fi
}

jq --arg url "$SOURCE_URL" '.source_url=$url' scripts/qa/fixtures/valid-extraction.json >"$E/valid.payload.json"
request valid "$E/valid.payload.json" 201
jq -e '.data.extraction.provenance.schema_version == 1 and (.data.extraction.provenance.content.entries | length >= 13) and (.data.extraction.provenance.content_digest | test("^[0-9a-f]{64}$")) and any(.data.extraction.provenance.content.entries[]; .domain == "border" and .state == "observed") and any(.data.extraction.provenance.content.entries[]; .key == "fixture-brand-primary" and (.candidates | length) >= 2)' "$E/valid.response" >/dev/null
jq -s -e 'any(.[]; .event == "request" and .path == "/source" and .authorized == true) and any(.[]; .event == "request" and .path == "/styles.css" and .authorized == true) and any(.[]; .event == "request" and .path == "/brand-logo.svg" and .authorized == true)' "$ADAPTER_EVENTS" >/dev/null
DIGEST="$(jq -er '.data.extraction.provenance.content_digest' "$E/valid.response")"
SIDE="$QA_HOME/.burnguard/data/systems/task-4-fixture/extraction-provenance.json"
test "$(jq -er '.content_digest' "$SIDE")" = "$DIGEST"
PARENT_RECEIPT="$(bun -e 'import {Database} from "bun:sqlite"; const db=new Database(process.argv[1]); console.log(db.query("SELECT id FROM design_system_receipts WHERE design_system_id=? AND status=\"committed\"").get("task-4-fixture").id); db.close()' "$QA_HOME/.burnguard/burnguard.db")"
jq --arg receipt "$PARENT_RECEIPT" --arg digest "$DIGEST" '.system_id="task-4-lineage" | .name="Task 4 Lineage" | .lineage={operation:"re-extraction",parent_receipt_id:$receipt,parent_content_digest:$digest,reason:"QA re-extraction",metadata:{source:"task-4"}}' "$E/valid.payload.json" >"$E/lineage.payload.json"
request lineage "$E/lineage.payload.json" 201
jq -e --arg receipt "$PARENT_RECEIPT" '.data.extraction.provenance.lineage.parent_receipt_id == $receipt' "$E/lineage.response" >/dev/null
jq '.system_id="task-4-stale" | .lineage.parent_content_digest="ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"' "$E/lineage.payload.json" >"$E/stale-lineage.payload.json"
request stale-lineage "$E/stale-lineage.payload.json" 400
jq -e '.error.code == "lineage_parent_mismatch"' "$E/stale-lineage.response" >/dev/null
jq -n --arg url "$STALL_URL" '{source_url:$url,source_type:"website",system_id:"task-4-timeout"}' >"$E/timeout.payload.json"
request timeout "$E/timeout.payload.json" 408
jq -e '.error.code == "acquisition_timeout"' "$E/timeout.response" >/dev/null
if ! IFS= read -r -t 10 adapter_abort <"$ADAPTER_ABORT_FIFO"; then printf 'adapter_abort_not_observed\n' >&2; exit 1; fi
printf '%s\n' "$adapter_abort" | jq -e '.event == "client_abort" and .path == "/stall" and .observed == true' >/dev/null

(
  cd "$QA_HOME"
  find .burnguard/data/systems -type f -print0 | sort -z | xargs -0 shasum -a 256
) >"$E/managed-before-invalid.sha256"
printf 'external-sentinel\n' >"$E/external-sentinel"
DB="$QA_HOME/.burnguard/burnguard.db"
bun -e 'import {Database} from "bun:sqlite"; const db=new Database(process.argv[1]); console.log(JSON.stringify(db.query("SELECT d.id,r.status,r.digest FROM design_systems d JOIN design_system_receipts r ON r.design_system_id=d.id WHERE d.id LIKE ? ORDER BY d.id").all("task-4-%"))); db.close()' "$DB" >"$E/db-before-invalid.json"

COUNT_BEFORE_FORGERY="$(jq -s 'map(select(.event == "request")) | length' "$ADAPTER_EVENTS")"
printf '{"source_url":"http://localhost:%s/source","source_type":"website","system_id":"task-4-forged-host"}\n' "$ADAPTER_PORT" >"$E/forged-host.payload.json"
printf '{"source_url":"http://127.0.0.1:1/source","source_type":"website","system_id":"task-4-forged-origin"}\n' >"$E/forged-origin.payload.json"
printf '{"source_url":"http://127.0.0.1:%s/not-allowed","source_type":"website","system_id":"task-4-forged-path"}\n' "$ADAPTER_PORT" >"$E/forged-path.payload.json"
printf '{"source_url":"http://127.0.0.1:%s/source?token=forged","source_type":"website","system_id":"task-4-forged-query"}\n' "$ADAPTER_PORT" >"$E/forged-query.payload.json"
jq '. + {adapter_token:"forged",headers:{"x-burnguard-qa-adapter-secret":"forged"},system_id:"task-4-forged-control"}' "$E/valid.payload.json" >"$E/forged-control.payload.json"
request forged-host "$E/forged-host.payload.json" 400
request forged-origin "$E/forged-origin.payload.json" 400
request forged-path "$E/forged-path.payload.json" 400
request forged-query "$E/forged-query.payload.json" 400
request forged-control "$E/forged-control.payload.json" 400
COUNT_AFTER_FORGERY="$(jq -s 'map(select(.event == "request")) | length' "$ADAPTER_EVENTS")"
test "$COUNT_AFTER_FORGERY" = "$COUNT_BEFORE_FORGERY"

printf '{"source_url":7}\n' >"$E/malformed.payload.json"
printf '{"source_url":"../fixture","source_type":"website","system_id":"task-4-traversal"}\n' >"$E/traversal.payload.json"
printf '{"source_url":"https://user:credential@example.com/design-system","source_type":"website","system_id":"task-4-credential"}\n' >"$E/credential.payload.json"
jq '.system_id="task-4-fault" | .name="Fault"' "$E/valid.payload.json" >"$E/fault.payload.json"
request malformed "$E/malformed.payload.json" 400
request traversal "$E/traversal.payload.json" 400
request credential "$E/credential.payload.json" 400
request fault "$E/fault.payload.json" 500
jq -e '.error.code == "publication_failed"' "$E/fault.response" >/dev/null

(
  cd "$QA_HOME"
  find .burnguard/data/systems -type f -print0 | sort -z | xargs -0 shasum -a 256
) >"$E/managed-after-invalid.sha256"
cmp "$E/managed-before-invalid.sha256" "$E/managed-after-invalid.sha256"
test "$(cat "$E/external-sentinel")" = "external-sentinel"
bun -e 'import {Database} from "bun:sqlite"; const db=new Database(process.argv[1]); console.log(JSON.stringify(db.query("SELECT d.id,r.status,r.digest FROM design_systems d JOIN design_system_receipts r ON r.design_system_id=d.id WHERE d.id LIKE ? ORDER BY d.id").all("task-4-%"))); db.close()' "$DB" >"$E/db-after-invalid.json"
cmp "$E/db-before-invalid.json" "$E/db-after-invalid.json"
test ! -e "$QA_HOME/.burnguard/data/systems/task-4-fault"
if find "$QA_HOME/.burnguard/data/systems" -maxdepth 1 -name '*.staging-*' -print | grep . >/dev/null || find "$QA_HOME/.burnguard/data/systems/.extraction-reservations" -mindepth 1 -print 2>/dev/null | grep . >/dev/null; then printf 'orphan extraction control paths remain\n' >&2; exit 1; fi

rm -f "$COOKIE_JAR" "$E"/*.payload.json
if rg -l -F "$ADAPTER_SECRET" "$E" >/dev/null; then printf 'adapter_secret_in_evidence\n' >&2; exit 1; fi
if rg -li 'x-burnguard-qa-adapter-secret|BG_QA_ADAPTER_SECRET' "$E" >/dev/null; then printf 'adapter_header_in_evidence\n' >&2; exit 1; fi
jq -n --arg digest "$DIGEST" --argjson before "$COUNT_BEFORE_FORGERY" --argjson after "$COUNT_AFTER_FORGERY" \
  '{ok:true,statuses:{valid:201,lineage:201,stale_lineage:400,timeout:408,malformed:400,traversal:400,credential:400,forged_host:400,forged_origin:400,forged_path:400,forged_query:400,forged_control:400,fault:500},provenance_digest:$digest,receipt_status:"committed",managed_nonmutation:true,db_nonmutation:true,sentinel_nonmutation:true,real_adapter:{ready:true,finite_source:true,fixture_backed_html:true,fixture_backed_css:true,linked_css:true,asset:true,client_abort:true,owned:true,request_count_before_forgery:$before,request_count_after_forgery:$after},evidence_sanitized:true}' >"$E/qa-receipt.json"
