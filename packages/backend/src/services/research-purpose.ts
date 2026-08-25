import type { ProjectType, ResearchProjectPurpose } from "@bg/shared";
import { loadResearchCatalog, type CatalogConfidence, type CatalogPurpose } from "./research-catalog";

const COMMON_BASELINE_IDS = ["CR-001", "CR-002", "CR-003", "CR-004", "CR-005", "CR-008", "CR-009"] as const;
const PPTX_REQUEST_PATTERN = /\b(?:pptx|powerpoint)\b/i;

const INTENT_SELECTORS = [
  { intent: "diagram", purpose: "prototype.diagram", pattern: /\b(?:diagram|flowchart|org(?:anization(?:al)?)? chart|process map|service topology|system topology)\b/i },
  { intent: "dashboard", purpose: "prototype.dashboard", pattern: /\b(?:dashboard|admin console|analytics console)\b/i },
  { intent: "editorial_microsite", purpose: "prototype.editorial", pattern: /\b(?:editorial microsite|editorial site|magazine site|newsletter site)\b/i },
  { intent: "design_sandbox", purpose: "prototype.sandbox", pattern: /\b(?:design sandbox|design-system playground|design system playground|component gallery)\b/i },
  { intent: "landing", purpose: "prototype.landing", pattern: /\b(?:landing page|marketing homepage|marketing site)\b/i },
  { intent: "pitch", purpose: "deck.pitch", pattern: /\b(?:investor pitch|pitch deck|fundrais(?:e|ing))\b/i },
] as const;

type RequestIntent = (typeof INTENT_SELECTORS)[number]["intent"] | "unspecified";
type CreationMode = "blank" | "existing" | "template" | "other";
type ResearchAuthority = "normative_web_constraint" | "sampled_system_guidance" | "research_heuristic";
type ResearchAdvice = "reflow_320_with_2d_exceptions" | "non_color_state_cues" | "target_size_24" | "reduced_motion" | "svg_aria_labelledby_ids" | "pptx_text_first";

type ResearchRouting = {
  readonly project_type: ProjectType;
  readonly request_intent: RequestIntent;
  readonly creation_mode: CreationMode;
  readonly fallback: "common_baseline" | "none";
  readonly purpose: ResearchProjectPurpose | null;
};

type PromptResearchRule = {
  readonly id: string;
  readonly axis: string;
  readonly directive: string;
  readonly rationale: string;
  readonly confidence: CatalogConfidence;
  readonly authority_class: ResearchAuthority;
  readonly source_ids: readonly string[];
};

export type BurnguardResearchContext = {
  readonly schema_version: 1;
  readonly routing: ResearchRouting;
  readonly rules: readonly PromptResearchRule[];
  readonly conflicts: readonly { readonly axis: string; readonly rule_ids: readonly string[]; readonly explanation: string }[];
  readonly advice: readonly ResearchAdvice[];
  readonly output_profile: "web" | "pptx_text_first";
  readonly precedence: readonly ["research", "design_system", "project", "user_request"];
  readonly assembly: "fixed_captured_state";
};

export type ResearchPurposeInput = {
  readonly projectType: ProjectType;
  readonly request: string;
  readonly hasCapturedFiles: boolean;
};

export function buildResearchPromptContext(input: ResearchPurposeInput): BurnguardResearchContext {
  const catalog = loadResearchCatalog();
  const selected = INTENT_SELECTORS.find((selector) => selector.pattern.test(input.request));
  const purpose = selected?.purpose ?? null;
  const purposeRecord = purpose === null ? null : catalog.purposes.find((item) => item.id === purpose) ?? null;
  const commonIds = new Set([...COMMON_BASELINE_IDS, ...(purposeRecord?.common_rule_ids ?? [])]);
  const commonRules: readonly PromptResearchRule[] = catalog.common_rules
    .filter((rule) => commonIds.has(rule.id))
    .map((rule) => ({ id: rule.id, axis: rule.topic, directive: rule.statement, rationale: rule.limitations, confidence: rule.confidence, authority_class: rule.authority_class, source_ids: rule.source_ids }));
  const purposeRules = purposeRecord === null ? [] : promptPurposeRules(purposeRecord);
  const pptx = PPTX_REQUEST_PATTERN.test(input.request);
  const advice: ResearchAdvice[] = ["reflow_320_with_2d_exceptions", "non_color_state_cues", "target_size_24", "reduced_motion"];
  if (purpose === "prototype.diagram") advice.push("svg_aria_labelledby_ids");
  if (pptx) advice.push("pptx_text_first");

  return {
    schema_version: 1,
    routing: {
      project_type: input.projectType,
      request_intent: selected?.intent ?? "unspecified",
      creation_mode: creationMode(input),
      fallback: purpose === null ? "common_baseline" : "none",
      purpose,
    },
    rules: [...commonRules, ...purposeRules],
    conflicts: [],
    advice,
    output_profile: pptx ? "pptx_text_first" : "web",
    precedence: ["research", "design_system", "project", "user_request"],
    assembly: "fixed_captured_state",
  };
}

function creationMode(input: ResearchPurposeInput): CreationMode {
  switch (input.projectType) {
    case "from_template": return "template";
    case "prototype":
    case "slide_deck": return input.hasCapturedFiles ? "existing" : "blank";
    case "other": return "other";
  }
}

function promptPurposeRules(purpose: CatalogPurpose): readonly PromptResearchRule[] {
  return purpose.guidance.map((directive, index) => ({
    id: `${purpose.id}:${index + 1}`,
    axis: `purpose:${index + 1}`,
    directive,
    rationale: purpose.limitations,
    confidence: purpose.confidence,
    authority_class: "research_heuristic",
    source_ids: purpose.source_ids,
  }));
}
