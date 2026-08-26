import {
  UpgradeContractError,
  decodeContract,
  parseGraphicCanvasV1,
  type GraphicCanvasV1,
  type ProjectType,
} from "@bg/shared";

export function parseProjectGraphicCanvas(
  projectType: ProjectType,
  optionsJson: string | null,
): GraphicCanvasV1 | null {
  if (projectType !== "graphic") return null;
  try {
    return parseGraphicCanvasV1(decodeContract(optionsJson)["graphic_canvas"]);
  } catch (error) {
    if (error instanceof UpgradeContractError) return null;
    throw error;
  }
}
