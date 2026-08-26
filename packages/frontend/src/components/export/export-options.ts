import {
  type ExportFormat,
  type ExportOptions,
  type ProjectType,
} from "@bg/shared";
import { parseProjectGraphicCanvas } from "@/lib/graphic-project";

export type ExportMenuOption = {
  readonly key: string;
  readonly format: ExportFormat;
  readonly options?: ExportOptions;
  readonly label: string;
  readonly disabledReason?: "deck_only";
};

export type ExportMenuModel =
  | { readonly ok: true; readonly options: readonly ExportMenuOption[] }
  | {
      readonly ok: false;
      readonly options: readonly [];
      readonly message: string;
    };

export type ExportRetryRequest = {
  readonly format: ExportFormat;
  readonly options?: ExportOptions;
};

export function buildExportRetryRequest(
  projectType: ProjectType,
  format: ExportFormat,
  model: ExportMenuModel,
): ExportRetryRequest | null {
  if (projectType !== "graphic") return { format };
  if (!model.ok) return null;
  const matches = model.options.filter((option) => option.format === format);
  const option = matches.length === 1 ? matches[0] : undefined;
  if (option === undefined || option.options === undefined) return null;
  return { format, options: option.options };
}

const STANDARD_OPTIONS = [
  { key: "html_zip", format: "html_zip", label: "HTML zip" },
  { key: "pdf-a4", format: "pdf", options: { pdf_paper: "a4" }, label: "PDF · A4 landscape" },
  { key: "pdf-letter", format: "pdf", options: { pdf_paper: "letter" }, label: "PDF · Letter landscape" },
  { key: "pdf-widescreen", format: "pdf", options: { pdf_paper: "widescreen-16x9" }, label: "PDF · 16:9 widescreen" },
  { key: "pptx-16x9", format: "pptx", options: { pptx_size: "16x9" }, label: "PowerPoint · 16:9" },
  { key: "pptx-4x3", format: "pptx", options: { pptx_size: "4x3" }, label: "PowerPoint · 4:3" },
  { key: "handoff", format: "handoff", label: "Developer handoff (.zip)" },
] as const satisfies readonly ExportMenuOption[];

export function buildExportMenuModel(
  projectType: ProjectType,
  optionsJson: string | null,
): ExportMenuModel {
  if (projectType !== "graphic") {
    return {
      ok: true,
      options: projectType === "slide_deck"
        ? STANDARD_OPTIONS
        : STANDARD_OPTIONS.map((option) =>
            option.format === "pdf" || option.format === "pptx"
              ? { ...option, disabledReason: "deck_only" as const }
              : option,
          ),
    };
  }
  const canvas = parseProjectGraphicCanvas(projectType, optionsJson);
  if (canvas === null) {
    return {
      ok: false,
      options: [],
      message: "저장된 그래픽 크기를 확인할 수 없어 PNG 내보내기를 시작할 수 없어요.",
    };
  }
  return {
    ok: true,
    options: [{
      key: "graphic-png",
      format: "png",
      options: {
        png_width: canvas.width,
        png_height: canvas.height,
        png_dpr: 1,
      },
      label: `PNG · ${canvas.width}×${canvas.height}`,
    }],
  };
}
