import { useEffect, useState } from "react";
import type { BackendDetectionResult, SettingsSummary } from "@bg/shared";
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

  useEffect(() => {
    if (!open) return;
    Promise.all([getSettings(), detectBackends()]).then(([s, d]) => {
      setSettings(s);
      setDetection(d);
    });
  }, [open]);

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
