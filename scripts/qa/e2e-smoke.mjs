#!/usr/bin/env node
// End-to-end smoke for the BurnGuard core loop, driven from Node with
// playwright-core and a real Chrome/Edge channel.
//
// Why Node and not Bun: on Windows the Playwright transport never
// connects under Bun (see doc/08-review-and-improvement-plan-2026-09-02.md,
// T3), so the driver runs on Node while the backend under test still runs
// on Bun exactly as users run it.
//
// Usage:  node scripts/qa/e2e-smoke.mjs [--port 14173] [--channel chrome|msedge]
//                                       [--shots <dir>] [--keep-home]
// Exit code 0 when every scenario passes, 1 otherwise. Prints a JSON
// summary on the last line so CI can parse it.

import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port ?? 14173);
const CHANNEL = args.channel ?? "chrome";
const SHOTS = path.resolve(args.shots ?? path.join(tmpdir(), "burnguard-e2e-shots"));
const BASE = `http://127.0.0.1:${PORT}`;
const READY = `[burnguard] listening on ${BASE}`;
const FIXTURE_PROJECT = "Portfolio Playground";
const SCENARIO_TIMEOUT_MS = 120_000;
let backendLog = "";

const { chromium } = await import(
  pathToFileURL(path.join(repoRoot, "packages", "backend", "node_modules", "playwright-core", "index.mjs")).href
);

const results = [];
let backend = null;
let browser = null;
let home = null;
/** Set once the page exists so a failing scenario can capture what it saw. */
let failurePage = null;

