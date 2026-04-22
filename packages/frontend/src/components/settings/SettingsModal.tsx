import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import type {
  BackendDetectionResult,
  PlaywrightInstallStatus,
  SettingsSummary,
} from "@bg/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import BackendSelector from "./BackendSelector";
import { detectBackends, getSettings, patchSettings } from "@/api/home";
import {
  getPlaywrightInstallStatus,
  startPlaywrightInstall,
} from "@/api/settings";
import { useUIStore } from "@/state/uiStore";

export default function SettingsModal() {
  const open = useUIStore((s) => s.settingsOpen);
  const setOpen = useUIStore((s) => s.setSettingsOpen);
  const pushToast = useUIStore((s) => s.pushToast);

  const [settings, setSettings] = useState<SettingsSummary | null>(null);
  const [detection, setDetection] = useState<BackendDetectionResult | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState<PlaywrightInstallStatus | null>(null);
  const [pwStarting, setPwStarting] = useState(false);
  const pwPollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    Promise.all([getSettings(), detectBackends(), getPlaywrightInstallStatus()]).then(
      ([s, d, p]) => {
        setSettings(s);
        setDetection(d);
        setPw(p);
      },
    );
  }, [open]);

  // Poll Playwright status while an install is running so the tail updates
  // live without the user reopening the dialog.
  useEffect(() => {
    if (!open || pw?.state !== "installing") {
      if (pwPollRef.current != null) {
        window.clearInterval(pwPollRef.current);
        pwPollRef.current = null;
      }
      return;
    }
    if (pwPollRef.current != null) return;
    pwPollRef.current = window.setInterval(async () => {
      try {
        setPw(await getPlaywrightInstallStatus());
      } catch {
        // ignore — next tick retries.
      }
    }, 1500);
    return () => {
      if (pwPollRef.current != null) {
        window.clearInterval(pwPollRef.current);
        pwPollRef.current = null;
      }
    };
  }, [open, pw?.state]);

  async function handleInstallPlaywright() {
    setPwStarting(true);
    try {
      const next = await startPlaywrightInstall();
      setPw(next);
    } catch (err) {
      pushToast({
        title: "Could not start Playwright install",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setPwStarting(false);
    }
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await patchSettings({
        default_backend: settings.default_backend,
        theme: settings.theme,
        user: settings.user,
      });
      pushToast({ title: "Settings saved", tone: "success" });
      setOpen(false);
    } catch (err) {
      pushToast({
        title: "Could not save settings",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Local preferences — saved to <code className="font-mono text-[11px]">~/.burnguard/config.json</code>
          </DialogDescription>
        </DialogHeader>

        {!settings || !detection ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <label
                htmlFor="display-name"
                className="text-xs font-medium text-muted-foreground"
              >
                Display name
              </label>
              <Input
                id="display-name"
                value={settings.user.display_name}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    user: { ...settings.user, display_name: e.target.value },
                  })
                }
              />
            </div>

            <BackendSelector
              value={settings.default_backend}
              onChange={(b) =>
                setSettings({ ...settings, default_backend: b })
              }
              detection={detection}
            />

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Chromium for exports
              </label>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <PlaywrightStateDot state={pw?.state ?? "idle"} />
                  <span className="text-xs">
                    {pwLabel(pw)}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="Refresh"
                      onClick={async () => {
                        try {
                          setPw(await getPlaywrightInstallStatus());
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleInstallPlaywright}
                      disabled={
                        pwStarting || pw?.state === "installing"
                      }
                    >
                      <Download className="h-3 w-3" />
                      {pw?.state === "installing"
                        ? "Installing…"
                        : pw?.state === "success"
                          ? "Reinstall"
                          : "Install Chromium"}
                    </Button>
                  </div>
                </div>
                {pw?.tail && pw.tail.length > 0 && (
                  <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-background px-2 py-1.5 font-mono text-[10px] leading-tight text-muted-foreground">
                    {pw.tail.slice(-12).join("\n")}
                  </pre>
                )}
                {pw?.error && pw.state === "error" && (
                  <p className="mt-2 text-[10px] leading-relaxed text-destructive">
                    {pw.error}
                  </p>
                )}
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  PDF and PPTX export need a Chromium build. This runs{" "}
                  <code className="font-mono">
                    npx playwright install chromium
                  </code>{" "}
                  on the server. ~170MB download, first run only.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Theme
              </label>
              <div className="flex gap-2">
                {(["light", "dark", "auto"] as const).map((t) => (
                  <Button
                    key={t}
                    variant={settings.theme === t ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSettings({ ...settings, theme: t })}
                  >
                    {t}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Dark theme arrives in Phase 2.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="pt-2 border-t border-border">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="cta" onClick={save} disabled={saving || !settings}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlaywrightStateDot({
  state,
}: {
  state: PlaywrightInstallStatus["state"];
}) {
  const color =
    state === "success"
      ? "bg-emerald-500"
      : state === "installing"
        ? "bg-amber-500 animate-pulse"
        : state === "error"
          ? "bg-red-500"
          : "bg-muted-foreground/40";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function pwLabel(status: PlaywrightInstallStatus | null): string {
  if (!status) return "Loading…";
  switch (status.state) {
    case "installing":
      return "Installing Chromium…";
    case "success":
      return "Chromium install completed.";
    case "error":
      return "Last install failed.";
    default:
      return "Not installed (or status unknown).";
  }
}
