import type { ProjectType } from "@bg/shared";
import { renderPrototype } from "./prototype";
import { renderSlideDeck, type SlideDeckOptions } from "./slide-deck";

export interface TemplateContext {
  name: string;
  type: ProjectType;
  options?: SlideDeckOptions;
}

export function renderInitialArtifact(ctx: TemplateContext): string {
  switch (ctx.type) {
    case "slide_deck":
      return renderSlideDeck(ctx.name, ctx.options ?? {});
    case "prototype":
    case "from_template":
    case "other":
    default:
      return renderPrototype(ctx.name);
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
