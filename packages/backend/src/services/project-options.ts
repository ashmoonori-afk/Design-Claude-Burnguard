import {
  parseDesignBriefV1,
  UpgradeContractError,
  type DesignBriefV1,
} from "@bg/shared";
import { isRecord } from "@bg/shared/contract-parser";

export type ProjectOptions = {
  readonly use_speaker_notes: boolean;
  readonly copy_as_is: boolean;
  readonly design_brief: DesignBriefV1 | null;
};

const DEFAULT_OPTIONS: ProjectOptions = {
  use_speaker_notes: false,
  copy_as_is: false,
  design_brief: null,
};

export function parseProjectOptions(input: unknown): ProjectOptions {
  if (input === undefined || input === null) return DEFAULT_OPTIONS;
  if (!isRecord(input)) {
    throw new UpgradeContractError("expected_object", "options");
  }
  return {
    use_speaker_notes: optionalBoolean(input, "use_speaker_notes"),
    copy_as_is: optionalBoolean(input, "copy_as_is"),
    design_brief:
      input["design_brief"] === undefined
        ? null
        : parseDesignBriefV1(input["design_brief"]),
  };
}

export function parseStoredProjectOptions(
  optionsJson: string | null,
): ProjectOptions {
  if (optionsJson === null) return DEFAULT_OPTIONS;
  try {
    const parsed: unknown = JSON.parse(optionsJson);
    return parseProjectOptions(parsed);
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      error instanceof UpgradeContractError
    ) {
      return DEFAULT_OPTIONS;
    }
    throw error;
  }
}

function optionalBoolean(
  record: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  const value = record[key];
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new UpgradeContractError("invalid_field", `options.${key}`);
  }
  return value;
}
