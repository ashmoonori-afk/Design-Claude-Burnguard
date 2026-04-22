export type PlaywrightInstallState =
  | "idle"
  | "installing"
  | "success"
  | "error";

export interface PlaywrightInstallStatus {
  state: PlaywrightInstallState;
  started_at: number | null;
  finished_at: number | null;
  exit_code: number | null;
  error: string | null;
  /** Tail of stdout+stderr lines (most recent last). Capped server-side. */
  tail: string[];
}
