import { readFile, writeFile } from "node:fs/promises";
import { QaInputError } from "./errors";
import type { OwnedProcess } from "./cleanup";

export type CleanupCoordinatorOptions = {
  readonly pid: number;
  readonly requestPath: string;
  readonly acknowledgementPath: string;
};

export function coordinatedOwnedProcess(
  options: CleanupCoordinatorOptions,
): OwnedProcess {
  let exited = false;
  const exitedPromise = readFile(options.acknowledgementPath, "utf8").then((value) => {
    if (value !== "exited\n") {
      throw new QaInputError("invalid_cleanup_ack", "Cleanup acknowledgement is invalid");
    }
    exited = true;
    return 0;
  });
  return {
    pid: options.pid,
    get exitCode() { return exited ? 0 : null; },
    exited: exitedPromise,
    kill: async (signal = "SIGTERM") => {
      if (signal !== "SIGTERM" && signal !== "SIGKILL") {
        throw new QaInputError("invalid_cleanup_signal", "Cleanup signal is unsupported");
      }
      await writeFile(options.requestPath, `${signal}\n`);
    },
  };
}
