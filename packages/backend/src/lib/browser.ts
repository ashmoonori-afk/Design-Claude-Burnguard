/**
 * Cross-platform "open URL in default browser".
 */
export function openBrowser(url: string): void {
  if (process.env.BG_NO_OPEN === "1") return;

  try {
    if (process.platform === "win32") {
      // `start` is a cmd built-in; the empty "" is the window title arg
      Bun.spawn(["cmd", "/c", "start", "", url], {
        stdout: "ignore",
        stderr: "ignore",
      });
    } else if (process.platform === "darwin") {
      Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
    } else {
      Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" });
    }
  } catch (err) {
    console.warn("[burnguard] could not auto-open browser:", err);
  }
}
