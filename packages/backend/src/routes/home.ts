import { Hono } from "hono";
import type {
  ApiErrorBody,
  ApiMeta,
  ApiSuccess,
  BackendDetectionResult,
  CreateProjectRequest,
  DesignSystemStatus,
  SettingsSummary,
} from "@bg/shared";
import { APP_VERSION } from "@bg/shared";
import { ensureConfig, loadConfig, saveConfig } from "../config";
import {
  createProjectRecord,
  listHomeDesignSystems,
  listHomeProjects,
} from "../db/seed";
import { detectBackends } from "../services/backends";
import { ensureProjectWatcher } from "../services/watchers";

const VALID_PROJECT_TABS = new Set(["recent", "mine", "examples"]);
const VALID_SYSTEM_STATUSES = new Set<DesignSystemStatus>([
  "draft",
  "review",
  "published",
]);

function ok<T>(data: T, meta?: ApiMeta): ApiSuccess<T> {
  return meta ? { data, meta } : { data };
}

function fail(
  code: string,
  message: string,
  details?: unknown,
): ApiErrorBody {
  return { error: { code, message, details } };
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProjectType(value: unknown): value is CreateProjectRequest["type"] {
  return (
    value === "prototype" ||
    value === "slide_deck" ||
    value === "from_template" ||
    value === "other"
  );
}

function isBackendId(value: unknown): value is CreateProjectRequest["backend_id"] {
  return value === "claude-code" || value === "codex";
}

function isTheme(value: unknown): value is SettingsSummary["theme"] {
  return value === "light" || value === "dark" || value === "auto";
}

function toSettingsSummary(config: Awaited<ReturnType<typeof loadConfig>>): SettingsSummary {
  return {
    user: {
      id: config.user.id,
      display_name: config.user.displayName,
    },
    app_version: APP_VERSION,
    default_backend: config.defaultBackend,
    theme: config.theme,
  };
}

export const homeRoutes = new Hono();

homeRoutes.get("/api/projects", async (c) => {
  const tab = c.req.query("tab") ?? "recent";
  if (!VALID_PROJECT_TABS.has(tab)) {
    return c.json(
      fail("invalid_tab", "Unsupported project tab", { tab }),
      400,
    );
  }

  const limit = parseNumber(c.req.query("limit"), 50);
  const offset = parseNumber(c.req.query("offset"), 0);
  const result = await listHomeProjects(tab, limit, offset);
  return c.json(ok(result.items, { total: result.total, limit, offset }));
});

homeRoutes.get("/api/design-systems", async (c) => {
  const status = (c.req.query("status") ?? "published") as DesignSystemStatus;
  if (!VALID_SYSTEM_STATUSES.has(status)) {
    return c.json(
      fail("invalid_status", "Unsupported design system status", { status }),
      400,
    );
  }

  const systems = await listHomeDesignSystems(status);
  return c.json(ok(systems, { total: systems.length }));
});

homeRoutes.post("/api/projects", async (c) => {
  const body = await c.req.json<unknown>();
  if (!isRecord(body)) {
    return c.json(fail("invalid_body", "Expected a JSON object request body"), 400);
  }

  const { name, type, design_system_id, backend_id } = body;
  if (typeof name !== "string" || name.trim().length === 0) {
    return c.json(
      fail("invalid_name", "Project name is required", { name }),
      400,
    );
  }
  if (!isProjectType(type)) {
    return c.json(fail("invalid_type", "Unsupported project type", { type }), 400);
  }
  if (!(design_system_id === null || typeof design_system_id === "string")) {
    return c.json(
      fail("invalid_design_system", "design_system_id must be string or null"),
      400,
    );
  }
  if (!isBackendId(backend_id)) {
    return c.json(
      fail("invalid_backend", "Unsupported backend id", { backend_id }),
      400,
    );
  }

  const response = await createProjectRecord({
    name: name.trim(),
    type,
    designSystemId: design_system_id,
    backendId: backend_id,
    optionsJson: body.options ? JSON.stringify(body.options) : null,
    entrypoint: type === "slide_deck" ? "deck.html" : "index.html",
    thumbnailPath: null,
  });
  await ensureProjectWatcher(response.id);

  return c.json(ok(response), 201);
});

homeRoutes.get("/api/backends/detect", async (c) => {
  c.header("Cache-Control", "private, max-age=30");
  return c.json(ok((await detectBackends()) as BackendDetectionResult));
});

homeRoutes.get("/api/settings", async (c) => {
  const config = await ensureConfig();
  return c.json(ok(toSettingsSummary(config)));
});

homeRoutes.patch("/api/settings", async (c) => {
  const patch = await c.req.json<unknown>();
  if (!isRecord(patch)) {
    return c.json(fail("invalid_body", "Expected a JSON object request body"), 400);
  }

  const config = await ensureConfig();
  if ("theme" in patch) {
    if (!isTheme(patch.theme)) {
      return c.json(fail("invalid_theme", "Unsupported theme value"), 400);
    }
    config.theme = patch.theme;
  }
  if ("default_backend" in patch) {
    if (!isBackendId(patch.default_backend)) {
      return c.json(
        fail("invalid_backend", "Unsupported default backend"),
        400,
      );
    }
    config.defaultBackend = patch.default_backend;
  }
  if ("user" in patch) {
    if (!isRecord(patch.user)) {
      return c.json(fail("invalid_user", "user patch must be an object"), 400);
    }
    if (
      "display_name" in patch.user &&
      typeof patch.user.display_name === "string" &&
      patch.user.display_name.trim()
    ) {
      config.user.displayName = patch.user.display_name.trim();
    }
  }

  await saveConfig(config);
  return c.json(ok(toSettingsSummary(config)));
});
