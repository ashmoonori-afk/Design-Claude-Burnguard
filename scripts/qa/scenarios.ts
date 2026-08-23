import type { BrowserContext, Page } from "../../packages/backend/node_modules/playwright-core";
import type { SanitizedAction } from "./manifest";

export type ScenarioContext = {
  readonly baseUrl: string;
  readonly evidenceDirectory: string;
  readonly browserContext: BrowserContext;
  readonly page: Page;
};

export type ScenarioResult = {
  readonly actions: readonly SanitizedAction[];
  readonly backendDetected: boolean;
};

export type Scenario = (context: ScenarioContext) => Promise<ScenarioResult>;

async function taskOne(context: ScenarioContext): Promise<ScenarioResult> {
  await context.page.goto(context.baseUrl, { waitUntil: "domcontentloaded" });
  const result = await context.page.evaluate(async () => {
    const bootstrap = await fetch("/api/bootstrap");
    const bootstrapBody: unknown = await bootstrap.json();
    const authorityReady =
      bootstrap.ok &&
      typeof bootstrapBody === "object" &&
      bootstrapBody !== null &&
      "data" in bootstrapBody &&
      typeof bootstrapBody.data === "object" &&
      bootstrapBody.data !== null &&
      "capability" in bootstrapBody.data &&
      typeof bootstrapBody.data.capability === "string" &&
      bootstrapBody.data.capability.length > 0;
    const backends = await fetch("/api/backends/detect");
    const backendBody: unknown = await backends.json();
    const backendDetected =
      backends.ok &&
      typeof backendBody === "object" &&
      backendBody !== null &&
      "data" in backendBody &&
      typeof backendBody.data === "object" &&
      backendBody.data !== null &&
      "backends" in backendBody.data &&
      Array.isArray(backendBody.data.backends) &&
      backendBody.data.backends.some(
        (backend: unknown) =>
          typeof backend === "object" &&
          backend !== null &&
          "found" in backend &&
          backend.found === true,
      );
    return { authorityReady, backendDetected };
  });
  const { authorityReady, backendDetected } = result;
  const screenshot = "task-1-app.png";
  await context.page.screenshot({
    path: `${context.evidenceDirectory}/${screenshot}`,
    fullPage: true,
  });
  return {
    backendDetected,
    actions: [
      { kind: "assert", name: "same-origin-bootstrap-authority", passed: authorityReady },
      { kind: "assert", name: "supported-backend-detected", passed: backendDetected },
      { kind: "navigate", name: "real-app", passed: true },
      { kind: "screenshot", name: "real-app", passed: true, artifact: screenshot },
    ],
  };
}

export const SCENARIOS = new Map<string, Scenario>([["task-1", taskOne]]);
