import { createServer } from "node:net";

export async function pickPort(start = 14070, end = 14170): Promise<number> {
  for (let p = start; p <= end; p++) {
    if (await isFree(p)) return p;
  }
  throw new Error(`No free port in range ${start}-${end}`);
}

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}
