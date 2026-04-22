import { Hono } from "hono";
import type { ApiErrorBody, ApiSuccess, DesignSystemDetail } from "@bg/shared";
import { getDesignSystemDetail } from "../db/seed";

function ok<T>(data: T): ApiSuccess<T> {
  return { data };
}

function fail(
  code: string,
  message: string,
  details?: unknown,
): ApiErrorBody {
  return { error: { code, message, details } };
}

export const systemRoutes = new Hono();

systemRoutes.get("/api/design-systems/:id", async (c) => {
  const id = c.req.param("id");
  const system = await getDesignSystemDetail(id);
  if (!system) {
    return c.json(
      fail("design_system_not_found", "Design system not found", { id }),
      404,
    );
  }
  return c.json(ok(system satisfies DesignSystemDetail));
});
