import { describe, expect, test } from "bun:test";
import { activeExportBrowserCount, closeActiveExportBrowsers, registerExportBrowser } from "../src/services/export-browser-registry";
import { armExportQaBarrier, exportQaHooks, releaseExportQaBarrier, waitForExportQaBarrier } from "../src/services/export-qa-barrier";

describe("export browser lifecycle", () => {
  test("Given active Chromium owners When backend shutdown begins Then every exact browser closes once", async () => {
    const closed: string[] = []; const first = registerExportBrowser(async () => { closed.push("first"); }); const second = registerExportBrowser(async () => { closed.push("second"); });
    await closeActiveExportBrowsers(); await closeActiveExportBrowsers(); first.release(); second.release();
    expect(closed.sort()).toEqual(["first", "second"]);
  });

  test("Given a normally closed renderer When shutdown begins Then it is not closed again", async () => {
    let closes = 0; const owner = registerExportBrowser(async () => { closes += 1; }); owner.release(); await closeActiveExportBrowsers(); expect(closes).toBe(0);
  });

  test("Given Chromium graceful close stalls When its deadline expires Then forced close empties ownership", async () => {
    let closes = 0; const owner = registerExportBrowser(async () => { closes += 1; if (closes === 1) await new Promise<void>(() => undefined); }, { gracefulDeadlineMs: 0 });
    await owner.close(); expect(closes).toBe(2); expect(activeExportBrowserCount()).toBe(0);
  });

  test("Given Chromium graceful close fails When forced close succeeds Then cleanup completes and the failure remains loud", async () => {
    const failure = new TypeError("graceful close failed"); let closes = 0; const owner = registerExportBrowser(async () => { closes += 1; if (closes === 1) throw failure; });
    await expect(owner.close()).rejects.toBe(failure); expect(closes).toBe(2); expect(activeExportBrowserCount()).toBe(0);
  });

  test("Given an armed attempt barrier When its exact phase is reached Then observation precedes release", async () => {
    process.env.BG_EXPORT_QA = "1"; const token = "attempt_pause_test"; armExportQaBarrier(token, "after_partial_render", "pause"); const controller = new AbortController(); const hooks = exportQaHooks(token);
    const blocked = hooks.phase?.("attempt-1", "after_partial_render", controller.signal); await expect(waitForExportQaBarrier(token, controller.signal)).resolves.toBe("attempt-1"); expect(releaseExportQaBarrier(token)).toBe("attempt-1"); await blocked;
  });

  test("Given an injected failure barrier When reached Then it fails only its bound attempt", async () => {
    process.env.BG_EXPORT_QA = "1"; const token = "attempt_failure_test"; armExportQaBarrier(token, "after_partial_render", "fail"); const hooks = exportQaHooks(token);
    await expect(hooks.phase?.("attempt-2", "after_partial_render", new AbortController().signal)).rejects.toThrow("injected_failure");
  });
});
