export class ExtractionDomainContractError extends Error {
  readonly name = "ExtractionDomainContractError";
  readonly code = "unknown_discriminant";
  constructor(readonly field: "domain") { super(`unknown_discriminant:${field}`); }
}

export const EXTRACTION_DOMAINS = [
  "token", "typography", "spacing", "border", "layout", "component", "asset",
  "breakpoint", "responsiveness", "animation", "interaction", "accessibility", "state",
] as const;

export type ExtractionDomain = (typeof EXTRACTION_DOMAINS)[number];

export function parseExtractionDomain(input: unknown): ExtractionDomain {
  switch (input) {
    case "token": case "typography": case "spacing": case "border": case "layout":
    case "component": case "asset": case "breakpoint": case "responsiveness":
    case "animation": case "interaction": case "accessibility": case "state": return input;
    default: throw new ExtractionDomainContractError("domain");
  }
}
