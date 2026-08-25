import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const [command, dbPath, exportRoot, jobId, argument] = process.argv.slice(2);
if (command === undefined || dbPath === undefined || exportRoot === undefined) throw new TypeError("command db exportRoot required");
const db = new Database(dbPath);
try {
  if (command === "inspect") console.log(JSON.stringify(db.query(`SELECT e.id job_id,e.project_id,e.format,e.status job_status,e.output_path,e.size_bytes,e.options_json,a.* FROM exports e JOIN export_attempts a ON a.job_id=e.id WHERE (? IS NULL OR e.id=?) ORDER BY a.created_at`).all(jobId ?? null, jobId ?? null)));
  else if (command === "expire") db.prepare("UPDATE export_attempts SET retention_json=? WHERE job_id=? AND status='validated'").run(JSON.stringify({ retained_until: 1, output_available: true }), required(jobId));
  else if (command === "mutate") await mutate(required(jobId), required(argument));
  else if (command === "seed-states") await seedStates(required(jobId));
  else throw new TypeError(`unknown command ${command}`);
} finally { db.close(); }

async function mutate(id: string, kind: string): Promise<void> {
  const row = db.query<{ id: string; output_path: string }, [string]>("SELECT a.id,e.output_path FROM exports e JOIN export_attempts a ON a.job_id=e.id WHERE e.id=? AND a.status='validated'").get(id);
  if (row === null) throw new TypeError("validated attempt required"); const root = path.dirname(row.output_path);
  if (kind === "row") db.prepare("UPDATE export_attempts SET output_digest=? WHERE id=?").run("0".repeat(64), row.id);
  else if (["receipt", "validation", "pdf_cross_field", "project_id", "parent", "options_authority", "provenance", "png_option_mismatch"].includes(kind)) { const file = path.join(root, "receipt.json"); const receipt = JSON.parse(await readFile(file, "utf8"));
    if (kind === "receipt") receipt.project.digest = "0".repeat(64); else if (kind === "validation") receipt.validation.extra = true; else if (kind === "project_id") receipt.project.id = "forged-project"; else if (kind === "parent") receipt.parent_attempt_id = "forged-parent"; else if (kind === "provenance") { receipt.digests.input_closure = "1".repeat(64); receipt.digests.design_system = "2".repeat(64); receipt.digests.renderer = "3".repeat(64); receipt.digests.capture = "4".repeat(64); } else if (kind === "options_authority") { receipt.options.png_width += 1; receipt.digests.options = sha(canonical(receipt.options)); receipt.validation.width += 1; receipt.validation.statistics.pixels = receipt.validation.width * receipt.validation.height; } else if (kind === "png_option_mismatch") receipt.validation.width += 1; else { const observation = receipt.validation.observations[0]; observation.statistics = { pixels: 80_000, visible_pixels: 10, painted_pixels: 80_000, differing_pixels: 10, color_count: 32_768, dominant_ratio: 0, luminance_variance: 12.5, entropy: 0.3 }; observation.raster_width = 400; observation.raster_height = 200; observation.content_bounds = null; } await writeFile(file, canonical(receipt)); }
  else if (kind === "output") { const file = row.output_path; const bytes = new Uint8Array(await readFile(file)); bytes[Math.floor(bytes.length / 2)] ^= 1; await writeFile(file, bytes); }
  else throw new TypeError("unknown mutation");
}

async function seedStates(sourceJobId: string): Promise<void> {
  const source = db.query<Source, [string]>(`SELECT e.project_id,e.format,e.options_json,a.id attempt_id,a.project_revision,a.project_digest,a.design_system_digest,a.options_digest,a.input_closure_digest,a.renderer_digest,a.capture_digest,e.output_path
    FROM exports e JOIN export_attempts a ON a.job_id=e.id WHERE e.id=? AND a.status='validated'`).get(sourceJobId);
  if (source === null) throw new TypeError("validated source required"); const now = Date.now();
  for (const [index, status] of ["pending", "running", "validating", "retrying", "recovering"].entries()) {
    const job = `qa-state-${status}`; const attempt = `${job}-attempt`; const stage = path.join(exportRoot, ".staging", attempt); const published = path.join(exportRoot, "attempts", attempt);
    db.prepare("INSERT INTO exports(id,project_id,format,status,options_json,created_at) VALUES (?,?,?,'pending',?,?)").run(job, source.project_id, source.format, source.options_json, now + index);
    db.prepare(`INSERT INTO export_attempts(id,job_id,parent_attempt_id,status,progress_json,project_revision,project_digest,canonical_options_json,options_digest,input_closure_digest,design_system_digest,renderer_digest,capture_digest,output_digest,receipt_digest,findings_json,retention_json,created_at,updated_at)
      VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?,?,NULL,NULL,'[]',?,?,?)`).run(attempt, job, status, JSON.stringify({ stage: status === "pending" || status === "retrying" ? "queued" : status === "running" ? "rendering" : "validating", completed: status === "pending" || status === "retrying" ? 0 : status === "running" ? 2 : 3, total: 6 }), source.project_revision, source.project_digest, source.options_json, source.options_digest, source.input_closure_digest, source.design_system_digest, source.renderer_digest, source.capture_digest, JSON.stringify({ retained_until: now + 60_000, output_available: false }), now + index, now + index);
    if (status === "running") { await mkdir(path.join(stage, "render"), { recursive: true }); await writeFile(path.join(stage, "render", "partial"), "partial"); }
    if (status === "validating" || status === "recovering") await cloneAuthority(source, job, attempt, status === "validating" ? stage : published);
  }
}

async function cloneAuthority(source: Source, job: string, attempt: string, destination: string): Promise<void> {
  const sourceRoot = path.dirname(source.output_path); await rm(destination, { recursive: true, force: true }); await cp(sourceRoot, destination, { recursive: true });
  const receiptPath = path.join(destination, "receipt.json"); const receipt = JSON.parse(await readFile(receiptPath, "utf8")); receipt.job_id = job; receipt.attempt_id = attempt; receipt.parent_attempt_id = null;
  const output = new Uint8Array(await readFile(path.join(destination, receipt.output_file))); receipt.digests.output = sha(output); receipt.output_size = output.length; const receiptText = canonical(receipt); await writeFile(receiptPath, receiptText);
  db.prepare("UPDATE export_attempts SET output_digest=?,receipt_digest=? WHERE id=?").run(receipt.digests.output, sha(receiptText), attempt);
}
type Source = { project_id: string; format: string; options_json: string; attempt_id: string; project_revision: number; project_digest: string; design_system_digest: string | null; options_digest: string; input_closure_digest: string; renderer_digest: string; capture_digest: string; output_path: string };
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`).join(",")}}`; return JSON.stringify(value); }
function sha(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function required(value: string | undefined): string { if (value === undefined) throw new TypeError("missing argument"); return value; }
