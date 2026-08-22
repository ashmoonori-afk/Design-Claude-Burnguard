import { createServer } from "node:net";

type PortProbeServer = ReturnType<typeof createServer> & {
  once(
    event: "error" | "listening",
    listener: (...args: unknown[]) => void,
  ): PortProbeServer;
  close(callback?: (error?: Error) => void): void;
};

export async function pickPort(start = 14070, end = 14170): Promise<number> {
  for (let p = start; p <= end; p++) {
    if (await isFree(p)) return p;
  }
  throw new Error(`No free port in range ${start}-${end}`);
}

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer() as unknown as PortProbeServer;
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}
