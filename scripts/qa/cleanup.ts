import { rm } from "node:fs/promises";
import { isPortFree } from "./port";

export type CleanupReceipt = {
  readonly processesExited: boolean;
  readonly portsFree: boolean;
  readonly browsersClosed: boolean;
  readonly homesRemoved: boolean;
  readonly repeatedCleanupSafe: boolean;
};

export type Closeable = { readonly close: () => Promise<void> };
export type OwnedProcess = {
  readonly pid: number;
  readonly exited: Promise<number>;
  readonly exitCode: number | null;
  readonly kill: (signal?: number | NodeJS.Signals) => void | Promise<void>;
};
export type CleanupOperations = {
  readonly removeHome: (home: string) => Promise<void>;
  readonly portIsFree: (port: number) => Promise<boolean>;
  readonly exitTimeoutMs?: number;
};

type Tracked<T> = { readonly resource: T; settled: boolean };

type MutableCleanupHistory = {
  processesExited: boolean;
  portsFree: boolean;
  browsersClosed: boolean;
  homesRemoved: boolean;
  repeatedCleanupSafe: boolean;
};

const DEFAULT_OPERATIONS: CleanupOperations = {
  removeHome: async (home) => rm(home, { recursive: true, force: true }),
  portIsFree: isPortFree,
  exitTimeoutMs: 5_000,
};

/** Mutable registry: ownership and monotonic teardown history are its sole responsibility. */
export class OwnedResources {
  readonly #children: Tracked<OwnedProcess>[] = [];
  readonly #ports = new Map<number, boolean>();
  readonly #homes = new Map<string, boolean>();
  readonly #closeables: Tracked<Closeable>[] = [];
  readonly #operations: Required<CleanupOperations>;
  readonly #history: MutableCleanupHistory = {
    processesExited: true,
    portsFree: true,
    browsersClosed: true,
    homesRemoved: true,
    repeatedCleanupSafe: false,
  };
  #runs = 0;

  constructor(operations: CleanupOperations = DEFAULT_OPERATIONS) {
    this.#operations = {
      ...operations,
      exitTimeoutMs: operations.exitTimeoutMs ?? DEFAULT_OPERATIONS.exitTimeoutMs ?? 5_000,
    };
  }

  trackChild(child: Bun.Subprocess, port?: number): void {
    this.trackProcess(child, port);
  }
  trackProcess(process: OwnedProcess, port?: number): void {
    this.#children.push({ resource: process, settled: false });
    if (port !== undefined) this.#ports.set(port, false);
  }
  trackHome(home: string): void { this.#homes.set(home, false); }
  trackBrowser(browser: Closeable): void { this.trackCloseable(browser); }
  trackContext(context: Closeable): void { this.trackCloseable(context); }
  trackPage(page: Closeable): void { this.trackCloseable(page); }
  trackCloseable(closeable: Closeable): void {
    this.#closeables.push({ resource: closeable, settled: false });
  }

  async cleanup(): Promise<CleanupReceipt> {
    this.#runs += 1;
    const closeables = this.#closeables.filter((tracked) => !tracked.settled);
    const closeResults = await Promise.allSettled(
      closeables.map((tracked) => tracked.resource.close()),
    );
    closeResults.forEach((result, index) => {
      const tracked = closeables[index];
      if (result.status === "fulfilled" && tracked !== undefined) tracked.settled = true;
    });
    const children = this.#children.filter((tracked) => !tracked.settled);
    const processResults = await Promise.all(
      children.map((tracked) => this.#terminate(tracked.resource)),
    );
    processResults.forEach((succeeded, index) => {
      const tracked = children[index];
      if (succeeded && tracked !== undefined) tracked.settled = true;
    });
    const homes = [...this.#homes].filter((entry) => !entry[1]);
    const homeResults = await Promise.allSettled(
      homes.map((entry) => this.#operations.removeHome(entry[0])),
    );
    homeResults.forEach((result, index) => {
      const entry = homes[index];
      if (result.status === "fulfilled" && entry !== undefined) this.#homes.set(entry[0], true);
    });
    const ports = [...this.#ports].filter((entry) => !entry[1]);
    const portResults = await Promise.allSettled(
      ports.map((entry) => this.#operations.portIsFree(entry[0])),
    );
    portResults.forEach((result, index) => {
      const entry = ports[index];
      if (result.status === "fulfilled" && result.value && entry !== undefined) {
        this.#ports.set(entry[0], true);
      }
    });
    this.#history.browsersClosed &&= closeResults.every(
      (result) => result.status === "fulfilled",
    );
    this.#history.processesExited &&=
      this.#children.length > 0 && processResults.every(Boolean);
    this.#history.portsFree &&=
      this.#ports.size > 0 && portResults.every(
        (result) => result.status === "fulfilled" && result.value,
      );
    this.#history.homesRemoved &&= homeResults.every(
      (result) => result.status === "fulfilled",
    );
    this.#history.repeatedCleanupSafe = this.#runs > 1;
    return { ...this.#history };
  }

  async #terminate(child: OwnedProcess): Promise<boolean> {
    if (child.exitCode !== null) return true;
    try {
      await child.kill("SIGTERM");
    } catch (error) {
      if (error instanceof Error) return false;
      throw error;
    }
    if (await this.#awaitExit(child)) return true;
    try {
      await child.kill("SIGKILL");
    } catch (error) {
      if (error instanceof Error) return false;
      throw error;
    }
    return await this.#awaitExit(child);
  }

  async #awaitExit(child: OwnedProcess): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), this.#operations.exitTimeoutMs);
    });
    try {
      return await Promise.race([
        child.exited.then(() => true, (error: unknown) => {
          if (error instanceof Error) return false;
          throw error;
        }),
        timeout,
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
