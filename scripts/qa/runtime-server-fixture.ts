#!/usr/bin/env bun
import { createServer } from "node:http";

const port = Number(process.argv[2]);
const readinessLine = process.argv[3];
if (!Number.isSafeInteger(port) || readinessLine === undefined) process.exit(2);
const capability = "runtime-smoke-capability";
const server = createServer((request, response) => {
  const origin = `http://${request.headers.host ?? ""}`;
  if (request.url !== "/api/bootstrap" || request.headers.origin !== origin) {
    response.writeHead(403).end("rejected");
    return;
  }
  response.writeHead(200, {
    "Content-Type": "application/json",
    "Set-Cookie": `burnguard_capability=${capability}; HttpOnly; Path=/api`,
  });
  response.end(JSON.stringify({ data: { capability } }));
});
server.listen(port, "127.0.0.1", () => console.log(readinessLine));
