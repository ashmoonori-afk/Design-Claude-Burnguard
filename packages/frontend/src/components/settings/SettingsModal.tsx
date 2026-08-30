import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  BackendDetectionResult,
  PlaywrightInstallStatus,
  PythonSettings,
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
  getPythonSettings,
  startPlaywrightInstall,
  startPypdfInstall,
} from "@/api/settings";
import { useUIStore } from "@/state/uiStore";

const CHAT_CONTEXT_MODE_LABELS = {
  compact: "간단",
  full: "전체",
} as const;

const THEME_LABELS = {
  light: "밝게",
  dark: "어둡게",
  auto: "시스템 설정",
} as const;

export default function SettingsModal() {
  const open = useUIStore((s) => s.settingsOpen);
  const setOpen = useUIStore((s) => s.setSettingsOpen);
  const pushToast = useUIStore((s) => s.pushToast);
  const queryClient = useQueryClient();

  const [settings, setSettings] = useState<SettingsSummary | null>(null);
  const [detection, setDetection] = useState<BackendDetectionResult | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState<PlaywrightInstallStatus | null>(null);
  const [pwStarting, setPwStarting] = useState(false);
  const pwPollRef = useRef<number | null>(null);
  const [py, setPy] = useState<PythonSettings | null>(null);
  const [pyStarting, setPyStarting] = useState(false);
  const pyPollRef = useRef<number | null>(null);
  // The Figma PAT input is a separate write-only path: GET /api/settings
  // never returns the value, only a figma_token_set boolean. The user
  // types a token here, hits Save, and the field clears.
  const [figmaTokenInput, setFigmaTokenInput] = useState("");
  const [figmaTokenSaving, setFigmaTokenSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      getSettings(),
      detectBackends(),
      getPlaywrightInstallStatus(),
      getPythonSettings().catch(() => null),
    ]).then(([s, d, p, py0]) => {
      setSettings(s);
      setDetection(d);
      setPw(p);
      if (py0) setPy(py0);
    });
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
        title: "Playwright 설치를 시작하지 못했어요",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setPwStarting(false);
    }
  }

  // Mirror of the Playwright polling loop — refreshes the Python status
  // while pip install is running so the tail updates live.
  useEffect(() => {
    if (!open || py?.install.state !== "installing") {
      if (pyPollRef.current != null) {
        window.clearInterval(pyPollRef.current);
        pyPollRef.current = null;
      }
      return;
    }
    if (pyPollRef.current != null) return;
    pyPollRef.current = window.setInterval(async () => {
      try {
        setPy(await getPythonSettings());
      } catch {
        // ignore — next tick retries.
      }
    }, 1500);
    return () => {
      if (pyPollRef.current != null) {
        window.clearInterval(pyPollRef.current);
        pyPollRef.current = null;
      }
    };
  }, [open, py?.install.state]);

  async function handleInstallPypdf() {
    setPyStarting(true);
    try {
      const next = await startPypdfInstall();
      setPy(next);
    } catch (err) {
      pushToast({
        title: "pypdf 설치를 시작하지 못했어요",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setPyStarting(false);
    }
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const next = await patchSettings({
        default_backend: settings.default_backend,
        theme: settings.theme,
        chat_abort_threshold_ms: settings.chat_abort_threshold_ms,
        chat_context_mode: settings.chat_context_mode,
        user: settings.user,
      });
      queryClient.setQueryData(["settings"], next);
      pushToast({ title: "설정을 저장했어요", tone: "success" });
      setOpen(false);
    } catch (err) {
      pushToast({
        title: "설정을 저장하지 못했어요",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveFigmaToken(value: string | null) {
    setFigmaTokenSaving(true);
    try {
      const next = await patchSettings({ figma_personal_access_token: value });
      setSettings(next);
      queryClient.setQueryData(["settings"], next);
      setFigmaTokenInput("");
      pushToast({
        title: value === null ? "Figma 토큰을 지웠어요" : "Figma 토큰을 저장했어요",
        tone: "success",
      });
    } catch (err) {
      pushToast({
        title: "Figma 토큰을 저장하지 못했어요",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    } finally {
      setFigmaTokenSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>설정</DialogTitle>
          <DialogDescription>
            이 컴퓨터에만 저장되는 설정이에요 — <code className="font-mono text-[11px]">~/.burnguard/config.json</code>
          </DialogDescription>
        </DialogHeader>

        {!settings || !detection ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            불러오는 중…
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <label
                htmlFor="display-name"
                className="text-xs font-medium text-muted-foreground"
              >
                표시 이름
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
                내보내기용 Chromium
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
                      title="새로 고침"
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
                        ? "설치하는 중…"
                        : pw?.state === "success"
                          ? "다시 설치"
                          : "Chromium 설치"}
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
                  PDF·PPTX 내보내기에는 Chromium이 필요해요. 서버에서{" "}
                  <code className="font-mono">
                    npx playwright install chromium
                  </code>{" "}
                  를 실행해요. 약 170MB이고 처음 한 번만 받아요.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                업로드용 Python
              </label>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <PyStateDot py={py} />
                  <span className="text-xs">{pyLabel(py)}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="새로 고침"
                      onClick={async () => {
                        try {
                          setPy(await getPythonSettings());
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
                      onClick={handleInstallPypdf}
                      disabled={
                        pyStarting ||
                        py?.install.state === "installing" ||
                        py?.health.python.found === false
                      }
                      title={
                        py?.health.python.found === false
                          ? "먼저 Python 3.10 이상을 설치해 주세요"
                          : undefined
                      }
                    >
                      <Download className="h-3 w-3" />
                      {py?.install.state === "installing"
                        ? "설치하는 중…"
                        : py?.health.pypdf.found
                          ? "pypdf 다시 설치"
                          : "pypdf 설치"}
                    </Button>
                  </div>
                </div>
                {py?.install.tail && py.install.tail.length > 0 && (
                  <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-background px-2 py-1.5 font-mono text-[10px] leading-tight text-muted-foreground">
                    {py.install.tail.slice(-12).join("\n")}
                  </pre>
                )}
                {py?.install.error && py.install.state === "error" && (
                  <p className="mt-2 text-[10px] leading-relaxed text-destructive">
                    {py.install.error}
                  </p>
                )}
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  PDF·PPTX 디자인 시스템 업로드는 Python의{" "}
                  <code className="font-mono">pypdf</code>를 사용해요. 설치는{" "}
                  <code className="font-mono">
                    python -m pip install --user pypdf
                  </code>{" "}
                  를 실행해요. 용량이 작고 처음 한 번만 받아요.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="abort-threshold"
                className="text-xs font-medium text-muted-foreground"
              >
                중단 버튼이 나타나기까지 (초)
              </label>
              <Input
                id="abort-threshold"
                type="number"
                min={0}
                max={3600}
                step={30}
                value={Math.round(settings.chat_abort_threshold_ms / 1000)}
                onChange={(e) => {
                  const raw = Number.parseInt(e.target.value, 10);
                  const clamped = Number.isFinite(raw)
                    ? Math.max(0, Math.min(3600, raw))
                    : 300;
                  setSettings({
                    ...settings,
                    chat_abort_threshold_ms: clamped * 1000,
                  });
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                채팅 턴이 이 시간만큼 이어지면 중단 버튼이 나타나요. 기본값은
                300초(5분)예요. 로컬 CLI가 자주 멈춘다면 줄이고, 초기 실행이
                느린 편이라면 늘려 주세요.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                채팅 컨텍스트
              </label>
              <div className="flex gap-2">
                {(["compact", "full"] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant={
                      settings.chat_context_mode === mode ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() =>
                      setSettings({ ...settings, chat_context_mode: mode })
                    }
                  >
                    {CHAT_CONTEXT_MODE_LABELS[mode]}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                간단 모드는 프로젝트와 디자인 시스템 맥락을 파일 참조로만 넘겨서
                긴 슬라이드 덱 대화를 가볍게 유지해요. 전체 모드는 매 턴 그 내용을
                본문에 그대로 담아요.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Figma 연동
              </label>
              {settings.figma_token_set ? (
                <div className="flex items-center justify-between rounded border border-border px-3 py-2 text-xs">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                    연결됨 — Figma 개인 액세스 토큰이 설정돼 있어요.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={figmaTokenSaving}
                    onClick={() => saveFigmaToken(null)}
                  >
                    연결 해제
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="figd_..."
                    value={figmaTokenInput}
                    onChange={(e) => setFigmaTokenInput(e.target.value)}
                    className="flex-1 font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={
                      figmaTokenSaving || figmaTokenInput.trim().length === 0
                    }
                    onClick={() => saveFigmaToken(figmaTokenInput.trim())}
                  >
                    {figmaTokenSaving ? "저장하는 중…" : "저장"}
                  </Button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Figma 파일에서 공개된 색·텍스트 스타일을 가져올 때 사용해요.
                토큰은 Figma → Settings → Personal access tokens에서 만들 수
                있어요. 값은 이 컴퓨터의 <code className="font-mono">~/.burnguard/config.json</code>{" "}
                에만 저장되고 화면에 다시 표시되지 않아요.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                테마
              </label>
              <div className="flex gap-2">
                {(["light", "dark", "auto"] as const).map((t) => (
                  <Button
                    key={t}
                    variant={settings.theme === t ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSettings({ ...settings, theme: t })}
                  >
                    {THEME_LABELS[t]}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                다크 테마는 2단계에서 제공될 예정이에요.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="pt-2 border-t border-border">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button variant="cta" onClick={save} disabled={saving || !settings}>
            {saving ? "저장하는 중…" : "저장"}
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
  if (!status) return "불러오는 중…";
  switch (status.state) {
    case "installing":
      return "Chromium을 설치하는 중이에요…";
    case "success":
      return "Chromium 설치를 마쳤어요.";
    case "error":
      return "지난 설치가 실패했어요.";
    default:
      return "설치되어 있지 않아요(또는 상태를 알 수 없어요).";
  }
}

function PyStateDot({ py }: { py: PythonSettings | null }) {
  // Collapse the compound (python + pypdf + install) state into the
  // same three colours the Chromium row uses so the two cards read
  // the same at a glance.
  let color = "bg-muted-foreground/40";
  if (py) {
    if (py.install.state === "installing") {
      color = "bg-amber-500 animate-pulse";
    } else if (!py.health.python.found) {
      color = "bg-red-500";
    } else if (py.health.pypdf.found) {
      color = "bg-emerald-500";
    } else if (py.install.state === "error") {
      color = "bg-red-500";
    } else {
      color = "bg-muted-foreground/40";
    }
  }
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function pyLabel(py: PythonSettings | null): string {
  if (!py) return "불러오는 중…";
  if (py.install.state === "installing") return "pypdf를 설치하는 중이에요…";
  if (!py.health.python.found) {
    return "Python을 찾지 못했어요 — Python 3.10 이상을 설치해 주세요.";
  }
  if (py.health.pypdf.found) {
    const ver = py.health.pypdf.version ? ` ${py.health.pypdf.version}` : "";
    return `사용할 수 있어요 — pypdf${ver} (${py.health.python.version ?? "Python"}).`;
  }
  if (py.install.state === "error") return "지난 pypdf 설치가 실패했어요.";
  return "pypdf가 아직 설치되지 않았어요.";
}
