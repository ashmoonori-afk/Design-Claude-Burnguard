#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
E="${E:?E must be the ignored task-8 evidence directory}"
PORT="${BG_PORT:-14088}"; BASE="http://127.0.0.1:$PORT"; ORIGIN="$BASE"; REAL_HOME="$HOME"
mkdir -p "$E"; E="$(cd "$E" && pwd)"; find "$E" -mindepth 1 -maxdepth 1 -exec rm -rf {} +; QA_HOME="$(mktemp -d "/tmp/bg-task8-home-$PORT.XXXXXX")"; QA_TMP="$(mktemp -d "/tmp/bg-task8-$PORT.XXXXXX")"
LOG="$E/backend.log"; COOKIE="$E/cookies"; READY="$E/readiness.fifo"; SSE="$E/export-events.sse"; touch "$QA_TMP/.owned-residue-sentinel"
BG_PID=""; SSE_PID=""; CAP=""; PROJECT_ID=""; SESSION_ID=""; ARMED_PID=""; BARRIER_PID=""; OBSERVER_N=0; EVENT_RESULT=""

stop_pid() {
  local pid="$1"; [ -n "$pid" ] || return 0
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    if ! python3 - "$pid" <<'PY'
import select,sys
pid=int(sys.argv[1]); kq=select.kqueue()
try:
 kq.control([select.kevent(pid,filter=select.KQ_FILTER_PROC,flags=select.KQ_EV_ADD|select.KQ_EV_ONESHOT,fflags=select.KQ_NOTE_EXIT)],1,15)
except ProcessLookupError:
 pass
else:
 events=kq.control(None,1,15)
 if not events: raise SystemExit(1)
finally:
 kq.close()
PY
    then kill -KILL "$pid" 2>/dev/null || true; fi
  fi
  wait "$pid" 2>/dev/null || true
}
cleanup() {
  status=$?; set +e; printf '%s\n' "stop exact pids: $ARMED_PID $BARRIER_PID $SSE_PID $BG_PID" "remove exact roots: $QA_HOME $QA_TMP" "scan exact port: $PORT" >"$E/cleanup-commands.txt"
  stop_pid "$ARMED_PID"; stop_pid "$BARRIER_PID"; stop_pid "$SSE_PID"; stop_pid "$BG_PID"
  crd_before="$({ pgrep -f 'Chrome Remote Desktop' 2>/dev/null || true; } | sort -n | jq -Rsc 'split("\n")|map(select(length>0)|tonumber)')"; before_paths="$(find "$QA_HOME" "$QA_TMP" -mindepth 1 -print 2>/dev/null | jq -Rsc 'split("\n")|map(select(length>0))')"; before_fifos="$(find "$QA_HOME" "$QA_TMP" "$E" -type p 2>/dev/null | wc -l | tr -d ' ')"; before_profiles="$(find "$QA_TMP" -name 'playwright_chromiumdev_profile-*' 2>/dev/null | wc -l | tr -d ' ')"; before_dbs="$(find "$QA_HOME" \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' \) 2>/dev/null | wc -l | tr -d ' ')"; before_stages="$(find "$QA_HOME" -type d \( -name .staging -o -name render \) 2>/dev/null | wc -l | tr -d ' ')"; sentinel_before=0; [ -e "$QA_TMP/.owned-residue-sentinel" ] && sentinel_before=1
  jq -n --argjson crd "$crd_before" --argjson paths "$before_paths" --argjson sentinel "$sentinel_before" --argjson fifos "$before_fifos" --argjson profiles "$before_profiles" --argjson dbs "$before_dbs" --argjson stages "$before_stages" '{unrelated_chrome_remote_desktop_pids:$crd,paths:$paths,sentinel:$sentinel,fifos:$fifos,profiles:$profiles,temp_dbs:$dbs,stage_render_dirs:$stages,ok:($sentinel==0 and ($paths|length)==0)}' >"$E/cleanup-before.json"
  rm -f "$READY" "$COOKIE" "$E"/*.fifo; rm -rf "$QA_HOME" "$QA_TMP"
  home_after=0; [ -e "$QA_HOME" ] && home_after=$((home_after+1)); [ -e "$QA_TMP" ] && home_after=$((home_after+1)); fifo_after="$(find "$E" -type p 2>/dev/null | wc -l | tr -d ' ')"; listener_after="$({ lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true; } | tail -n +2 | wc -l | tr -d ' ')"; process_after=0; for owned in "$ARMED_PID" "$BARRIER_PID" "$SSE_PID" "$BG_PID"; do [ -z "$owned" ] || ! kill -0 "$owned" 2>/dev/null || process_after=$((process_after+1)); done; profile_after="$(find "$QA_TMP" -name 'playwright_chromiumdev_profile-*' 2>/dev/null | wc -l | tr -d ' ')"; crd_after="$({ pgrep -f 'Chrome Remote Desktop' 2>/dev/null || true; } | sort -n | jq -Rsc 'split("\n")|map(select(length>0)|tonumber)')"; sentinel_after=0; [ -e "$QA_TMP/.owned-residue-sentinel" ] && sentinel_after=1
  [ "$home_after" -eq 0 ] || status=1; [ "$fifo_after" -eq 0 ] || status=1; [ "$listener_after" -eq 0 ] || status=1; [ "$process_after" -eq 0 ] || status=1; [ "$profile_after" -eq 0 ] || status=1; [ "$sentinel_before" -eq 1 ] || status=1; [ "$sentinel_after" -eq 0 ] || status=1; [ "$crd_before" = "$crd_after" ] || status=1
  jq -n --argjson crd_before "$crd_before" --argjson crd_after "$crd_after" --argjson before_sentinel "$sentinel_before" --argjson homes "$home_after" --argjson fifos "$fifo_after" --argjson listeners "$listener_after" --argjson processes "$process_after" --argjson profiles "$profile_after" --argjson sentinel "$sentinel_after" --argjson exit "$status" '{unrelated_chrome_remote_desktop:{before:$crd_before,after:$crd_after,preserved:($crd_before==$crd_after)},self_test:{false_before_removal:($before_sentinel==1),true_after_removal:($sentinel==0)},after:{owned_roots:$homes,fifos:$fifos,listeners:$listeners,processes:$processes,profiles:$profiles,sentinel:$sentinel},exit:$exit,ok:($before_sentinel==1 and $homes==0 and $fifos==0 and $listeners==0 and $processes==0 and $profiles==0 and $sentinel==0 and $crd_before==$crd_after and $exit==0)}' >"$E/cleanup.json"
  while IFS= read -r -d '' evidence_file; do case "$(file -b --mime-type "$evidence_file")" in text/*|application/json|application/x-ndjson|application/xml) QA_HOME_VALUE="$QA_HOME" QA_TMP_VALUE="$QA_TMP" REPO_ROOT_VALUE="$REPO_ROOT" REAL_HOME_VALUE="$REAL_HOME" perl -pi -e 's/\Q$ENV{QA_HOME_VALUE}\E/<qa-home>/g; s/\Q$ENV{QA_TMP_VALUE}\E/<qa-tmp>/g; s/\Q$ENV{REPO_ROOT_VALUE}\E/<repo>/g; s/\Q$ENV{REAL_HOME_VALUE}\E/<home>/g' "$evidence_file";; esac; done < <(find "$E" -type f -print0)
  bun "$REPO_ROOT/scripts/qa/task-8-manifest.ts" "$E" || status=1; exit "$status"
}
trap cleanup EXIT INT TERM

cd "$REPO_ROOT"
start_backend() {
  # Export QA does not consume the optional Northvale sample; precreate its
  # destination so bootstrap does not hydrate unrelated File Provider assets.
  mkdir -p "$QA_HOME/.burnguard/data/systems/northvale-capital"
  rm -f "$READY"; mkfifo "$READY"; touch "$LOG"
  (tail -n 0 -F "$LOG" | awk -v expected="[burnguard] listening on $BASE" '$0==expected{print "ready";fflush();exit}') >"$READY" & local ready_pid=$!
  BG_NO_OPEN=1 BG_EXPORT_QA=1 HOME="$QA_HOME" TMPDIR="$QA_TMP" CODEX_HOME="$REAL_HOME/.codex" PLAYWRIGHT_BROWSERS_PATH="$REAL_HOME/Library/Caches/ms-playwright" BG_PORT="$PORT" bun packages/backend/src/index.ts >>"$LOG" 2>&1 & BG_PID=$!
  if ! IFS= read -r -t 60 ready <"$READY" || [ "$ready" != ready ]; then stop_pid "$ready_pid"; rm -f "$READY"; return 1; fi
  stop_pid "$ready_pid"; rm -f "$READY"
  local bootstrap; bootstrap="$(curl -sS --connect-timeout 5 --max-time 20 -c "$COOKIE" -H "Origin: $ORIGIN" "$BASE/api/bootstrap")"; CAP="$(printf '%s' "$bootstrap" | jq -er '.data.capability')"; printf '%s' "$bootstrap" | jq 'del(.data.capability)' >"$E/bootstrap.json"
}
stop_backend() { stop_pid "$SSE_PID"; SSE_PID=""; stop_pid "$BG_PID"; BG_PID=""; }
api() { local method="$1" route="$2" payload="${3:-}" output="$4"; args=(-sS --connect-timeout 5 --max-time 120 -b "$COOKIE" -H "Origin: $ORIGIN" -H "x-burnguard-capability: $CAP" -X "$method"); [ -z "$payload" ] || args+=(-H 'content-type: application/json' --data-binary "@$payload"); curl "${args[@]}" "$BASE$route" >"$output"; }

bun run scripts/qa/preflight.ts --json >"$E/preflight.json"
start_backend
git rev-parse HEAD >"$E/source-head.txt"; git diff --binary | shasum -a 256 | awk '{print $1}' >"$E/source-diff.sha256"
jq -n '{name:"Task 8 Export Authority",type:"slide_deck",design_system_id:null,backend_id:"codex"}' >"$E/project.payload.json"
api POST /api/projects "$E/project.payload.json" "$E/project.response.json"
PROJECT_ID="$(jq -er '.data.id' "$E/project.response.json")"; SESSION_ID="$(jq -er '.data.session_id' "$E/project.response.json")"; ENTRYPOINT="$(jq -er '.data.entrypoint' "$E/project.response.json")"
curl -sS --connect-timeout 5 --max-time 20 -D "$E/identity.headers" -o "$E/source.html" -b "$COOKIE" -H "Origin: $ORIGIN" -H "x-burnguard-capability: $CAP" "$BASE/api/projects/$PROJECT_ID/fs/$ENTRYPOINT"
REV="$(awk 'tolower($1)=="x-burnguard-revision:"{gsub("\r","");print $2}' "$E/identity.headers")"; DIGEST="$(awk 'tolower($1)=="x-burnguard-artifact-digest:"{gsub("\r","");print $2}' "$E/identity.headers")"

: >"$SSE"; curl -sS --connect-timeout 5 --max-time 1800 -N -b "$COOKIE" -H "Origin: $ORIGIN" -H "x-burnguard-capability: $CAP" "$BASE/api/sessions/$SESSION_ID/stream?after_sequence=0" >"$SSE" & SSE_PID=$!
arm_validated() { local ready="$E/export-arm.fifo" after diagnostics; after="$(awk '/^id:/{value=$2}END{print value+0}' "$SSE")"; OBSERVER_N=$((OBSERVER_N+1)); EVENT_RESULT="$E/export-event-$OBSERVER_N.result"; diagnostics="$E/export-observer-$OBSERVER_N.jsonl"; rm -f "$EVENT_RESULT" "$ready" "$diagnostics"; mkfifo "$ready"; bun "$REPO_ROOT/scripts/qa/task-8-sse-wait.ts" "$BASE/api/sessions/$SESSION_ID/stream?after_sequence=$after" '"type":"export.attempt".*"status":"(validated|failed|cancelled|corrupt)"' "$ready" "$EVENT_RESULT" "$CAP" "$ORIGIN" "$diagnostics" & ARMED_PID=$!; IFS= read -r -t 10 armed <"$ready"; [ "$armed" = ready ]; rm -f "$ready"; }
await_validated() { local event; if ! wait "$ARMED_PID"; then ARMED_PID=""; return 1; fi; ARMED_PID=""; event="$(cat "$EVENT_RESULT")"; [[ "$event" != __BG_SSE_WAITER_ERROR__:* ]]; printf '%s\n' "$event" >>"$E/validated-events.jsonl"; rm -f "$EVENT_RESULT"; }
create_export() { local format="$1" options="$2"; jq -n --arg f "$format" --argjson o "$options" '{format:$f,options:$o}' >"$E/$format-create.payload.json"; arm_validated; api POST "/api/projects/$PROJECT_ID/exports" "$E/$format-create.payload.json" "$E/$format-create.response.json"; await_validated; local id; id="$(jq -er '.data.id' "$E/$format-create.response.json")"; api GET "/api/exports/$id" '' "$E/$format-job.json"; local attempt; attempt="$(jq -er '.data.latest_attempt.id' "$E/$format-job.json")"; cp "$QA_HOME/.burnguard/cache/exports/attempts/$attempt/receipt.json" "$E/$format-receipt.json"; curl -sS --connect-timeout 5 --max-time 60 -D "$E/$format-download.headers" -o "$E/output-$format" -b "$COOKIE" -H "Origin: $ORIGIN" -H "x-burnguard-capability: $CAP" "$BASE/api/exports/$id/download"; jq -e '.data.status=="succeeded" and .data.latest_attempt.status=="validated"' "$E/$format-job.json" >/dev/null; }

create_export pdf '{"pdf_paper":"letter"}'
create_export html_zip '{}'
create_export png '{"png_width":640,"png_height":360,"png_dpr":2}'

uv run --with pymupdf --with pillow python - "$E" <<'PY' >"$E/artifact-validation.json"
import hashlib, json, math, pathlib, sys, zipfile
import pymupdf
from PIL import Image
root=pathlib.Path(sys.argv[1]); out={}
zip_path=root/'output-html_zip'
with zipfile.ZipFile(zip_path) as z:
 names=sorted(z.namelist()); manifest=json.loads(z.read('burnguard-export.json')); out['html']={'entries':len(names),'entrypoint':manifest['entrypoint'],'sha256':hashlib.sha256(zip_path.read_bytes()).hexdigest()}
def metrics(image):
 pixels=list(image.convert('RGBA').get_flattened_data()); visible=[p for p in pixels if p[3]>2]; colors={p[:3] for p in visible}; lum=[round(.2126*r+.7152*g+.0722*b) for r,g,b,a in visible]; mean=sum(lum)/len(lum); variance=sum((v-mean)**2 for v in lum)/len(lum); histogram={v:lum.count(v) for v in set(lum)}; entropy=-sum((n/len(lum))*math.log2(n/len(lum)) for n in histogram.values()); return {'visible':len(visible),'colors':len(colors),'variance':variance,'entropy':entropy}
pdf_path=root/'output-pdf'; doc=pymupdf.open(pdf_path); pages=[]
for number,page in enumerate(doc,1):
 pix=page.get_pixmap(alpha=True); image=Image.frombytes('RGBA',(pix.width,pix.height),pix.samples); image.save(root/f'pdf-page-{number}.png'); pages.append({'width':pix.width,'height':pix.height,**metrics(image)})
out['pdf']={'pages':len(doc),'title':doc.metadata.get('title'),'observations':pages,'sha256':hashlib.sha256(pdf_path.read_bytes()).hexdigest()}
png_path=root/'output-png'; image=Image.open(png_path).convert('RGBA'); stats=metrics(image); out['png']={'width':image.width,'height':image.height,**stats,'sha256':hashlib.sha256(png_path.read_bytes()).hexdigest()}
print(json.dumps(out,sort_keys=True))
PY
jq -e '.html.entries>1 and .pdf.pages>0 and (.pdf.observations|all(.visible>0 and .colors>1 and .variance>0 and .entropy>0)) and .png.width==1280 and .png.height==720 and .png.visible>0 and .png.colors>1 and .png.variance>0 and .png.entropy>0' "$E/artifact-validation.json" >/dev/null
HOME="$QA_HOME" bun -e 'import {Database} from "bun:sqlite";const d=new Database(process.argv[1]);console.log(JSON.stringify(d.query("SELECT e.id,e.format,e.status,a.id attempt_id,a.status attempt_status,a.parent_attempt_id,a.project_revision,a.project_digest,a.output_digest,a.receipt_digest,a.retention_json FROM exports e JOIN export_attempts a ON a.job_id=e.id ORDER BY e.created_at").all()))' "$QA_HOME/.burnguard/burnguard.db" | jq -S . >"$E/export-authority.json"
jq -n --argjson rows "$(cat "$E/export-authority.json")" --argjson validation "$(cat "$E/artifact-validation.json")" --argjson pdf_receipt "$(cat "$E/pdf-receipt.json")" '{application_pdf_raster:($pdf_receipt.validation.pages==3 and ($pdf_receipt.validation.observations|all(.raster_width>0 and .raster_height>0 and .statistics.painted_pixels>0 and .statistics.color_count>1 and .statistics.luminance_variance>0 and .statistics.entropy>0 and .content_bounds!=null))),three_validated:([$rows[]|select(.status=="succeeded" and .attempt_status=="validated")]|length==3),digests:($rows|all(.output_digest!=null and .receipt_digest!=null)),revision_bound:($rows|all(.project_revision>=0 and (.project_digest|length)>0)),artifacts:($validation.html.entries>1 and $validation.pdf.pages>0 and $validation.png.colors>1)}' >"$E/qa-proofs.json"
jq -e '[.[]]|all' "$E/qa-proofs.json" >/dev/null

# Fault scenarios run only after baseline authority and independent artifact parsing pass.
# shellcheck source=task-8-export-faults.sh
source "$REPO_ROOT/scripts/qa/task-8-export-faults.sh"
run_export_fault_matrix
stop_backend
bun -e 'import {parseExportReceipt} from "./packages/backend/src/services/export-receipt";let rejected=false;try{parseExportReceipt({schema_version:1})}catch{rejected=true}if(!rejected)process.exit(1);console.log(JSON.stringify({malformed_receipt_rejected:true}))' >"$E/red-receipt-boundary.stdout" 2>"$E/red-receipt-boundary.stderr"
# shellcheck source=task-8-gates.sh
source "$REPO_ROOT/scripts/qa/task-8-gates.sh"
run_task8_gates
