import { describe, expect, test } from "bun:test";
import { homeRoutes } from "../src/routes/home";

type ErrorEnvelope = {
  readonly error: {
    readonly code: string;
    readonly details?: unknown;
  };
};

function errorEnvelope(value: unknown): ErrorEnvelope {
  if (
    typeof value !== "object" ||
    value === null ||
    !("error" in value) ||
    typeof value.error !== "object" ||
    value.error === null ||
    !("code" in value.error) ||
    typeof value.error.code !== "string"
  ) {
    throw new Error("Expected an error envelope");
  }
  return { error: { code: value.error.code } };
}

async function createProject(body: unknown): Promise<Response> {
  return homeRoutes.request("http://local/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("home project input boundary", () => {
  test.each([
    [{}, "invalid_name"],
    [
      {
        name: "Project",
        type: "graphic",
        design_system_id: null,
        backend_id: "claude-code",
      },
      "invalid_type",
    ],
    [
      {
        name: "Project",
        type: "prototype",
        design_system_id: 7,
        backend_id: "claude-code",
      },
      "invalid_design_system",
    ],
    [
      {
        name: "Project",
        type: "prototype",
        design_system_id: null,
        backend_id: "unknown",
      },
      "invalid_backend",
    ],
    [
      {
        name: "Project",
        type: "prototype",
        design_system_id: null,
        backend_id: "claude-code",
        options: { design_brief: { schema_version: 1 } },
      },
      "invalid_project_options",
    ],
  ])("Given malformed project input When posted Then the boundary returns its error code", async (body, code) => {
    const response = await createProject(body);
    const error = errorEnvelope(await response.json());
    expect(response.status).toBe(400);
    expect(error.error.code).toBe(code);
  });
});