try {
  await mkdir(SHOTS, { recursive: true });
  home = await mkdtemp(path.join(tmpdir(), "burnguard-e2e-home-"));
  backend = await startBackend(home);
  browser = await chromium.launch({ headless: true, channel: CHANNEL });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  failurePage = page;
  await installProbes(page);

  await scenario("home-loads", async () => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "최근" }).waitFor({ timeout: 20_000 });
    for (const name of ["내 디자인", "예제", "디자인 시스템"]) {
      await page.getByRole("tab", { name }).waitFor({ timeout: 5_000 });
    }
    await shot(page, "01-home");
  });

  let projectUrl = null;
  await scenario("open-example-project", async () => {
    // The seeded "Portfolio Playground" fixture is a plain project (no
    // tutorial tag), so it lives on the 최근 tab, not on 예제.
    await page.getByRole("tab", { name: "최근" }).click();
    const card = page.locator("a[href^='/projects/']").filter({ hasText: FIXTURE_PROJECT }).first();
    await card.waitFor({ timeout: 20_000 });
    await card.click();
    await page.waitForURL(/\/projects\/[^/?]+/, { timeout: 20_000 });
    projectUrl = page.url();
    await waitForArtifactFrame(page);
    for (const label of ["선택", "스타일", "코멘트", "편집", "그리기", "품질 점검"]) {
      await modeButton(page, label).waitFor({ timeout: 10_000 });
    }
    await shot(page, "02-project");
  });

  await scenario("edit-mode-save", async () => {
    await modeButton(page, "편집").click();
    // The canvas is a sandboxed srcdoc frame, which a driver cannot reliably
    // query from the outside, so the click is aimed by geometry and the
    // assertions read the srcdoc attribute instead of the frame's DOM.
    const box = await canvasBox(page);
    const panel = page.locator("aside").last();
    const textarea = panel.locator("textarea").first();
    // Only elements the harness annotated are editable, and where they land
    // depends on the fixture and on font loading, so sweep the canvas instead
    // of assuming one point hits.
    let opened = false;
    for (const fy of [0.25, 0.4, 0.12, 0.55, 0.7, 0.85]) {
      for (const fx of [0.5, 0.3, 0.7]) {
        await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
        opened = await textarea.waitFor({ timeout: 1_500 }).then(() => true, () => false);
        if (opened) break;
      }
      if (opened) break;
    }
    if (!opened) throw new Error("edit panel never opened for any canvas position");
    const before = await textarea.inputValue();
    const marker = ` E2E-${Date.now().toString(36)}`;
    await textarea.fill(before + marker);
    await panel.getByRole("button", { name: /저장/ }).first().click();
    await expectNoErrorToast(page, /저장하지 못했어요|편집을 저장하지 못했어요/);
    // The patch has to reach the managed file, and the canvas has to show it
    // without a manual refresh. Assert the file first: that is what "save"
    // means, and it tells a canvas-refresh regression apart from a lost write.
    const projectId = new URL(page.url()).pathname.split("/")[2];
    await waitFor(async () => {
      const res = await page.request.get(`${BASE}/api/projects/${projectId}/fs/index.html`);
      return res.ok() && (await res.text()).includes(marker.trim());
    }, 15_000, "edit did not reach the managed file");
    await waitFor(
      async () => (await canvasSrcDoc(page)).includes(marker.trim()),
      45_000,
      "edited text did not appear in the canvas",
    );
    await shot(page, "03-edit-saved");
  });

  await scenario("comment-pin-create", async () => {
    await modeButton(page, "코멘트").click();
    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
    await expectNoErrorToast(page, /코멘트를 만들지 못했어요/);
    const panel = page.locator("aside").last();
    await panel.locator("textarea[placeholder='메모를 남겨 보세요...']").first().waitFor({ timeout: 20_000 });
    // The pin has to exist server-side, not only in React state.
    const projectId = new URL(page.url()).pathname.split("/")[2];
    await waitFor(async () => {
      const res = await page.request.get(`${BASE}/api/projects/${projectId}/comments`);
      if (!res.ok()) return false;
      const body = await res.json();
      return Array.isArray(body?.data) && body.data.length > 0;
    }, 10_000, "comment pin was not persisted");
    await shot(page, "04-comment-pin");
  });

  await scenario("draw-stroke-persists", async () => {
    await modeButton(page, "그리기").click();
    const box = await canvasBox(page);
    const x0 = box.x + box.width * 0.3;
    const y0 = box.y + box.height * 0.6;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) await page.mouse.move(x0 + i * 20, y0 + i * 6);
    await page.mouse.up();
    await expectNoErrorToast(page, /그리기를 저장하지 못했어요/);
    const projectId = new URL(page.url()).pathname.split("/")[2];
    await waitFor(async () => {
      const res = await page.request.get(`${BASE}/api/projects/${projectId}/draws/index.html`);
      const svg = await res.text();
      return res.ok() && /<(path|polyline|line|rect)/.test(svg);
    }, 10_000, "draw sidecar did not contain a stroke");
    await shot(page, "05-draw");
  });

  await scenario("delete-project", async () => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "최근" }).click();
    const card = page.locator("a[href^='/projects/']").filter({ hasText: FIXTURE_PROJECT }).first();
    await card.waitFor({ timeout: 20_000 });
    await card.hover();
    await page.getByRole("button", { name: `${FIXTURE_PROJECT} 옵션 메뉴` }).click();
    await page.getByRole("menuitem", { name: /삭제/ }).click();
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await expectNoErrorToast(page, /삭제하지 못했어요/);
    await waitFor(async () => (await card.count()) === 0, 15_000, "deleted card still visible");
    await shot(page, "06-deleted");
  });
} catch (error) {
  results.push({ name: "harness", ok: false, error: String(error?.stack ?? error) });
} finally {
  if (browser) await browser.close().catch(() => {});
  if (backend) await stopBackend(backend);
  if (home && !args["keep-home"]) await rm(home, { recursive: true, force: true }).catch(() => {});
}

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name} (${r.ms ?? 0} ms)${r.ok ? "" : `  — ${r.error.split("\n")[0]}`}`);
}
await writeFile(path.join(SHOTS, "backend.log"), backendLog).catch(() => {});
console.log(`shots: ${SHOTS}`);
console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, failed: failed.length, results }));
process.exit(failed.length === 0 ? 0 : 1);

// ---------------------------------------------------------------- helpers

async function scenario(name, run) {
  const started = Date.now();
  try {
    await Promise.race([
      run(),
      sleep(SCENARIO_TIMEOUT_MS).then(() => { throw new Error(`scenario timed out after ${SCENARIO_TIMEOUT_MS} ms`); }),
    ]);
    results.push({ name, ok: true, ms: Date.now() - started });
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(error?.stack ?? error) });
    await shot(failurePage, `fail-${name}`);
  }
}

async function startBackend(homeDir) {
  const env = {
    ...process.env,
    USERPROFILE: homeDir,
    HOME: homeDir,
    BG_PORT: String(PORT),
    BG_NO_OPEN: "1",
  };
  const child = spawn("bun", ["run", "src/index.ts"], {
    cwd: path.join(repoRoot, "packages", "backend"),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  let ready = false;
  child.stdout.on("data", (chunk) => {
    backendLog += chunk;
    if (backendLog.includes(READY)) ready = true;
  });
  child.stderr.on("data", (chunk) => { backendLog += chunk; });
  const deadline = Date.now() + 90_000;
  while (!ready && Date.now() < deadline && child.exitCode === null) await sleep(250);
  if (!ready) throw new Error(`backend did not become ready on ${BASE}\n${backendLog.slice(-2_000)}`);
  return child;
}

async function stopBackend(child) {
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true });
      killer.on("exit", resolve);
      killer.on("error", resolve);
    });
  } else {
    child.kill("SIGTERM");
  }
  await sleep(1_000);
}

async function installProbes(page) {
  await page.addInitScript(() => {
    window.__bgToasts = [];
    const seen = new WeakSet();
    const observer = new MutationObserver(() => {
      for (const node of document.querySelectorAll("div.fixed.bottom-4.right-4 > div")) {
        if (seen.has(node)) continue;
        seen.add(node);
        window.__bgToasts.push(node.innerText);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

async function expectNoErrorToast(page, pattern) {
  await sleep(1_200);
  const toasts = await page.evaluate(() => window.__bgToasts ?? []);
  const hit = toasts.find((t) => pattern.test(t));
  if (hit) throw new Error(`error toast: ${hit.replace(/\n/g, " | ")}`);
}

/**
 * Canvas mode buttons only. "코멘트" also names a tab in the chat pane, so the
 * bare role query is ambiguous; scope it to the canvas toolbar above the
 * iframe.
 */
function modeButton(page, label) {
  return page.locator("div").filter({ has: page.getByRole("button", { name: "품질 점검", exact: true }) }).last()
    .getByRole("button", { name: label, exact: true });
}

/** The artifact HTML currently mounted in the canvas, or "" when there is none. */
async function canvasSrcDoc(page) {
  return (await page.locator("iframe").first().getAttribute("srcdoc").catch(() => null)) ?? "";
}

async function canvasBox(page) {
  const box = await page.locator("iframe").first().boundingBox();
  if (!box) throw new Error("canvas iframe has no bounding box");
  return box;
}

async function waitForArtifactFrame(page) {
  // Generous on purpose: the first project opened after a fresh install shares
  // the backend with background thumbnail renders, and on a host where
  // Chromium cannot launch those burn their full timeout before the cooldown
  // engages.
  await waitFor(
    async () => (await canvasSrcDoc(page)).includes("data-bg-node-id"),
    90_000,
    "artifact frame did not render annotated content",
  );
}

async function waitFor(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(300);
  }
  throw new Error(message);
}

async function shot(page, name) {
  if (!page) return;
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {});
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key.slice(2)] = true;
    else { out[key.slice(2)] = next; i += 1; }
  }
  return out;
}
