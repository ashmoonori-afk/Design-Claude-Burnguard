import { appendFile, readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";

const secret = process.env.BG_QA_ADAPTER_SECRET;
const eventPath = process.env.BG_QA_ADAPTER_EVENTS;
const readyFifo = process.env.BG_QA_ADAPTER_READY_FIFO;
const abortFifo = process.env.BG_QA_ADAPTER_ABORT_FIFO;
if (!secret || !eventPath || !readyFifo || !abortFifo) throw new Error("missing owned adapter configuration");

const [sourceFixture, stylesFixture] = await Promise.all([
  readFile(new URL("./fixtures/valid-source.html", import.meta.url)),
  readFile(new URL("./fixtures/valid-source.css", import.meta.url)),
]);
const logoFixture = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#2457d6"/></svg>');
if (sourceFixture.byteLength < 256 || sourceFixture.byteLength > 4_096 || !sourceFixture.includes('href="/styles.css"') || !sourceFixture.includes('src="/brand-logo.svg"')) {
  throw new Error("invalid owned HTML fixture");
}
if (stylesFixture.byteLength < 64 || stylesFixture.byteLength > 2_048 || !stylesFixture.includes("--fixture-brand-primary")) {
  throw new Error("invalid owned CSS fixture");
}
if (logoFixture.byteLength > 1_024) throw new Error("invalid owned logo fixture");

let requestCount = 0;
let abortRecorded = false;

const record = async (event: Readonly<Record<string, string | number | boolean>>): Promise<string> => {
  const serialized = JSON.stringify(event);
  console.log(serialized);
  await appendFile(eventPath, `${serialized}\n`, "utf8");
  return serialized;
};

const send = (response: ServerResponse, status: number, contentType: string, body: string | Buffer): void => {
  response.writeHead(status, { "content-type": contentType, "content-length": Buffer.byteLength(body) });
  response.end(body);
};

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const authorized = request.headers["x-burnguard-qa-adapter-secret"] === secret;
  requestCount += 1;
  await record({ event: "request", path: requestUrl.pathname, authorized, count: requestCount });
  if (!authorized) {
    send(response, 403, "text/plain; charset=utf-8", "forbidden");
    return;
  }

  switch (requestUrl.pathname) {
    case "/source":
      send(response, 200, "text/html; charset=utf-8", sourceFixture);
      return;
    case "/styles.css":
      send(response, 200, "text/css; charset=utf-8", stylesFixture);
      return;
    case "/brand-logo.svg":
      send(response, 200, "image/svg+xml", logoFixture);
      return;
    case "/stall":
      response.once("close", () => {
        if (response.writableEnded || abortRecorded) return;
        abortRecorded = true;
        void record({ event: "client_abort", path: "/stall", observed: true }).then((event) => appendFile(abortFifo, `${event}\n`, "utf8"));
      });
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.write("<!doctype html><html><body>");
      return;
    default:
      send(response, 404, "text/plain; charset=utf-8", "not found");
  }
});

server.listen(0, "127.0.0.1", async () => {
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("adapter address unavailable");
  const event = await record({ event: "ready", port: address.port, source_identity: "qa-adapter:/source" });
  await appendFile(readyFifo, `${event}\n`, "utf8");
});
